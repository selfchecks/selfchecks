import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import type { CheckDefinition } from "@selfchecks/core";

import type { EnvVar, RunChecksSummary } from "./runner.js";

export type RemoteTestSessionOptions = {
  apiToken: string;
  apiUrl: string;
  checkKeys: string[];
  checkTypes: CheckDefinition["type"][];
  commitSha?: string;
  env: EnvVar[];
  jobUrl?: string;
  pipelineUrl?: string;
  projectSlug: string;
  ref?: string;
  reporter: string;
  repository?: string;
  retries?: number;
  rootDir: string;
  source?: string;
  tagSets: string[][];
  testSessionName?: string;
};

type BundleFile = {
  content: Uint8Array;
  path: string;
};

type RemoteSessionResponse = {
  sessionId: string;
  statusUrl: string;
};

type RemoteSessionStatusResponse = {
  error?: string;
  status: string;
  summary?: RunChecksSummary;
};

const MAX_BUNDLE_BYTES = 40 * 1024 * 1024;
const MAX_BUNDLE_FILES = 10_000;
const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 6 * 60 * 60_000;
const REMOTE_STATUS_MAX_ATTEMPTS = 5;
const REMOTE_STATUS_RETRY_BASE_DELAY_MS = 1_000;
const TERMINAL_STATUSES = new Set(["cancelled", "failed", "passed", "timed_out"]);
const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".npm-cache",
  ".selfchecks",
  ".turbo",
  "allure-results",
  "node_modules",
  "playwright-report",
  "test-results",
]);
const IGNORED_FILES = new Set(["checkly-github-report.md"]);

export async function runRemoteTestSession(
  options: RemoteTestSessionOptions,
): Promise<RunChecksSummary> {
  const formData = await createRemoteBundleFormData(options.rootDir, {
    checkKeys: options.checkKeys,
    checkTypes: options.checkTypes,
    commitSha: options.commitSha,
    env: options.env,
    jobUrl: options.jobUrl,
    pipelineUrl: options.pipelineUrl,
    projectSlug: options.projectSlug,
    ref: options.ref,
    reporter: options.reporter,
    repository: options.repository,
    retries: options.retries,
    source: options.source,
    tagSets: options.tagSets,
    testSessionName: options.testSessionName,
  });

  const apiUrl = normalizeApiUrl(options.apiUrl);
  const response = await fetch(`${apiUrl}/api/cli/test-sessions`, {
    body: formData,
    headers: createAuthorizationHeaders(options.apiToken),
    method: "POST",
  });
  const session = await readJsonResponse<RemoteSessionResponse>(response);

  if (!response.ok) {
    throw new Error(readApiError(session, "Unable to create remote test session."));
  }

  return pollTestSession(apiUrl, options.apiToken, session);
}

export async function createRemoteBundleFormData(
  rootDir: string,
  metadata: Record<string, unknown>,
): Promise<FormData> {
  const files = await collectBundleFiles(rootDir);
  const formData = new FormData();

  formData.set("metadata", JSON.stringify(metadata));
  formData.set(
    "manifest",
    JSON.stringify(
      files.map((file) => ({ path: file.path, size: file.content.length })),
    ),
  );

  files.forEach((file, index) => {
    const content = file.content.buffer.slice(
      file.content.byteOffset,
      file.content.byteOffset + file.content.byteLength,
    ) as ArrayBuffer;

    formData.set(`file-${index}`, new Blob([content]), path.posix.basename(file.path));
  });

  return formData;
}

export async function collectBundleFiles(rootDir: string): Promise<BundleFile[]> {
  const files: BundleFile[] = [];
  let totalBytes = 0;

  async function walk(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) {
          await walk(path.join(directory, entry.name));
        }
        continue;
      }

      if (!entry.isFile() || isIgnoredFile(entry.name)) {
        continue;
      }

      if (files.length >= MAX_BUNDLE_FILES) {
        throw new Error(`Selfchecks test bundle exceeds ${MAX_BUNDLE_FILES} files.`);
      }

      const filePath = path.join(directory, entry.name);
      const relativePath = path.relative(rootDir, filePath).split(path.sep).join("/");
      const content = transformRuntimeFile(relativePath, await readFile(filePath));

      totalBytes += content.length;

      if (totalBytes > MAX_BUNDLE_BYTES) {
        throw new Error("Selfchecks test bundle exceeds 40 MB.");
      }

      files.push({
        content,
        path: relativePath,
      });
    }
  }

  await walk(path.resolve(rootDir));

  if (files.length === 0) {
    throw new Error(`No files found in ${rootDir}.`);
  }

  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function isIgnoredFile(fileName: string) {
  return (
    fileName === ".env" || fileName.startsWith(".env.") || IGNORED_FILES.has(fileName)
  );
}

async function pollTestSession(
  apiUrl: string,
  apiToken: string,
  session: RemoteSessionResponse,
): Promise<RunChecksSummary> {
  const startedAt = Date.now();
  const statusUrl = new URL(session.statusUrl, `${apiUrl}/`).toString();

  while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
    const status = await fetchRemoteStatus<RemoteSessionStatusResponse>(
      statusUrl,
      apiToken,
      "Unable to read remote test session.",
    );

    if (TERMINAL_STATUSES.has(status.status)) {
      if (!status.summary) {
        throw new Error(status.error || `Test session ${session.sessionId} failed.`);
      }

      return status.summary;
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error(`Timed out waiting for test session ${session.sessionId}.`);
}

function transformRuntimeFile(relativePath: string, content: Buffer): Uint8Array {
  if (relativePath === "package.json") {
    const packageJson = JSON.parse(content.toString("utf8")) as Record<string, unknown>;

    return Buffer.from(
      `${JSON.stringify(
        {
          dependencies: packageJson.dependencies ?? {},
          name: packageJson.name ?? "@selfchecks/test-session",
          private: true,
          version: packageJson.version ?? "0.0.0",
        },
        null,
        2,
      )}\n`,
    );
  }

  if (relativePath === "tsconfig.json") {
    const tsconfig = JSON.parse(content.toString("utf8")) as Record<string, unknown>;
    delete tsconfig.extends;

    return Buffer.from(`${JSON.stringify(tsconfig, null, 2)}\n`);
  }

  return content;
}

export function createAuthorizationHeaders(apiToken: string) {
  return {
    Authorization: `Bearer ${apiToken}`,
  };
}

export async function fetchRemoteStatus<T>(
  statusUrl: string,
  apiToken: string,
  fallbackError: string,
): Promise<T> {
  let lastError = new Error(fallbackError);

  for (let attempt = 0; attempt < REMOTE_STATUS_MAX_ATTEMPTS; attempt += 1) {
    let response: Response;

    try {
      response = await fetch(statusUrl, {
        headers: createAuthorizationHeaders(apiToken),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lastError = new Error(`${fallbackError} ${message}`);

      if (attempt === REMOTE_STATUS_MAX_ATTEMPTS - 1) {
        throw lastError;
      }

      await waitForRemoteStatusRetry(attempt);
      continue;
    }

    let body: T;

    try {
      body = await readJsonResponse<T>(response);
    } catch (error) {
      if (
        !isRetryableRemoteStatus(response.status) ||
        attempt === REMOTE_STATUS_MAX_ATTEMPTS - 1
      ) {
        throw error;
      }

      lastError = error instanceof Error ? error : new Error(String(error));
      await waitForRemoteStatusRetry(attempt);
      continue;
    }

    if (response.ok) {
      return body;
    }

    lastError = new Error(
      readApiError(body, `${fallbackError} (HTTP ${response.status}).`),
    );

    if (
      !isRetryableRemoteStatus(response.status) ||
      attempt === REMOTE_STATUS_MAX_ATTEMPTS - 1
    ) {
      throw lastError;
    }

    await waitForRemoteStatusRetry(attempt);
  }

  throw lastError;
}

function isRetryableRemoteStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

async function waitForRemoteStatusRetry(attempt: number): Promise<void> {
  const delayMs = REMOTE_STATUS_RETRY_BASE_DELAY_MS * 2 ** attempt;

  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

export function normalizeApiUrl(value: string): string {
  const url = new URL(value);

  if (!/^https?:$/.test(url.protocol)) {
    throw new Error("SELFCHECKS_URL must use http or https.");
  }

  return url.toString().replace(/\/$/, "");
}

export async function readJsonResponse<T>(response: Response): Promise<T> {
  const body = await response.text();

  if (!body) {
    return {} as T;
  }

  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error(
      `Selfchecks API returned an invalid response (${response.status}).`,
    );
  }
}

export function readApiError(value: unknown, fallback: string): string {
  if (
    value &&
    typeof value === "object" &&
    "error" in value &&
    typeof value.error === "string"
  ) {
    return value.error;
  }

  return fallback;
}
