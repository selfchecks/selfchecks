import { spawn } from "node:child_process";

import { type Job } from "bullmq";

import {
  runCheckById,
  runChecks,
  TestSessionTimeoutError,
  type CheckRunSource,
  type EnvVar,
  type RunChecksSummary,
} from "@selfchecks/cli/runner";
import { type CheckDefinition, type CheckType } from "@selfchecks/core";
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

export type CheckJob = RunCheckJob | TestSessionJob;

export type CheckJobResult = {
  checkKey: string;
  checkName: string;
  durationMs: number;
  runId?: string;
  status: string;
};

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
): Promise<CheckJobResult | RunChecksSummary> {
  if ("kind" in job.data && job.data.kind === "test-session") {
    return handleTestSessionJob(job as Pick<Job<TestSessionJob>, "data">);
  }

  return handleCheckJob(job as Pick<Job<RunCheckJob>, "data">);
}

export async function handleTestSessionJob(
  job: Pick<Job<TestSessionJob>, "data">,
): Promise<RunChecksSummary> {
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

    return await runChecks({
      checkKeys: data.checkKeys,
      checks: data.checks,
      env: data.env,
      existingRunIds: data.existingRunIds,
      existingTestSessionId: data.sessionId,
      projectSlug: data.projectSlug,
      record: true,
      reporter: data.reporter,
      retries: data.retries,
      rootDir: data.rootDir,
      runMode: "test",
      tagSets: data.tagSets,
      testSessionDeadline: deadline,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const finishedAt = new Date();
    const timedOut = error instanceof TestSessionTimeoutError;
    const status = timedOut ? "TIMED_OUT" : "FAILED";

    await prisma.$transaction([
      prisma.testSession.update({
        data: {
          status,
        },
        where: {
          id: data.sessionId,
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
            in: ["QUEUED", "RUNNING"],
          },
          testSessionId: data.sessionId,
        },
      }),
    ]);

    throw error;
  }
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
