import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { Prisma } from "@prisma/client";
import { Queue } from "bullmq";
import { NextResponse } from "next/server";

import { getRunEnvironment } from "@selfchecks/cli/environment";
import {
  type CheckDefinition,
  deploymentManifestSchema,
  importCheckDefinitions,
  manifestToImportResult,
  normalizeCheckQueueName,
  normalizeTags,
  type DeploymentManifest,
} from "@selfchecks/core";

import { isCliRequestAuthorized } from "@/lib/cli-auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type TestSessionMetadata = {
  checkKeys: string[];
  checkTypes: CheckDefinition["type"][];
  commitSha?: string;
  deploymentManifest?: DeploymentManifest;
  env: Array<{ name: string; value: string }>;
  jobUrl?: string;
  pipelineUrl?: string;
  projectSlug: string;
  ref?: string;
  reporter: string;
  repository?: string;
  retries?: number;
  source?: string;
  tagSets: string[][];
  testSessionName?: string;
};

type TestSessionQueueJob = {
  checkKeys: string[];
  checks: CheckDefinition[];
  env: Array<{ name: string; value: string }>;
  existingRunIds: Record<string, string>;
  kind: "test-session";
  projectSlug: string;
  reporter: string;
  retries?: number;
  rootDir: string;
  sessionId: string;
  tagSets: string[][];
};

type BundleManifestEntry = {
  path: string;
  size: number;
};

const MAX_BUNDLE_BYTES = 40 * 1024 * 1024;
const MAX_BUNDLE_FILES = 10_000;
const activeStatuses = ["QUEUED", "RUNNING"] as const;

export async function POST(request: Request) {
  if (!(await isCliRequestAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const metadata = parseMetadata(formData.get("metadata"));
    const bundle = await parseBundle(formData);
    const workspaceRoot = path.join(resolveTestSessionsRoot(), randomUUID());

    await writeBundle(workspaceRoot, bundle);

    const imported = metadata.deploymentManifest
      ? manifestToImportResult(metadata.deploymentManifest, metadata.projectSlug)
      : await importCheckDefinitions({
          projectSlug: metadata.projectSlug,
          rootDir: workspaceRoot,
        });
    const checks = selectChecks(imported.checks, metadata);

    if (checks.length === 0) {
      return NextResponse.json(
        { error: "No selfchecks definitions matched the selected filters." },
        { status: 422 },
      );
    }

    const configuredEnv = await getRunEnvironment(metadata.projectSlug);
    const env = mergeEnv(configuredEnv, metadata.env);
    const { existingRunIds, session } = await createQueuedSession(
      metadata,
      checks,
      env,
      workspaceRoot,
    );
    const queue = createCheckQueue();

    try {
      await queue.add(
        "prepare-test-session",
        {
          checkKeys: checks.map((check) => check.key),
          checks,
          env,
          existingRunIds,
          kind: "test-session",
          projectSlug: metadata.projectSlug,
          reporter: metadata.reporter,
          retries: metadata.retries,
          rootDir: workspaceRoot,
          sessionId: session.id,
          tagSets: [],
        },
        {
          jobId: session.id,
          priority: 10,
        },
      );
    } catch (error) {
      await markSessionFailed(
        session.id,
        Object.values(existingRunIds),
        error instanceof Error ? error.message : String(error),
      );

      return NextResponse.json(
        { error: "Unable to queue test session." },
        { status: 503 },
      );
    } finally {
      await queue.close();
    }

    return NextResponse.json(
      {
        sessionId: session.id,
        status: "queued",
        statusUrl: `/api/cli/test-sessions/${encodeURIComponent(session.id)}`,
        total: checks.length,
      },
      { status: 202 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Invalid test bundle.",
      },
      { status: 400 },
    );
  }
}

async function createQueuedSession(
  metadata: TestSessionMetadata,
  checks: CheckDefinition[],
  env: Array<{ name: string; value: string }>,
  workspacePath: string,
) {
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.upsert({
      create: {
        name: metadata.projectSlug,
        slug: metadata.projectSlug,
      },
      update: {},
      where: {
        slug: metadata.projectSlug,
      },
    });

    await cancelSupersededSessions(tx, project.id, metadata);

    const session = await tx.testSession.create({
      data: {
        commitSha: metadata.commitSha,
        kind: "TEST",
        name: metadata.testSessionName,
        projectId: project.id,
        ...(metadata.jobUrl ? { jobUrl: metadata.jobUrl } : {}),
        ...(metadata.pipelineUrl ? { pipelineUrl: metadata.pipelineUrl } : {}),
        ...(metadata.ref ? { ref: metadata.ref } : {}),
        ...(metadata.repository ? { repository: metadata.repository } : {}),
        source: metadata.source,
        status: "QUEUED",
        targetUrl: resolveTargetUrl(env),
        workspacePath,
      },
      select: {
        id: true,
      },
    });
    const existingRunIds: Record<string, string> = {};

    for (const check of checks) {
      const run = await tx.checkRun.create({
        data: {
          checkSnapshotDegradedResponseTime: check.degradedResponseTime,
          checkSnapshotEntrypoint: check.entrypoint,
          checkSnapshotGroupName: check.groupName,
          checkSnapshotKey: check.key,
          checkSnapshotName: check.name,
          checkSnapshotProjectSlug: metadata.projectSlug,
          checkSnapshotRequest: check.request as Prisma.InputJsonValue,
          checkSnapshotTags: check.tags,
          checkSnapshotType: check.type.toUpperCase() as "API" | "BROWSER",
          projectId: project.id,
          runSource: "CLI",
          status: "QUEUED",
          testSessionId: session.id,
        },
        select: {
          id: true,
        },
      });

      existingRunIds[check.key] = run.id;
    }

    return {
      existingRunIds,
      session,
    };
  });
}

async function cancelSupersededSessions(
  tx: Prisma.TransactionClient,
  projectId: string,
  metadata: TestSessionMetadata,
) {
  if (!metadata.commitSha || !metadata.ref) {
    return;
  }

  const sessions = await tx.testSession.findMany({
    select: {
      id: true,
    },
    where: {
      commitSha: {
        not: metadata.commitSha,
      },
      kind: "TEST",
      projectId,
      ref: metadata.ref,
      ...(metadata.repository ? { repository: metadata.repository } : {}),
      status: {
        in: [...activeStatuses],
      },
    },
  });
  const sessionIds = sessions.map((session) => session.id);

  if (sessionIds.length === 0) {
    return;
  }

  const finishedAt = new Date();

  await tx.testSession.updateMany({
    data: {
      status: "CANCELLED",
    },
    where: {
      id: {
        in: sessionIds,
      },
      status: {
        in: [...activeStatuses],
      },
    },
  });
  await tx.checkRun.updateMany({
    data: {
      errorMessage: `Superseded by commit ${metadata.commitSha}.`,
      finishedAt,
      status: "CANCELLED",
    },
    where: {
      status: {
        in: [...activeStatuses],
      },
      testSessionId: {
        in: sessionIds,
      },
    },
  });
}

async function markSessionFailed(
  sessionId: string,
  runIds: string[],
  errorMessage: string,
) {
  const finishedAt = new Date();

  await prisma.$transaction([
    prisma.testSession.update({
      data: {
        status: "FAILED",
      },
      where: {
        id: sessionId,
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
          in: runIds,
        },
      },
    }),
  ]);
}

async function parseBundle(formData: FormData) {
  const manifestValue = formData.get("manifest");

  if (typeof manifestValue !== "string") {
    throw new Error("Bundle manifest is required.");
  }

  const manifest = JSON.parse(manifestValue) as unknown;

  if (!Array.isArray(manifest) || manifest.length === 0) {
    throw new Error("Bundle manifest must contain files.");
  }

  if (manifest.length > MAX_BUNDLE_FILES) {
    throw new Error(`Selfchecks test bundle exceeds ${MAX_BUNDLE_FILES} files.`);
  }

  const files: Array<{ content: Uint8Array; path: string }> = [];
  const seenPaths = new Set<string>();
  let totalBytes = 0;

  for (const [index, value] of manifest.entries()) {
    const entry = parseManifestEntry(value);
    const file = formData.get(`file-${index}`);

    if (seenPaths.has(entry.path)) {
      throw new Error(`Bundle file ${entry.path} is duplicated.`);
    }

    seenPaths.add(entry.path);

    if (!file || typeof file === "string" || typeof file.arrayBuffer !== "function") {
      throw new Error(`Bundle file ${entry.path} is missing.`);
    }

    if (file.size !== entry.size) {
      throw new Error(`Bundle file ${entry.path} has an invalid size.`);
    }

    totalBytes += file.size;

    if (totalBytes > MAX_BUNDLE_BYTES) {
      throw new Error("Selfchecks test bundle exceeds 40 MB.");
    }

    files.push({
      content: new Uint8Array(await file.arrayBuffer()),
      path: entry.path,
    });
  }

  return files;
}

function parseManifestEntry(value: unknown): BundleManifestEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Bundle manifest contains an invalid entry.");
  }

  const entry = value as Partial<BundleManifestEntry>;

  if (typeof entry.path !== "string" || !isSafeRelativePath(entry.path)) {
    throw new Error("Bundle manifest contains an unsafe path.");
  }

  if (!Number.isSafeInteger(entry.size) || (entry.size ?? -1) < 0) {
    throw new Error(`Bundle file ${entry.path} has an invalid size.`);
  }

  return entry as BundleManifestEntry;
}

function parseMetadata(value: FormDataEntryValue | null): TestSessionMetadata {
  if (typeof value !== "string") {
    throw new Error("Test session metadata is required.");
  }

  const metadata = JSON.parse(value) as Partial<TestSessionMetadata>;

  if (!metadata.projectSlug?.trim()) {
    throw new Error("Project slug is required.");
  }

  return {
    checkKeys: readStringArray(metadata.checkKeys),
    checkTypes: readCheckTypes(metadata.checkTypes),
    commitSha: readOptionalString(metadata.commitSha),
    ...(metadata.deploymentManifest
      ? {
          deploymentManifest: deploymentManifestSchema.parse(
            metadata.deploymentManifest,
          ),
        }
      : {}),
    env: readEnv(metadata.env),
    jobUrl: readOptionalString(metadata.jobUrl),
    pipelineUrl: readOptionalString(metadata.pipelineUrl),
    projectSlug: metadata.projectSlug.trim(),
    ref: readOptionalString(metadata.ref),
    reporter: readOptionalString(metadata.reporter) ?? "list",
    repository: readOptionalString(metadata.repository),
    retries: readOptionalRetries(metadata.retries),
    source: readOptionalString(metadata.source),
    tagSets: Array.isArray(metadata.tagSets)
      ? metadata.tagSets.map(readStringArray)
      : [],
    testSessionName: readOptionalString(metadata.testSessionName),
  };
}

async function writeBundle(
  workspaceRoot: string,
  files: Array<{ content: Uint8Array; path: string }>,
) {
  for (const file of files) {
    const filePath = path.join(workspaceRoot, ...file.path.split("/"));

    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, file.content);
  }
}

function selectChecks(checks: CheckDefinition[], metadata: TestSessionMetadata) {
  return checks
    .filter((check) => check.enabled)
    .filter(
      (check) =>
        metadata.checkKeys.length === 0 || metadata.checkKeys.includes(check.key),
    )
    .filter(
      (check) =>
        metadata.checkTypes.length === 0 || metadata.checkTypes.includes(check.type),
    )
    .filter((check) => {
      if (metadata.tagSets.length === 0) {
        return true;
      }

      const tags = normalizeTags(check.tags);
      return metadata.tagSets.some((tagSet) =>
        tagSet.every((tag) => tags.includes(tag)),
      );
    });
}

function createCheckQueue() {
  return new Queue<TestSessionQueueJob>(
    normalizeCheckQueueName(process.env.SELFCHECKS_QUEUE_NAME),
    {
      connection: {
        host: process.env.REDIS_HOST || "localhost",
        port: parsePositiveInteger(process.env.REDIS_PORT, 6379),
      },
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: 1000,
        removeOnFail: 1000,
      },
    },
  );
}

function resolveTestSessionsRoot() {
  return (
    process.env.SELFCHECKS_TEST_SESSIONS_DIR?.trim() || "/app/runtime/test-sessions"
  );
}

function isSafeRelativePath(value: string) {
  if (!value || value.includes("\\") || path.posix.isAbsolute(value)) {
    return false;
  }

  const normalized = path.posix.normalize(value);
  return normalized === value && !normalized.startsWith("../") && normalized !== "..";
}

function mergeEnv(
  configured: Array<{ name: string; value: string }>,
  overrides: Array<{ name: string; value: string }>,
) {
  const merged = new Map(configured.map((item) => [item.name, item.value]));

  overrides.forEach((item) => merged.set(item.name, item.value));

  return [...merged].map(([name, value]) => ({ name, value }));
}

function resolveTargetUrl(env: Array<{ name: string; value: string }>) {
  const preferredNames = [
    "ENVIRONMENT_URL",
    "BASE_URL",
    "PLAYWRIGHT_TEST_BASE_URL",
    "PLAYWRIGHT_BASE_URL",
    "APP_URL",
    "TARGET_URL",
  ];
  const values = new Map(env.map((item) => [item.name, item.value.trim()]));

  for (const name of preferredNames) {
    const value = values.get(name);

    if (value && /^https?:\/\/\S+$/i.test(value)) {
      return value;
    }
  }

  return undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function readCheckTypes(value: unknown): CheckDefinition["type"][] {
  return readStringArray(value).filter(
    (item): item is CheckDefinition["type"] => item === "api" || item === "browser",
  );
}

function readEnv(value: unknown): Array<{ name: string; value: string }> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (
      !item ||
      typeof item !== "object" ||
      typeof item.name !== "string" ||
      typeof item.value !== "string" ||
      !item.name.trim()
    ) {
      return [];
    }

    return [{ name: item.name.trim(), value: item.value }];
  });
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readOptionalRetries(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : undefined;
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
