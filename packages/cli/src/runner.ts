import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
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
  artifacts?: CollectedRunArtifact[];
  errorMessage?: string;
  logsPath?: string;
  resultJson: Record<string, unknown>;
  status: CheckRunStatus;
};

type CollectedRunArtifact = {
  mimeType?: string;
  path: string;
  sizeBytes?: number;
  type: Prisma.ArtifactCreateManyInput["type"];
};

const MAX_RESPONSE_BODY_CHARS = 20_000;

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
    await recordRunArtifacts(run.id, result.artifacts ?? []);
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
      artifacts: [],
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
      artifacts: [],
      errorMessage: "Browser check has no Playwright entrypoint.",
      resultJson: {},
      status: "failed",
    };
  }

  const artifactStartedAt = Date.now();
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
  const artifacts = run
    ? await collectRunArtifacts(options.rootDir, artifactStartedAt, logsPath)
    : [];

  return {
    artifacts,
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
      artifacts: [],
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
  const responseBody = await response.text();
  const body =
    responseBody.length > MAX_RESPONSE_BODY_CHARS
      ? `${responseBody.slice(0, MAX_RESPONSE_BODY_CHARS)}\n... truncated ${
          responseBody.length - MAX_RESPONSE_BODY_CHARS
        } chars ...`
      : responseBody;

  return {
    artifacts: [],
    errorMessage: response.ok
      ? undefined
      : `HTTP ${response.status} ${response.statusText}`,
    resultJson: {
      body,
      headers: Object.fromEntries(response.headers.entries()),
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

async function recordRunArtifacts(
  runId: string,
  artifacts: CollectedRunArtifact[],
): Promise<void> {
  try {
    await prisma.artifact.deleteMany({
      where: {
        runId,
      },
    });

    if (artifacts.length === 0) {
      return;
    }

    await prisma.artifact.createMany({
      data: artifacts.map((artifact) => ({
        mimeType: artifact.mimeType,
        path: artifact.path,
        runId,
        sizeBytes: artifact.sizeBytes,
        type: artifact.type,
      })),
    });
  } catch (error) {
    console.warn("Unable to record run artifacts.", error);
  }
}

async function collectRunArtifacts(
  rootDir: string,
  startedAt: number,
  logsPath: string | undefined,
): Promise<CollectedRunArtifact[]> {
  const artifacts: CollectedRunArtifact[] = [];

  if (logsPath) {
    const logArtifact = await describeFileArtifact(logsPath, "LOG", "text/plain");

    if (logArtifact) {
      artifacts.push(logArtifact);
    }
  }

  const discoveredArtifacts = await collectBrowserArtifactFiles(
    rootDir,
    startedAt,
  ).catch((error) => {
    console.warn("Unable to collect browser artifacts.", error);
    return [];
  });

  artifacts.push(...discoveredArtifacts);

  return artifacts;
}

async function collectBrowserArtifactFiles(
  rootDir: string,
  startedAt: number,
): Promise<CollectedRunArtifact[]> {
  const directories = [
    path.join(rootDir, "test-results"),
    path.join(rootDir, "playwright-report"),
  ];
  const seen = new Set<string>();
  const artifacts = (
    await Promise.all(
      directories.map((directory) => walkArtifactDirectory(directory, startedAt, seen)),
    )
  ).flat();

  return artifacts.slice(0, 100);
}

async function walkArtifactDirectory(
  directory: string,
  startedAt: number,
  seen: Set<string>,
): Promise<CollectedRunArtifact[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const artifacts: CollectedRunArtifact[] = [];

  for (const entry of entries) {
    const filePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      artifacts.push(...(await walkArtifactDirectory(filePath, startedAt, seen)));
      continue;
    }

    if (!entry.isFile() || seen.has(filePath)) {
      continue;
    }

    seen.add(filePath);

    const inferred = inferArtifactFile(filePath);

    if (!inferred) {
      continue;
    }

    const fileStat = await stat(filePath).catch(() => undefined);

    if (!fileStat?.isFile() || fileStat.mtimeMs < startedAt - 1000) {
      continue;
    }

    artifacts.push({
      ...inferred,
      path: filePath,
      sizeBytes: Math.min(fileStat.size, Number.MAX_SAFE_INTEGER),
    });
  }

  return artifacts;
}

async function describeFileArtifact(
  filePath: string,
  type: Prisma.ArtifactCreateManyInput["type"],
  mimeType: string,
): Promise<CollectedRunArtifact | undefined> {
  const fileStat = await stat(filePath).catch(() => undefined);

  if (!fileStat?.isFile()) {
    return undefined;
  }

  return {
    mimeType,
    path: filePath,
    sizeBytes: Math.min(fileStat.size, Number.MAX_SAFE_INTEGER),
    type,
  };
}

function inferArtifactFile(
  filePath: string,
): Pick<CollectedRunArtifact, "mimeType" | "type"> | undefined {
  const fileName = path.basename(filePath).toLowerCase();
  const extension = path.extname(fileName);

  if ([".png", ".jpg", ".jpeg", ".webp"].includes(extension)) {
    return {
      mimeType:
        extension === ".jpg" || extension === ".jpeg"
          ? "image/jpeg"
          : `image/${extension.slice(1)}`,
      type: "SCREENSHOT",
    };
  }

  if ([".mp4", ".webm"].includes(extension)) {
    return {
      mimeType: extension === ".mp4" ? "video/mp4" : "video/webm",
      type: "VIDEO",
    };
  }

  if (extension === ".zip" && fileName.includes("trace")) {
    return {
      mimeType: "application/zip",
      type: "TRACE",
    };
  }

  if (extension === ".json") {
    return {
      mimeType: "application/json",
      type: "JSON",
    };
  }

  return undefined;
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
