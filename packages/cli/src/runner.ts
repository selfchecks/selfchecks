import { copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

import type {
  ApiRequest,
  CheckDefinition,
  CheckRunStatus,
  RetryStrategy,
} from "@selfchecks/core";
import { normalizeTags } from "@selfchecks/core";
import { prisma, Prisma, type CheckRun, type TestSession } from "@selfchecks/db";

import { analyzeFailedCheck } from "./ai-analysis.js";
import {
  BROWSER_PERFORMANCE_COLLECTOR_SCRIPT,
  collectBrowserPerformanceFromArtifacts,
  collectBrowserPerformanceFromDirectory,
} from "./browser-performance.js";

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

export type CheckRunSource = "CLI" | "MANUAL" | "SCHEDULE";

export type RunChecksOptions = {
  checkKeys?: string[];
  checks?: CheckDefinition[];
  env: EnvVar[];
  projectSlug: string;
  record: boolean;
  reporter: string;
  retries?: number;
  rootDir: string;
  runMode?: "monitoring" | "test";
  runSource?: CheckRunSource;
  source?: string;
  tagSets: string[][];
  testSessionCommitSha?: string;
  testSessionName?: string;
};

export type RunCheckByIdOptions = {
  checkId: string;
  env: EnvVar[];
  projectSlug: string;
  record: true;
  reporter: string;
  retries?: number;
  rootDir: string;
  runId?: string;
  runSource?: CheckRunSource;
};

export type RunnableCheck = {
  entrypoint: string | null;
  group?: {
    name: string;
  } | null;
  id?: string;
  key: string;
  name: string;
  request: unknown;
  retryStrategy: unknown;
  runs: CheckRun[];
  tags: string[];
  type: "API" | "BROWSER";
};

type CheckRunSnapshotData = Pick<
  Prisma.CheckRunUncheckedCreateInput,
  | "checkSnapshotEntrypoint"
  | "checkSnapshotGroupName"
  | "checkSnapshotKey"
  | "checkSnapshotName"
  | "checkSnapshotProjectSlug"
  | "checkSnapshotRequest"
  | "checkSnapshotTags"
  | "checkSnapshotType"
>;

export type CheckExecutionResult = {
  artifacts?: CollectedRunArtifact[];
  errorMessage?: string;
  logsPath?: string;
  resultJson: Record<string, unknown>;
  status: CheckRunStatus;
};

export type CollectedRunArtifact = {
  mimeType?: string;
  path: string;
  sizeBytes?: number;
  type: Prisma.ArtifactCreateManyInput["type"];
};

const MAX_RESPONSE_BODY_CHARS = 20_000;
const DEFAULT_ARTIFACTS_DIR = ".selfchecks/artifacts";
const DEFAULT_RETRY_BACKOFF_SECONDS = 60;
const DEFAULT_RETRY_MAX_DURATION_SECONDS = 600;
const DEFAULT_RETRY_MAX_RETRIES = 2;
const MAX_RETRIES = 10;
const ANSI_ESCAPE_PATTERN = new RegExp(
  `${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`,
  "g",
);

export async function runChecks(options: RunChecksOptions): Promise<RunChecksSummary> {
  const startedAt = Date.now();
  const checks = await findRunnableChecks(options);
  const session = options.record ? await createRunSession(options) : undefined;
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
      checks: undefined,
      checkKeys: [check.key],
      env: options.env,
      projectSlug: options.projectSlug,
      record: options.record,
      reporter: options.reporter,
      retries: options.retries,
      rootDir: options.rootDir,
      runMode: "monitoring",
      runSource: options.runSource,
      tagSets: [],
    },
    undefined,
    options.runId,
  );
}

async function findRunnableChecks(options: RunChecksOptions): Promise<RunnableCheck[]> {
  if (options.checks) {
    return options.checks
      .filter((check) => check.enabled)
      .filter(
        (check) => !options.checkKeys?.length || options.checkKeys.includes(check.key),
      )
      .filter((check) => doesCheckMatchTags(check, options.tagSets))
      .map((check) => ({
        entrypoint: check.entrypoint ?? null,
        group: check.groupName
          ? {
              name: check.groupName,
            }
          : null,
        key: check.key,
        name: check.name,
        request: check.request ?? null,
        retryStrategy: check.retryStrategy ?? null,
        runs: [],
        tags: check.tags,
        type: check.type.toUpperCase() as "API" | "BROWSER",
      }));
  }

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
      group: true,
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

function doesCheckMatchTags(check: { tags: string[] }, tagSets: string[][]): boolean {
  if (tagSets.length === 0) {
    return true;
  }

  const checkTags = normalizeTags(check.tags);

  return tagSets.some((tagSet) => tagSet.every((tag) => checkTags.includes(tag)));
}

async function createRunSession(options: RunChecksOptions): Promise<TestSession> {
  const isTestSession = options.runMode === "test";

  return prisma.testSession.create({
    data: {
      kind: isTestSession ? "TEST" : "TRIGGER",
      commitSha: options.testSessionCommitSha,
      name: options.testSessionName,
      source: options.source ?? options.rootDir,
      status: "RUNNING",
      targetUrl: isTestSession ? resolveTestSessionTargetUrl(options.env) : undefined,
    },
  });
}

function resolveTestSessionTargetUrl(env: EnvVar[]): string | undefined {
  const envByName = new Map(env.map((item) => [item.name.trim(), item.value.trim()]));
  const preferredNames = [
    "ENVIRONMENT_URL",
    "BASE_URL",
    "PLAYWRIGHT_TEST_BASE_URL",
    "APP_URL",
    "TARGET_URL",
  ];

  for (const name of preferredNames) {
    const value = envByName.get(name);

    if (isHttpUrl(value)) {
      return value;
    }
  }

  return env.find((item) => item.name.endsWith("_URL") && isHttpUrl(item.value))?.value;
}

function isHttpUrl(value: string | undefined): value is string {
  return typeof value === "string" && /^https?:\/\/\S+$/i.test(value.trim());
}

async function runCheck(
  check: RunnableCheck,
  options: RunChecksOptions,
  session: TestSession | undefined,
  existingRunId?: string,
): Promise<RunCheckResult> {
  const retryPlan = resolveRetryPlan(check, options);
  const maxAttempts = retryPlan.maxRetries + 1;
  const retryGroupId = existingRunId ?? randomUUID();
  const firstStartedAt = Date.now();
  let attemptRunId = existingRunId;
  let lastResult: RunCheckResult | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const startedAt = new Date();
    const run = options.record
      ? await upsertStartedRun(check, options, startedAt, session, attemptRunId, {
          attempt,
          maxAttempts,
          retryGroupId,
        })
      : undefined;
    const result = await executeCheck(check, options, run);
    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();
    const retryDelayMs = getRetryDelayMs(retryPlan, attempt);
    const shouldRetry = shouldRetryCheck({
      attempt,
      finishedAt,
      firstStartedAt,
      maxAttempts,
      result,
      retryDelayMs,
      retryPlan,
    });
    let resultJson = addRetryMetadata(result.resultJson, {
      attempt,
      maxAttempts,
      retryGroupId,
      retryPlan,
    });

    if (run && result.status !== "passed" && !shouldRetry) {
      const aiAnalysis = await analyzeFailedCheck({
        check,
        options,
        result,
      });

      if (aiAnalysis) {
        resultJson = {
          ...resultJson,
          aiAnalysis,
        };
      }
    }

    if (run) {
      await prisma.checkRun.update({
        data: {
          durationMs,
          errorMessage: result.errorMessage,
          finishedAt,
          logsPath: result.logsPath,
          result: resultJson as Prisma.InputJsonValue,
          status: toPrismaRunStatus(result.status),
        },
        where: {
          id: run.id,
        },
      });
      await recordRunArtifacts(run.id, result.artifacts ?? []);
    }

    lastResult = {
      checkKey: check.key,
      checkName: check.name,
      durationMs,
      errorMessage: result.errorMessage,
      runId: run?.id,
      status: result.status,
    };

    if (!shouldRetry) {
      return lastResult;
    }

    await waitForRetry(retryDelayMs);
    attemptRunId = undefined;
  }

  if (!lastResult) {
    throw new Error(`Check ${check.key} did not produce a run result.`);
  }

  return lastResult;
}

async function upsertStartedRun(
  check: RunnableCheck,
  options: RunChecksOptions,
  startedAt: Date,
  session: TestSession | undefined,
  existingRunId: string | undefined,
  retryMetadata: {
    attempt: number;
    maxAttempts: number;
    retryGroupId: string;
  },
): Promise<CheckRun> {
  const snapshot = buildCheckRunSnapshot(check, options);
  const runSource = options.runSource ?? "CLI";

  if (!existingRunId) {
    const data: Prisma.CheckRunUncheckedCreateInput = {
      attempt: retryMetadata.attempt,
      ...(check.id ? { checkId: check.id } : {}),
      ...snapshot,
      maxAttempts: retryMetadata.maxAttempts,
      retryGroupId: retryMetadata.retryGroupId,
      runSource,
      startedAt,
      status: "RUNNING",
      testSessionId: session?.id,
    };

    return prisma.checkRun.create({
      data,
    });
  }

  const run = await prisma.checkRun.findFirst({
    where: {
      id: existingRunId,
      ...(check.id ? { checkId: check.id } : {}),
    },
  });

  if (!run) {
    throw new Error(`Run ${existingRunId} was not found for check ${check.key}.`);
  }

  const data: Prisma.CheckRunUncheckedUpdateInput = {
    attempt: retryMetadata.attempt,
    ...snapshot,
    durationMs: null,
    errorMessage: null,
    finishedAt: null,
    logsPath: null,
    maxAttempts: retryMetadata.maxAttempts,
    retryGroupId: retryMetadata.retryGroupId,
    runSource,
    startedAt,
    status: "RUNNING",
    testSessionId: session?.id,
  };

  return prisma.checkRun.update({
    data,
    where: {
      id: run.id,
    },
  });
}

type RetryPlan = {
  baseBackoffSeconds: number;
  maxDurationSeconds: number;
  maxRetries: number;
  onlyOn: string[];
  type: RetryStrategy["type"];
};

function resolveRetryPlan(check: RunnableCheck, options: RunChecksOptions): RetryPlan {
  if (typeof options.retries === "number") {
    return {
      baseBackoffSeconds: 0,
      maxDurationSeconds: DEFAULT_RETRY_MAX_DURATION_SECONDS,
      maxRetries: clampRetries(options.retries),
      onlyOn: [],
      type: options.retries > 0 ? "FIXED" : "NO_RETRIES",
    };
  }

  const retryStrategy = normalizeRetryStrategy(check.retryStrategy);

  if (!retryStrategy || retryStrategy.type === "NO_RETRIES") {
    return {
      baseBackoffSeconds: 0,
      maxDurationSeconds: DEFAULT_RETRY_MAX_DURATION_SECONDS,
      maxRetries: 0,
      onlyOn: [],
      type: "NO_RETRIES",
    };
  }

  return {
    baseBackoffSeconds:
      retryStrategy.baseBackoffSeconds ?? DEFAULT_RETRY_BACKOFF_SECONDS,
    maxDurationSeconds:
      retryStrategy.maxDurationSeconds ?? DEFAULT_RETRY_MAX_DURATION_SECONDS,
    maxRetries: clampRetries(retryStrategy.maxRetries ?? DEFAULT_RETRY_MAX_RETRIES),
    onlyOn: retryStrategy.onlyOn ?? [],
    type: retryStrategy.type,
  };
}

function normalizeRetryStrategy(value: unknown): RetryStrategy | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const strategy = value as Partial<RetryStrategy>;

  if (
    strategy.type !== "NO_RETRIES" &&
    strategy.type !== "FIXED" &&
    strategy.type !== "LINEAR" &&
    strategy.type !== "EXPONENTIAL"
  ) {
    return undefined;
  }

  return {
    ...(typeof strategy.baseBackoffSeconds === "number"
      ? { baseBackoffSeconds: strategy.baseBackoffSeconds }
      : {}),
    ...(typeof strategy.maxDurationSeconds === "number"
      ? { maxDurationSeconds: strategy.maxDurationSeconds }
      : {}),
    ...(typeof strategy.maxRetries === "number"
      ? { maxRetries: strategy.maxRetries }
      : {}),
    ...(Array.isArray(strategy.onlyOn)
      ? {
          onlyOn: strategy.onlyOn.filter(
            (item): item is string => typeof item === "string",
          ),
        }
      : {}),
    ...(typeof strategy.sameRegion === "boolean"
      ? { sameRegion: strategy.sameRegion }
      : {}),
    type: strategy.type,
  };
}

function clampRetries(value: number): number {
  if (!Number.isSafeInteger(value)) {
    return 0;
  }

  return Math.min(MAX_RETRIES, Math.max(0, value));
}

function getRetryDelayMs(retryPlan: RetryPlan, attempt: number): number {
  const baseDelayMs = Math.max(0, retryPlan.baseBackoffSeconds) * 1000;

  if (retryPlan.maxRetries <= 0 || retryPlan.type === "NO_RETRIES") {
    return 0;
  }

  if (retryPlan.type === "LINEAR") {
    return baseDelayMs * attempt;
  }

  if (retryPlan.type === "EXPONENTIAL") {
    return baseDelayMs * 5 ** (attempt - 1);
  }

  return baseDelayMs;
}

function shouldRetryCheck({
  attempt,
  finishedAt,
  firstStartedAt,
  maxAttempts,
  result,
  retryDelayMs,
  retryPlan,
}: {
  attempt: number;
  finishedAt: Date;
  firstStartedAt: number;
  maxAttempts: number;
  result: CheckExecutionResult;
  retryDelayMs: number;
  retryPlan: RetryPlan;
}): boolean {
  if (result.status === "passed" || attempt >= maxAttempts) {
    return false;
  }

  if (!matchesRetryOnlyOn(result, retryPlan.onlyOn)) {
    return false;
  }

  const maxDurationMs = retryPlan.maxDurationSeconds * 1000;

  return finishedAt.getTime() - firstStartedAt + retryDelayMs <= maxDurationMs;
}

function matchesRetryOnlyOn(result: CheckExecutionResult, onlyOn: string[]): boolean {
  if (onlyOn.length === 0) {
    return true;
  }

  const normalized = onlyOn.map((item) => item.trim().toUpperCase());

  if (!normalized.includes("NETWORK_ERROR")) {
    return true;
  }

  const resultJson = result.resultJson as Record<string, unknown>;

  return Boolean(resultJson.error) && typeof resultJson.status === "undefined";
}

function addRetryMetadata(
  resultJson: Record<string, unknown>,
  {
    attempt,
    maxAttempts,
    retryGroupId,
    retryPlan,
  }: {
    attempt: number;
    maxAttempts: number;
    retryGroupId: string;
    retryPlan: RetryPlan;
  },
): Record<string, unknown> {
  return {
    ...resultJson,
    attempt,
    attempts: maxAttempts,
    retries: maxAttempts - 1,
    retryGroupId,
    retryStrategy: {
      baseBackoffSeconds: retryPlan.baseBackoffSeconds,
      maxDurationSeconds: retryPlan.maxDurationSeconds,
      maxRetries: retryPlan.maxRetries,
      onlyOn: retryPlan.onlyOn,
      type: retryPlan.type,
    },
  };
}

async function waitForRetry(delayMs: number): Promise<void> {
  if (delayMs <= 0) {
    return;
  }

  await new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

async function executeCheck(
  check: RunnableCheck,
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
  check: RunnableCheck,
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
  const artifactPaths = createBrowserArtifactPaths(options.rootDir, run?.id);
  await writeBrowserPerformanceCollector(artifactPaths.performanceCollectorPath);
  const logs = await runProcess({
    args: [
      "playwright",
      "test",
      check.entrypoint,
      "--config",
      "playwright.config.ts",
      "--output",
      artifactPaths.testResultsDir,
      "--reporter",
      options.reporter,
      "--trace",
      "on",
    ],
    command: "npx",
    env: options.env,
    processEnv: {
      PLAYWRIGHT_BLOB_OUTPUT_DIR: artifactPaths.blobReportDir,
      PLAYWRIGHT_HTML_OUTPUT_DIR: artifactPaths.htmlReportDir,
      SELFCHECKS_BROWSER_PERFORMANCE_DIR: artifactPaths.performanceDir,
      NODE_OPTIONS: mergeNodeOptions(
        process.env.NODE_OPTIONS,
        `--require=${artifactPaths.performanceCollectorPath}`,
      ),
    },
    rootDir: options.rootDir,
  });
  const logsPath = run
    ? await writeRunLog(options.rootDir, run.id, logs.output)
    : undefined;
  const artifacts = run
    ? await collectRunArtifacts(artifactStartedAt, logsPath, [
        artifactPaths.testResultsDir,
        artifactPaths.htmlReportDir,
        artifactPaths.blobReportDir,
      ])
    : [];
  const performance =
    (await collectBrowserPerformanceFromDirectory(artifactPaths.performanceDir)) ??
    (await collectBrowserPerformanceFromArtifacts(artifacts));

  return {
    artifacts,
    errorMessage: logs.exitCode === 0 ? undefined : logs.output.slice(-4000),
    logsPath,
    resultJson: {
      artifactOutputDir: artifactPaths.testResultsDir,
      command: `npx playwright test ${check.entrypoint}`,
      exitCode: logs.exitCode,
      ...(performance ? { performance } : {}),
    },
    status: logs.exitCode === 0 ? "passed" : "failed",
  };
}

async function runApiCheck(
  check: RunnableCheck,
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
  processEnv,
  rootDir,
}: {
  args: string[];
  command: string;
  env: EnvVar[];
  processEnv?: Record<string, string>;
  rootDir: string;
}): Promise<{ exitCode: number; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      env: {
        ...process.env,
        ...Object.fromEntries(env.map((item) => [item.name, item.value])),
        ...processEnv,
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
  startedAt: number,
  logsPath: string | undefined,
  browserArtifactDirs: string[],
): Promise<CollectedRunArtifact[]> {
  const artifacts: CollectedRunArtifact[] = [];
  const logOutput = logsPath ? await readFile(logsPath, "utf8").catch(() => "") : "";

  if (logsPath) {
    const logArtifact = await describeFileArtifact(logsPath, "LOG", "text/plain");

    if (logArtifact) {
      artifacts.push(logArtifact);
    }
  }

  const discoveredArtifacts = await collectBrowserArtifactFiles(
    browserArtifactDirs,
    startedAt,
  ).catch((error) => {
    console.warn("Unable to collect browser artifacts.", error);
    return [];
  });
  const snapshotUpdateArtifacts = await createSnapshotUpdateArtifacts(
    discoveredArtifacts,
    parseSnapshotUpdateArtifactNames(logOutput),
  ).catch((error) => {
    console.warn("Unable to create snapshot update artifacts.", error);
    return [];
  });

  artifacts.push(...discoveredArtifacts);
  artifacts.push(...snapshotUpdateArtifacts);

  return artifacts;
}

async function collectBrowserArtifactFiles(
  directories: string[],
  startedAt: number,
): Promise<CollectedRunArtifact[]> {
  const seen = new Set<string>();
  const artifacts = (
    await Promise.all(
      directories.map((directory) => walkArtifactDirectory(directory, startedAt, seen)),
    )
  ).flat();

  return artifacts.slice(0, 100);
}

function createBrowserArtifactPaths(rootDir: string, runId: string | undefined) {
  const artifactRunId = runId ?? `local-${process.pid}-${Date.now()}`;
  const artifactsDir =
    process.env.SELFCHECKS_ARTIFACTS_DIR?.trim() || DEFAULT_ARTIFACTS_DIR;
  const artifactRoot = path.resolve(rootDir, artifactsDir, artifactRunId);

  return {
    blobReportDir: path.join(artifactRoot, "blob-report"),
    htmlReportDir: path.join(artifactRoot, "playwright-report"),
    performanceCollectorPath: path.join(artifactRoot, "performance-collector.cjs"),
    performanceDir: path.join(artifactRoot, "performance"),
    testResultsDir: path.join(artifactRoot, "test-results"),
  };
}

async function writeBrowserPerformanceCollector(filePath: string) {
  await mkdir(path.dirname(filePath), {
    recursive: true,
  });
  await writeFile(filePath, BROWSER_PERFORMANCE_COLLECTOR_SCRIPT);
}

function mergeNodeOptions(...options: Array<string | undefined>) {
  return options
    .map((option) => option?.trim())
    .filter((option): option is string => Boolean(option))
    .join(" ");
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

type SnapshotUpdateArtifactNames = {
  byActualName: Map<string, string>;
  byActualPath: Map<string, string>;
  entries: Array<{ actualPath: string; snapshotName: string }>;
};

function parseSnapshotUpdateArtifactNames(output: string): SnapshotUpdateArtifactNames {
  const names: SnapshotUpdateArtifactNames = {
    byActualName: new Map(),
    byActualPath: new Map(),
    entries: [],
  };
  const strippedOutput = stripAnsi(output);
  const comparisonPattern =
    /Expected:\s+([^\n\r]+?\.(?:png|jpe?g|webp))[\s\S]*?Received:\s+([^\n\r]+?\.(?:png|jpe?g|webp))/gi;

  for (const match of strippedOutput.matchAll(comparisonPattern)) {
    const expectedPath = cleanOutputPath(match[1]);
    const actualPath = cleanOutputPath(match[2]);

    if (
      !expectedPath ||
      !actualPath ||
      !/-actual\.(?:png|jpe?g|webp)$/i.test(actualPath)
    ) {
      continue;
    }

    const snapshotName = path.basename(expectedPath);

    names.byActualName.set(path.basename(actualPath), snapshotName);
    names.byActualPath.set(path.normalize(actualPath), snapshotName);
    names.entries.push({
      actualPath: path.normalize(actualPath),
      snapshotName,
    });
  }

  return names;
}

async function createSnapshotUpdateArtifacts(
  artifacts: CollectedRunArtifact[],
  names: SnapshotUpdateArtifactNames,
): Promise<CollectedRunArtifact[]> {
  if (names.byActualName.size === 0 && names.byActualPath.size === 0) {
    return [];
  }

  const artifactPaths = new Set(
    artifacts.map((artifact) => path.normalize(artifact.path)),
  );
  const generatedArtifacts: CollectedRunArtifact[] = [];

  for (const artifact of artifacts) {
    if (artifact.type !== "SCREENSHOT") {
      continue;
    }

    const snapshotName = findSnapshotUpdateArtifactName(artifact.path, names);

    if (!snapshotName || path.basename(artifact.path) === snapshotName) {
      continue;
    }

    const snapshotPath = path.join(path.dirname(artifact.path), snapshotName);
    const normalizedSnapshotPath = path.normalize(snapshotPath);

    if (artifactPaths.has(normalizedSnapshotPath)) {
      continue;
    }

    await copyFile(artifact.path, snapshotPath);
    artifactPaths.add(normalizedSnapshotPath);

    const snapshotArtifact = await describeFileArtifact(
      snapshotPath,
      "SCREENSHOT",
      artifact.mimeType ?? "image/png",
    );

    if (snapshotArtifact) {
      generatedArtifacts.push(snapshotArtifact);
    }
  }

  return generatedArtifacts;
}

function findSnapshotUpdateArtifactName(
  artifactPath: string,
  names: SnapshotUpdateArtifactNames,
): string | undefined {
  const normalizedArtifactPath = path.normalize(artifactPath);
  const exactMatch = names.byActualPath.get(normalizedArtifactPath);

  if (exactMatch) {
    return exactMatch;
  }

  const suffixMatch = names.entries.find(({ actualPath }) => {
    const normalizedActualPath = path.normalize(actualPath);

    return (
      normalizedArtifactPath.endsWith(`${path.sep}${normalizedActualPath}`) ||
      normalizedArtifactPath.endsWith(normalizedActualPath)
    );
  });

  return (
    suffixMatch?.snapshotName ?? names.byActualName.get(path.basename(artifactPath))
  );
}

function buildCheckRunSnapshot(
  check: RunnableCheck,
  options: RunChecksOptions,
): CheckRunSnapshotData {
  return {
    checkSnapshotEntrypoint: check.entrypoint,
    checkSnapshotGroupName: check.group?.name,
    checkSnapshotKey: check.key,
    checkSnapshotName: check.name,
    checkSnapshotProjectSlug: options.projectSlug,
    checkSnapshotRequest: check.request as Prisma.InputJsonValue,
    checkSnapshotTags: check.tags,
    checkSnapshotType: check.type,
  };
}

function cleanOutputPath(value: string | undefined): string {
  return (value ?? "").trim().replace(/^["'`]+|["'`:;,]+$/g, "");
}

function stripAnsi(value: string): string {
  return value.replace(ANSI_ESCAPE_PATTERN, "");
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
