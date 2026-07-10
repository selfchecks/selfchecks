import { spawn } from "node:child_process";

import { type Job } from "bullmq";

import {
  runCheckById,
  runChecks,
  type CheckRunSource,
  type EnvVar,
  type RunChecksSummary,
} from "@selfchecks/cli/runner";
import { type CheckDefinition, type CheckType } from "@selfchecks/core";
import { prisma } from "@selfchecks/db";

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

  try {
    await installTestSessionDependencies(data.rootDir, data.checks);

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
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const finishedAt = new Date();

    await prisma.$transaction([
      prisma.testSession.update({
        data: {
          status: "FAILED",
        },
        where: {
          id: data.sessionId,
        },
      }),
      prisma.checkRun.updateMany({
        data: {
          errorMessage,
          finishedAt,
          status: "FAILED",
        },
        where: {
          id: {
            in: Object.values(data.existingRunIds),
          },
          status: "QUEUED",
        },
      }),
    ]);

    throw error;
  }
}

async function installTestSessionDependencies(
  rootDir: string,
  checks: CheckDefinition[],
) {
  await runCommand(
    "npm",
    ["install", "--omit=dev", "--no-audit", "--no-fund"],
    rootDir,
  );

  if (checks.some((check) => check.type === "browser")) {
    await runCommand("npx", ["playwright", "install", "chromium"], rootDir);
  }
}

async function runCommand(command: string, args: string[], rootDir: string) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      env: process.env,
      stdio: "inherit",
    });

    child.once("error", reject);
    child.once("close", (exitCode) => {
      if (exitCode === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} failed with status ${exitCode}.`));
    });
  });
}
