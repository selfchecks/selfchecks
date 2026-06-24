import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import type { ApiRequest, CheckRunStatus } from "@selfchecks/core";
import { normalizeTags } from "@selfchecks/core";
import {
  prisma,
  Prisma,
  type Check,
  type CheckRun,
  type TestSession,
} from "@selfchecks/db";

export type EnvVar = {
  name: string;
  value: string;
};

export type RunCheckResult = {
  checkKey: string;
  checkName: string;
  durationMs: number;
  errorMessage?: string;
  runId?: string;
  status: CheckRunStatus;
};

export type RunChecksSummary = {
  durationMs: number;
  failed: number;
  passed: number;
  results: RunCheckResult[];
  sessionId?: string;
  skipped: number;
  total: number;
};

export type RunChecksOptions = {
  checkKeys?: string[];
  env: EnvVar[];
  projectSlug: string;
  record: boolean;
  reporter: string;
  rootDir: string;
  tagSets: string[][];
  testSessionName?: string;
};

export type RunCheckByIdOptions = {
  checkId: string;
  env: EnvVar[];
  projectSlug: string;
  record: true;
  reporter: string;
  rootDir: string;
  runId?: string;
};

type RunnableCheck = Check & {
  runs: CheckRun[];
};

type CheckExecutionResult = {
  errorMessage?: string;
  logsPath?: string;
  resultJson: Record<string, unknown>;
  status: CheckRunStatus;
};

export async function runChecks(options: RunChecksOptions): Promise<RunChecksSummary> {
  const startedAt = Date.now();
  const checks = await findRunnableChecks(options);
  const session = options.record ? await createTestSession(options) : undefined;
  const results: RunCheckResult[] = [];

  for (const check of checks) {
    results.push(await runCheck(check, options, session));
  }

  if (session) {
    await prisma.testSession.update({
      data: {
        status: summarizeStatus(results),
      },
      where: {
        id: session.id,
      },
    });
  }

  const passed = results.filter((result) => result.status === "passed").length;
  const failed = results.filter((result) => result.status !== "passed").length;

  return {
    durationMs: Date.now() - startedAt,
    failed,
    passed,
    results,
    sessionId: session?.id,
    skipped: 0,
    total: results.length,
  };
}

export async function runCheckById(
  options: RunCheckByIdOptions,
): Promise<RunCheckResult> {
  const check = await prisma.check.findFirst({
    include: {
      runs: {
        orderBy: {
          createdAt: "desc",
        },
        take: 1,
      },
    },
    where: {
      enabled: true,
      id: options.checkId,
      project: {
        slug: options.projectSlug,
      },
    },
  });

  if (!check) {
    throw new Error(`Check ${options.checkId} was not found.`);
  }

  return runCheck(
    check,
    {
      checkKeys: [check.key],
      env: options.env,
      projectSlug: options.projectSlug,
      record: options.record,
      reporter: options.reporter,
      rootDir: options.rootDir,
      tagSets: [],
    },
    undefined,
    options.runId,
  );
}

async function findRunnableChecks(options: RunChecksOptions): Promise<RunnableCheck[]> {
  const project = await prisma.project.findUnique({
    select: {
      id: true,
    },
    where: {
      slug: options.projectSlug,
    },
  });

  if (!project) {
    return [];
  }

  const checks = await prisma.check.findMany({
    include: {
      runs: {
        orderBy: {
          createdAt: "desc",
        },
        take: 1,
      },
    },
    orderBy: {
      name: "asc",
    },
    where: {
      enabled: true,
      key:
        options.checkKeys && options.checkKeys.length > 0
          ? {
              in: options.checkKeys,
            }
          : undefined,
      projectId: project.id,
    },
  });

  return checks.filter((check) => doesCheckMatchTags(check, options.tagSets));
}

function doesCheckMatchTags(check: Check, tagSets: string[][]): boolean {
  if (tagSets.length === 0) {
    return true;
  }

  const checkTags = normalizeTags(check.tags);

  return tagSets.some((tagSet) => tagSet.every((tag) => checkTags.includes(tag)));
}

async function createTestSession(options: RunChecksOptions): Promise<TestSession> {
  return prisma.testSession.create({
    data: {
      name: options.testSessionName,
      source: options.rootDir,
      status: "RUNNING",
    },
  });
}

async function runCheck(
  check: RunnableCheck,
  options: RunChecksOptions,
  session: TestSession | undefined,
  existingRunId?: string,
): Promise<RunCheckResult> {
  const startedAt = new Date();
  const run = options.record
    ? await upsertStartedRun(check.id, startedAt, session, existingRunId)
    : undefined;

  const result = await executeCheck(check, options, run);
  const finishedAt = new Date();
  const durationMs = finishedAt.getTime() - startedAt.getTime();

  if (run) {
    await prisma.checkRun.update({
      data: {
        durationMs,
        errorMessage: result.errorMessage,
        finishedAt,
        logsPath: result.logsPath,
        result: result.resultJson as Prisma.InputJsonValue,
        status: toPrismaRunStatus(result.status),
      },
      where: {
        id: run.id,
      },
    });
  }

  return {
    checkKey: check.key,
    checkName: check.name,
    durationMs,
    errorMessage: result.errorMessage,
    runId: run?.id,
    status: result.status,
  };
}

async function upsertStartedRun(
  checkId: string,
  startedAt: Date,
  session: TestSession | undefined,
  existingRunId: string | undefined,
): Promise<CheckRun> {
  if (!existingRunId) {
    return prisma.checkRun.create({
      data: {
        checkId,
        startedAt,
        status: "RUNNING",
        testSessionId: session?.id,
      },
    });
  }

  const run = await prisma.checkRun.findFirst({
    where: {
      checkId,
      id: existingRunId,
    },
  });

  if (!run) {
    throw new Error(`Run ${existingRunId} was not found for check ${checkId}.`);
  }

  return prisma.checkRun.update({
    data: {
      startedAt,
      status: "RUNNING",
      testSessionId: session?.id,
    },
    where: {
      id: run.id,
    },
  });
}

async function executeCheck(
  check: Check,
  options: RunChecksOptions,
  run: CheckRun | undefined,
): Promise<CheckExecutionResult> {
  try {
    return check.type === "BROWSER"
      ? await runBrowserCheck(check, options, run)
      : await runApiCheck(check, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return {
      errorMessage: message,
      resultJson: {
        error: message,
      },
      status: "failed",
    };
  }
}

async function runBrowserCheck(
  check: Check,
  options: RunChecksOptions,
  run: CheckRun | undefined,
): Promise<CheckExecutionResult> {
  if (!check.entrypoint) {
    return {
      errorMessage: "Browser check has no Playwright entrypoint.",
      resultJson: {},
      status: "failed",
    };
  }

  const logs = await runProcess({
    args: [
      "playwright",
      "test",
      check.entrypoint,
      "--config",
      "playwright.config.ts",
      "--reporter",
      options.reporter,
    ],
    command: "npx",
    env: options.env,
    rootDir: options.rootDir,
  });
  const logsPath = run
    ? await writeRunLog(options.rootDir, run.id, logs.output)
    : undefined;

  return {
    errorMessage: logs.exitCode === 0 ? undefined : logs.output.slice(-4000),
    logsPath,
    resultJson: {
      command: `npx playwright test ${check.entrypoint}`,
      exitCode: logs.exitCode,
    },
    status: logs.exitCode === 0 ? "passed" : "failed",
  };
}

async function runApiCheck(
  check: Check,
  options: RunChecksOptions,
): Promise<CheckExecutionResult> {
  const request = check.request as ApiRequest | null;

  if (!request) {
    return {
      errorMessage: "API check has no request definition.",
      resultJson: {},
      status: "failed",
    };
  }

  const env = Object.fromEntries(options.env.map((item) => [item.name, item.value]));
  const url = interpolateEnv(request.url, env);
  const response = await fetch(url, {
    body: request.body ? interpolateEnv(request.body, env) : undefined,
    headers: request.headers,
    method: request.method,
  });

  return {
    errorMessage: response.ok
      ? undefined
      : `HTTP ${response.status} ${response.statusText}`,
    resultJson: {
      status: response.status,
      statusText: response.statusText,
      url,
    },
    status: response.ok ? "passed" : "failed",
  };
}

async function runProcess({
  args,
  command,
  env,
  rootDir,
}: {
  args: string[];
  command: string;
  env: EnvVar[];
  rootDir: string;
}): Promise<{ exitCode: number; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      env: {
        ...process.env,
        ...Object.fromEntries(env.map((item) => [item.name, item.value])),
      },
      shell: false,
    });
    const chunks: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.on("close", (exitCode) => {
      resolve({
        exitCode: exitCode ?? 1,
        output: Buffer.concat(chunks).toString("utf8"),
      });
    });
  });
}

async function writeRunLog(
  rootDir: string,
  runId: string,
  output: string,
): Promise<string> {
  const directory = path.join(rootDir, ".selfchecks", "runs");
  const filePath = path.join(directory, `${runId}.log`);

  await mkdir(directory, {
    recursive: true,
  });
  await writeFile(filePath, output);

  return filePath;
}

function interpolateEnv(value: string, env: Record<string, string>): string {
  return value.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, name: string) => {
    return env[name] ?? process.env[name] ?? `{{${name}}}`;
  });
}

function summarizeStatus(results: RunCheckResult[]): "PASSED" | "FAILED" {
  return results.every((result) => result.status === "passed") ? "PASSED" : "FAILED";
}

function toPrismaRunStatus(status: CheckRunStatus): "PASSED" | "FAILED" {
  return status === "passed" ? "PASSED" : "FAILED";
}
