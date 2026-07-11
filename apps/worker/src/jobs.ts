import { spawn } from "node:child_process";

import { type Job, type Queue } from "bullmq";

import {
  runCheckById,
  runTestSessionCheck,
  TestSessionTimeoutError,
  type CheckRunSource,
  type EnvVar,
} from "@selfchecks/cli/runner";
import {
  summarizeTerminalRunStatuses,
  type CheckDefinition,
  type CheckType,
} from "@selfchecks/core";
import { prisma } from "@selfchecks/db";

import { readPerformanceRuntimeSettings } from "./performance-settings.js";

export type RunCheckJob = {
  checkId: string;
  checkKey: string;
  env?: EnvVar[];
  projectSlug: string;
  reporter?: string;
  rootDir: string;
  runId?: string;
  runSource?: CheckRunSource;
  type: CheckType;
};

export type TestSessionJob = {
  checkKeys: string[];
  checks: CheckDefinition[];
  env: EnvVar[];
  existingRunIds: Record<string, string>;
  kind: "test-session";
  projectSlug: string;
  reporter: string;
  retries?: number;
  rootDir: string;
  sessionId: string;
  tagSets: string[][];
};

export type TestSessionCheckJob = {
  check: CheckDefinition;
  env: EnvVar[];
  existingRunId: string;
  kind: "test-session-check";
  projectSlug: string;
  reporter: string;
  retries?: number;
  rootDir: string;
  sessionId: string;
  testSessionDeadline: TestSessionDeadline;
};

export type CheckJob = RunCheckJob | TestSessionCheckJob | TestSessionJob;

export type CheckJobQueue = Pick<Queue<CheckJob>, "addBulk">;

export type CheckJobResult = {
  checkKey: string;
  checkName: string;
  durationMs: number;
  runId?: string;
  status: string;
};

export type TestSessionJobResult = {
  queued: number;
  sessionId: string;
};

const TEST_SESSION_JOB_PRIORITY = 10;
const activeRunStatuses = ["QUEUED", "RUNNING"] as const;

export async function handleCheckJob(
  job: Pick<Job<RunCheckJob>, "data">,
): Promise<CheckJobResult> {
  console.log(
    `Running ${job.data.type} check ${job.data.checkKey} for ${job.data.projectSlug}`,
  );

  try {
    return await runCheckById({
      checkId: job.data.checkId,
      env: job.data.env ?? [],
      projectSlug: job.data.projectSlug,
      record: true,
      reporter: job.data.reporter ?? "list",
      rootDir: job.data.rootDir,
      runId: job.data.runId,
      runSource: job.data.runSource,
    });
  } catch (error) {
    if (job.data.runId) {
      await prisma.checkRun.update({
        data: {
          errorMessage: error instanceof Error ? error.message : String(error),
          finishedAt: new Date(),
          status: "FAILED",
        },
        where: {
          id: job.data.runId,
        },
      });
    }

    throw error;
  }
}

export async function handleSelfchecksJob(
  job: Pick<Job<CheckJob>, "data">,
  queue: CheckJobQueue,
): Promise<CheckJobResult | TestSessionJobResult> {
  if ("kind" in job.data && job.data.kind === "test-session") {
    return handleTestSessionJob(job as Pick<Job<TestSessionJob>, "data">, queue);
  }

  if ("kind" in job.data && job.data.kind === "test-session-check") {
    return handleTestSessionCheckJob(job as Pick<Job<TestSessionCheckJob>, "data">);
  }

  return handleCheckJob(job as Pick<Job<RunCheckJob>, "data">);
}

export async function handleTestSessionJob(
  job: Pick<Job<TestSessionJob>, "data">,
  queue: CheckJobQueue,
): Promise<TestSessionJobResult> {
  const { data } = job;

  console.log(
    `Running test session ${data.sessionId} with ${data.checks.length} checks for ${data.projectSlug}`,
  );

  const performanceSettings = await readPerformanceRuntimeSettings({
    projectSlug: data.projectSlug,
  });
  const timeoutMs = performanceSettings.testSessionTimeoutMinutes * 60_000;
  const deadline = {
    at: Date.now() + timeoutMs,
    timeoutMs,
  };

  try {
    await installTestSessionDependencies(data.rootDir, data.checks, deadline);
    await queue.addBulk(
      data.checks.map((check) => {
        const existingRunId = data.existingRunIds[check.key];

        if (!existingRunId) {
          throw new Error(`Queued run for check ${check.key} was not found.`);
        }

        return {
          data: {
            check,
            env: data.env,
            existingRunId,
            kind: "test-session-check" as const,
            projectSlug: data.projectSlug,
            reporter: data.reporter,
            retries: data.retries,
            rootDir: data.rootDir,
            sessionId: data.sessionId,
            testSessionDeadline: deadline,
          },
          name: "run-test-session-check",
          opts: {
            jobId: existingRunId,
            priority: TEST_SESSION_JOB_PRIORITY,
          },
        };
      }),
    );

    return {
      queued: data.checks.length,
      sessionId: data.sessionId,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const timedOut = error instanceof TestSessionTimeoutError;
    const status = timedOut ? "TIMED_OUT" : "FAILED";

    await markTestSessionRuns(data.sessionId, errorMessage, status);

    throw error;
  }
}

export async function handleTestSessionCheckJob(
  job: Pick<Job<TestSessionCheckJob>, "data">,
): Promise<CheckJobResult> {
  const { data } = job;
  const existingRun = await prisma.checkRun.findUnique({
    select: {
      checkSnapshotKey: true,
      checkSnapshotName: true,
      durationMs: true,
      id: true,
      status: true,
      testSessionId: true,
    },
    where: {
      id: data.existingRunId,
    },
  });

  if (!existingRun || existingRun.testSessionId !== data.sessionId) {
    throw new Error(
      `Run ${data.existingRunId} was not found in test session ${data.sessionId}.`,
    );
  }

  if (existingRun.status !== "QUEUED") {
    await finalizeTestSession(data.sessionId);

    return {
      checkKey: existingRun.checkSnapshotKey ?? data.check.key,
      checkName: existingRun.checkSnapshotName ?? data.check.name,
      durationMs: existingRun.durationMs ?? 0,
      runId: existingRun.id,
      status: existingRun.status.toLowerCase(),
    };
  }

  console.log(
    `Running ${data.check.type} check ${data.check.key} for test session ${data.sessionId}`,
  );

  try {
    return await runTestSessionCheck({
      check: data.check,
      env: data.env,
      existingRunId: data.existingRunId,
      existingTestSessionId: data.sessionId,
      projectSlug: data.projectSlug,
      reporter: data.reporter,
      retries: data.retries,
      rootDir: data.rootDir,
      testSessionDeadline: data.testSessionDeadline,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (error instanceof TestSessionTimeoutError) {
      await markTestSessionRuns(data.sessionId, errorMessage, "TIMED_OUT");
    } else {
      await prisma.checkRun.updateMany({
        data: {
          errorMessage,
          finishedAt: new Date(),
          status: "FAILED",
        },
        where: {
          id: data.existingRunId,
          status: {
            in: [...activeRunStatuses],
          },
        },
      });
    }

    throw error;
  } finally {
    await finalizeTestSession(data.sessionId);
  }
}

async function markTestSessionRuns(
  sessionId: string,
  errorMessage: string,
  status: "FAILED" | "TIMED_OUT",
) {
  const finishedAt = new Date();

  await prisma.$transaction([
    prisma.testSession.update({
      data: {
        status,
      },
      where: {
        id: sessionId,
      },
    }),
    prisma.checkRun.updateMany({
      data: {
        errorMessage,
        finishedAt,
        status,
      },
      where: {
        status: {
          in: [...activeRunStatuses],
        },
        testSessionId: sessionId,
      },
    }),
  ]);
}

export async function finalizeTestSession(sessionId: string): Promise<void> {
  const activeRun = await prisma.checkRun.findFirst({
    select: {
      id: true,
    },
    where: {
      status: {
        in: [...activeRunStatuses],
      },
      testSessionId: sessionId,
    },
  });

  if (activeRun) {
    return;
  }

  const runs = await prisma.checkRun.findMany({
    orderBy: [
      {
        createdAt: "asc",
      },
      {
        attempt: "asc",
      },
    ],
    select: {
      attempt: true,
      checkSnapshotKey: true,
      id: true,
      status: true,
    },
    where: {
      testSessionId: sessionId,
    },
  });

  const finalRuns = new Map<string, (typeof runs)[number]>();

  runs.forEach((run) => {
    const key = run.checkSnapshotKey ?? run.id;
    const current = finalRuns.get(key);

    if (!current || run.attempt >= current.attempt) {
      finalRuns.set(key, run);
    }
  });

  const status = summarizeTerminalRunStatuses(
    [...finalRuns.values()].map((run) => run.status),
  );

  if (!status) {
    return;
  }

  await prisma.testSession.updateMany({
    data: {
      status,
    },
    where: {
      id: sessionId,
      kind: "TEST",
      runs: {
        none: {
          status: {
            in: [...activeRunStatuses],
          },
        },
      },
      status: {
        in: [...activeRunStatuses],
      },
    },
  });
}

async function installTestSessionDependencies(
  rootDir: string,
  checks: CheckDefinition[],
  deadline: TestSessionDeadline,
) {
  await runCommand(
    "npm",
    ["install", "--omit=dev", "--no-audit", "--no-fund"],
    rootDir,
    deadline,
  );

  if (checks.some((check) => check.type === "browser")) {
    await runCommand("npx", ["playwright", "install", "chromium"], rootDir, deadline);
  }
}

type TestSessionDeadline = {
  at: number;
  timeoutMs: number;
};

async function runCommand(
  command: string,
  args: string[],
  rootDir: string,
  deadline: TestSessionDeadline,
) {
  const remainingMs = getRemainingSessionTimeMs(deadline);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      detached: process.platform !== "win32",
      env: process.env,
      stdio: "inherit",
    });
    let killTimer: NodeJS.Timeout | undefined;
    let settled = false;
    let timedOut = false;
    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      signalChildProcess(child, "SIGTERM");

      if (!settled) {
        killTimer = setTimeout(() => signalChildProcess(child, "SIGKILL"), 5000);
        killTimer.unref?.();
      }
    }, remainingMs);
    timeoutTimer.unref?.();

    function settle(error?: Error) {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeoutTimer);

      if (killTimer) {
        clearTimeout(killTimer);
      }

      if (error) {
        reject(error);
      } else {
        resolve();
      }
    }

    child.once("error", (error) => settle(error));
    child.once("close", (exitCode) => {
      if (timedOut) {
        settle(new TestSessionTimeoutError(deadline.timeoutMs));
        return;
      }

      if (exitCode === 0) {
        settle();
        return;
      }

      settle(new Error(`${command} ${args.join(" ")} failed with status ${exitCode}.`));
    });
  });
}

function getRemainingSessionTimeMs(deadline: TestSessionDeadline): number {
  const remainingMs = deadline.at - Date.now();

  if (remainingMs <= 0) {
    throw new TestSessionTimeoutError(deadline.timeoutMs);
  }

  return remainingMs;
}

function signalChildProcess(child: ReturnType<typeof spawn>, signal: NodeJS.Signals) {
  if (process.platform !== "win32" && typeof child.pid === "number") {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {
      // Fall back to the direct child when process group signalling is unavailable.
    }
  }

  child.kill(signal);
}
