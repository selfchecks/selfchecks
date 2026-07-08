import { type Queue } from "bullmq";

import { getRunEnvironment } from "@selfchecks/cli/environment";
import { type CheckType } from "@selfchecks/core";
import { prisma, type CheckRunStatus as PrismaCheckRunStatus } from "@selfchecks/db";

import { type CheckJob } from "./jobs.js";

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
  logger = console,
  now = new Date(),
  queue,
}: ScheduleDueChecksOptions): Promise<ScheduleDueChecksSummary> {
  const cancelledRuns = await cancelStaleActiveRuns({
    logger,
    now,
    queuedRunTimeoutMinutes: config.queuedRunTimeoutMinutes,
    runningRunTimeoutMinutes: config.runningRunTimeoutMinutes,
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

  try {
    const [queued, running] = await Promise.all([
      prisma.checkRun.updateMany({
        data: {
          errorMessage: `Run was cancelled after waiting in queue for ${queuedRunTimeoutMinutes} minutes.`,
          finishedAt: now,
          status: "CANCELLED",
        },
        where: {
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
      running: running.count,
    };
  } catch (error) {
    logger.warn("Unable to cancel stale scheduled runs.", error);

    return {
      queued: 0,
      running: 0,
    };
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
