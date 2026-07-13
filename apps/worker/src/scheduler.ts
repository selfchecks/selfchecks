import { unlink } from "node:fs/promises";

import { type Queue } from "bullmq";

import { getRunEnvironment } from "@selfchecks/cli/environment";
import {
  defaultBrowserRunTimeoutMs,
  defaultPerformanceSettings,
  type CheckType,
} from "@selfchecks/core";
import { prisma, type CheckRunStatus as PrismaCheckRunStatus } from "@selfchecks/db";

import { finalizeTestSession, type CheckJob } from "./jobs.js";
import { readPerformanceRuntimeSettings } from "./performance-settings.js";

type LatestRun = {
  createdAt: Date;
  status: PrismaCheckRunStatus;
};

type ScheduledCheck = {
  deployment: {
    source: string | null;
  } | null;
  frequencyMinutes: number | null;
  id: string;
  key: string;
  project: {
    slug: string;
  };
  runs: LatestRun[];
  type: string;
};

export type CheckSchedulerConfig = {
  checksRoot?: string;
  pollIntervalMs: number;
  queuedRunTimeoutMinutes: number;
  reporter: string;
  runningRunTimeoutMinutes: number;
};

export type CheckSchedulerOptions = {
  config: CheckSchedulerConfig;
  logger?: Pick<Console, "error" | "log" | "warn">;
  queue: Pick<Queue<CheckJob>, "add">;
};

export type ScheduleDueChecksOptions = CheckSchedulerOptions & {
  deleteFile?: (filePath: string) => Promise<void>;
  now?: Date;
};

export type ScheduleDueChecksSummary = {
  active: number;
  cancelledQueued: number;
  cancelledRunning: number;
  failed: number;
  missingRoot: number;
  notDue: number;
  queued: number;
  scanned: number;
  skipped: number;
};

const activeRunStatuses = new Set<PrismaCheckRunStatus>(["QUEUED", "RUNNING"]);
const activeSessionStatuses: PrismaCheckRunStatus[] = ["QUEUED", "RUNNING"];
const TEST_SESSION_FINALIZATION_GRACE_MS = 60_000;

export class CheckScheduler {
  private running = false;
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly options: CheckSchedulerOptions) {}

  start(): void {
    if (this.timer) {
      return;
    }

    void this.tick();
    this.timer = setInterval(() => {
      void this.tick();
    }, this.options.config.pollIntervalMs);
  }

  close(): void {
    if (!this.timer) {
      return;
    }

    clearInterval(this.timer);
    this.timer = undefined;
  }

  async runOnce(now = new Date()): Promise<ScheduleDueChecksSummary> {
    if (this.running) {
      this.options.logger?.warn(
        "Skipping scheduled check scan because one is running.",
      );

      return {
        active: 0,
        cancelledQueued: 0,
        cancelledRunning: 0,
        failed: 0,
        missingRoot: 0,
        notDue: 0,
        queued: 0,
        scanned: 0,
        skipped: 0,
      };
    }

    this.running = true;

    try {
      return await scheduleDueChecks({
        ...this.options,
        now,
      });
    } catch (error) {
      this.options.logger?.error("Scheduled check scan failed.", error);

      return {
        active: 0,
        cancelledQueued: 0,
        cancelledRunning: 0,
        failed: 1,
        missingRoot: 0,
        notDue: 0,
        queued: 0,
        scanned: 0,
        skipped: 0,
      };
    } finally {
      this.running = false;
    }
  }

  private async tick(): Promise<void> {
    const summary = await this.runOnce();

    this.options.logger?.log(formatScheduleSummary(summary));
  }
}

export async function scheduleDueChecks({
  config,
  deleteFile = unlink,
  logger = console,
  now = new Date(),
  queue,
}: ScheduleDueChecksOptions): Promise<ScheduleDueChecksSummary> {
  const performanceSettings = await readPerformanceRuntimeSettings({
    fallback: {
      ...defaultPerformanceSettings,
      queuedRunTimeoutMinutes: config.queuedRunTimeoutMinutes,
      runningRunTimeoutMinutes: config.runningRunTimeoutMinutes,
    },
    logger,
  });
  const cancelledRuns = await cancelStaleActiveRuns({
    logger,
    now,
    queuedRunTimeoutMinutes: performanceSettings.queuedRunTimeoutMinutes,
    runningRunTimeoutMinutes: performanceSettings.runningRunTimeoutMinutes,
  });

  await reconcileTerminalTestSessions({ logger, now });

  await cleanupExpiredRunData({
    artifactRetentionDays: performanceSettings.artifactRetentionDays,
    deleteFile,
    historyRetentionDays: performanceSettings.historyRetentionDays,
    logger,
    now,
  });

  const checks = await prisma.check.findMany({
    include: {
      deployment: {
        select: {
          source: true,
        },
      },
      project: {
        select: {
          slug: true,
        },
      },
      runs: {
        orderBy: {
          createdAt: "desc",
        },
        select: {
          createdAt: true,
          status: true,
        },
        take: 1,
      },
    },
    where: {
      enabled: true,
      frequencyMinutes: {
        gt: 0,
      },
    },
  });
  const summary: ScheduleDueChecksSummary = {
    active: 0,
    cancelledQueued: cancelledRuns.queued,
    cancelledRunning: cancelledRuns.running,
    failed: 0,
    missingRoot: 0,
    notDue: 0,
    queued: 0,
    scanned: checks.length,
    skipped: 0,
  };

  for (const check of checks) {
    const dueState = getCheckDueState(check, now);

    if (dueState === "active") {
      summary.active += 1;
      summary.skipped += 1;
      continue;
    }

    if (dueState === "not-due") {
      summary.notDue += 1;
      summary.skipped += 1;
      continue;
    }

    const rootDir = resolveRootDir(config.checksRoot, check.deployment?.source);

    if (!rootDir) {
      summary.missingRoot += 1;
      summary.skipped += 1;
      logger.warn(
        `Skipping scheduled check ${check.key} because source root is unknown.`,
      );
      continue;
    }

    const run = await prisma.checkRun.create({
      data: {
        checkId: check.id,
        runSource: "SCHEDULE",
        status: "QUEUED",
      },
      select: {
        id: true,
      },
    });

    try {
      const env = await getRunEnvironment(check.project.slug);

      await queue.add(
        "run-check",
        {
          checkId: check.id,
          checkKey: check.key,
          env,
          projectSlug: check.project.slug,
          reporter: config.reporter,
          rootDir,
          runId: run.id,
          runSource: "SCHEDULE",
          type: toCheckType(check.type),
        },
        {
          jobId: run.id,
        },
      );
      summary.queued += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      summary.failed += 1;
      await prisma.checkRun.update({
        data: {
          errorMessage: message,
          finishedAt: now,
          status: "FAILED",
        },
        where: {
          id: run.id,
        },
      });
      logger.error(`Unable to queue scheduled check ${check.key}.`, error);
    }
  }

  return summary;
}

async function cleanupExpiredRunData({
  artifactRetentionDays,
  deleteFile,
  historyRetentionDays,
  logger,
  now,
}: {
  artifactRetentionDays: number;
  deleteFile: (filePath: string) => Promise<void>;
  historyRetentionDays: number;
  logger: Pick<Console, "warn">;
  now: Date;
}): Promise<void> {
  const artifactCutoff = new Date(
    now.getTime() - artifactRetentionDays * 24 * 60 * 60_000,
  );
  const historyCutoff = new Date(
    now.getTime() - historyRetentionDays * 24 * 60 * 60_000,
  );

  try {
    const artifacts = await prisma.artifact.findMany({
      select: {
        id: true,
        path: true,
      },
      where: {
        createdAt: {
          lt: artifactCutoff,
        },
      },
    });

    await deleteRecordedFiles(
      artifacts.map((artifact) => artifact.path),
      deleteFile,
      logger,
    );

    if (artifacts.length > 0) {
      await prisma.artifact.deleteMany({
        where: {
          id: {
            in: artifacts.map((artifact) => artifact.id),
          },
        },
      });
    }
  } catch (error) {
    logger.warn("Unable to clean expired test artifacts.", error);
  }

  try {
    const runs = await prisma.checkRun.findMany({
      select: {
        artifacts: {
          select: {
            path: true,
          },
        },
        id: true,
        logsPath: true,
      },
      where: {
        createdAt: {
          lt: historyCutoff,
        },
        status: {
          notIn: ["QUEUED", "RUNNING"],
        },
      },
    });

    await deleteRecordedFiles(
      runs.flatMap((run) => [
        run.logsPath,
        ...run.artifacts.map((artifact) => artifact.path),
      ]),
      deleteFile,
      logger,
    );

    if (runs.length > 0) {
      await prisma.checkRun.deleteMany({
        where: {
          id: {
            in: runs.map((run) => run.id),
          },
        },
      });
    }
  } catch (error) {
    logger.warn("Unable to clean expired test history.", error);
  }
}

async function deleteRecordedFiles(
  paths: Array<string | null | undefined>,
  deleteFile: (filePath: string) => Promise<void>,
  logger: Pick<Console, "warn">,
): Promise<void> {
  for (const filePath of new Set(paths.filter(isNonEmptyString))) {
    try {
      await deleteFile(filePath);
    } catch (error) {
      if (!isFileNotFoundError(error)) {
        logger.warn(`Unable to delete expired test artifact file ${filePath}.`, error);
      }
    }
  }
}

function isNonEmptyString(value: string | null | undefined): value is string {
  return Boolean(value?.trim());
}

function isFileNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

function getCheckDueState(
  check: ScheduledCheck,
  now: Date,
): "active" | "due" | "not-due" {
  if (!check.frequencyMinutes || check.frequencyMinutes <= 0) {
    return "not-due";
  }

  const latestRun = check.runs[0];

  if (!latestRun) {
    return "due";
  }

  if (activeRunStatuses.has(latestRun.status)) {
    return "active";
  }

  return latestRun.createdAt.getTime() + check.frequencyMinutes * 60_000 <=
    now.getTime()
    ? "due"
    : "not-due";
}

async function cancelStaleActiveRuns({
  logger,
  now,
  queuedRunTimeoutMinutes,
  runningRunTimeoutMinutes,
}: {
  logger: Pick<Console, "warn">;
  now: Date;
  queuedRunTimeoutMinutes: number;
  runningRunTimeoutMinutes: number;
}): Promise<{ queued: number; running: number }> {
  const queuedCutoff = new Date(now.getTime() - queuedRunTimeoutMinutes * 60_000);
  const runningCutoff = new Date(now.getTime() - runningRunTimeoutMinutes * 60_000);
  const browserRunFallbackCutoff = new Date(now.getTime() - defaultBrowserRunTimeoutMs);

  try {
    const timedOut = await prisma.checkRun.updateMany({
      data: {
        errorMessage: "Browser run timed out after its configured deadline.",
        finishedAt: now,
        status: "TIMED_OUT",
      },
      where: {
        AND: [
          {
            OR: [
              {
                checkSnapshotType: "BROWSER",
              },
              {
                check: {
                  is: {
                    type: "BROWSER",
                  },
                },
              },
            ],
          },
          {
            OR: [
              {
                timeoutAt: {
                  lte: now,
                },
              },
              {
                startedAt: {
                  lt: browserRunFallbackCutoff,
                },
                timeoutAt: null,
              },
              {
                createdAt: {
                  lt: browserRunFallbackCutoff,
                },
                startedAt: null,
                timeoutAt: null,
              },
            ],
          },
        ],
        status: "RUNNING",
        testSession: {
          is: {
            kind: "TEST",
          },
        },
      },
    });
    const [queued, running] = await Promise.all([
      prisma.checkRun.updateMany({
        data: {
          errorMessage: `Run was cancelled after waiting in queue for ${queuedRunTimeoutMinutes} minutes.`,
          finishedAt: now,
          status: "CANCELLED",
        },
        where: {
          OR: [
            {
              testSessionId: null,
            },
            {
              testSession: {
                is: {
                  kind: {
                    not: "TEST",
                  },
                },
              },
            },
          ],
          createdAt: {
            lt: queuedCutoff,
          },
          status: "QUEUED",
        },
      }),
      prisma.checkRun.updateMany({
        data: {
          errorMessage: `Run was cancelled after running for ${runningRunTimeoutMinutes} minutes without completion.`,
          finishedAt: now,
          status: "CANCELLED",
        },
        where: {
          OR: [
            {
              startedAt: {
                lt: runningCutoff,
              },
            },
            {
              createdAt: {
                lt: runningCutoff,
              },
              startedAt: null,
            },
          ],
          status: "RUNNING",
        },
      }),
    ]);

    return {
      queued: queued.count,
      running: running.count + timedOut.count,
    };
  } catch (error) {
    logger.warn("Unable to cancel stale scheduled runs.", error);

    return {
      queued: 0,
      running: 0,
    };
  }
}

async function reconcileTerminalTestSessions({
  logger,
  now,
}: {
  logger: Pick<Console, "warn">;
  now: Date;
}): Promise<void> {
  const finishedBefore = new Date(now.getTime() - TEST_SESSION_FINALIZATION_GRACE_MS);

  try {
    const sessions = await prisma.testSession.findMany({
      select: {
        id: true,
      },
      where: {
        kind: "TEST",
        runs: {
          none: {
            OR: [
              {
                status: {
                  in: activeSessionStatuses,
                },
              },
              {
                finishedAt: null,
              },
              {
                finishedAt: {
                  gte: finishedBefore,
                },
              },
            ],
          },
          some: {},
        },
        status: {
          in: activeSessionStatuses,
        },
      },
    });

    await Promise.all(sessions.map((session) => finalizeTestSession(session.id)));
  } catch (error) {
    logger.warn("Unable to reconcile terminal test sessions.", error);
  }
}

function formatScheduleSummary(summary: ScheduleDueChecksSummary): string {
  return [
    "selfchecks scheduler scan:",
    `scanned=${summary.scanned}`,
    `queued=${summary.queued}`,
    `skipped=${summary.skipped}`,
    `notDue=${summary.notDue}`,
    `active=${summary.active}`,
    `missingRoot=${summary.missingRoot}`,
    `failed=${summary.failed}`,
    `cancelledQueued=${summary.cancelledQueued}`,
    `cancelledRunning=${summary.cancelledRunning}`,
  ].join(" ");
}

function resolveRootDir(
  checksRoot: string | undefined,
  deploymentSource: string | null | undefined,
): string | undefined {
  return checksRoot?.trim() || deploymentSource?.trim() || undefined;
}

function toCheckType(type: string): CheckType {
  return type.toLowerCase() as CheckType;
}
