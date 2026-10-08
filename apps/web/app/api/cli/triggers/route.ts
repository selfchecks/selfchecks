import { randomUUID } from "node:crypto";

import { Queue } from "bullmq";
import { NextResponse } from "next/server";

import { getRunEnvironment } from "@selfchecks/cli/environment";
import { normalizeCheckQueueName } from "@selfchecks/core";
import { Prisma } from "@selfchecks/db";

import { isCliRequestAuthorized } from "@/lib/cli-auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type TriggerMetadata = {
  commitSha?: string;
  env: Array<{ name: string; value: string }>;
  jobUrl?: string;
  pipelineUrl?: string;
  projectSlug: string;
  ref?: string;
  reporter: string;
  repository?: string;
  retries?: number;
  testSessionName?: string;
};

export async function POST(request: Request) {
  if (!(await isCliRequestAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const metadata = parseMetadata(await request.json());
    const deployment = await prisma.deployment.findFirst({
      orderBy: { createdAt: "desc" },
      select: { source: true },
      where: { project: { slug: metadata.projectSlug } },
    });
    const rootDir =
      process.env.SELFCHECKS_CHECKS_ROOT?.trim() || deployment?.source?.trim();

    if (!rootDir) {
      return NextResponse.json(
        { error: "No deployed checks were found for this project." },
        { status: 422 },
      );
    }

    const triggerId = randomUUID();
    const env = mergeEnv(await getRunEnvironment(metadata.projectSlug), metadata.env);
    const project = await prisma.project.findUnique({
      where: { slug: metadata.projectSlug },
      select: {
        id: true,
        checks: {
          where: { enabled: true },
          orderBy: { name: "asc" },
          include: { group: { select: { name: true } } },
        },
      },
    });

    if (!project) {
      return NextResponse.json({ error: "Project was not found." }, { status: 404 });
    }

    const checks = project.checks.map((check) => ({ check, runId: randomUUID() }));
    const queue = createCheckQueue();

    try {
      // Persist the entire batch before workers can finish its first check.
      await prisma.testSession.create({
        data: {
          id: triggerId,
          kind: "TRIGGER",
          projectId: project.id,
          name: metadata.testSessionName,
          commitSha: metadata.commitSha,
          jobUrl: metadata.jobUrl,
          pipelineUrl: metadata.pipelineUrl,
          ref: metadata.ref,
          repository: metadata.repository,
          source: rootDir,
          status: checks.length ? "QUEUED" : "PASSED",
          runs: {
            create: checks.map(({ check, runId }) => ({
              id: runId,
              checkId: check.id,
              projectId: project.id,
              retryGroupId: runId,
              runSource: "CLI",
              status: "QUEUED",
              checkSnapshotKey: check.key,
              checkSnapshotName: check.name,
              checkSnapshotType: check.type,
              checkSnapshotAccounts: check.accounts,
              checkSnapshotTags: check.tags,
              checkSnapshotEntrypoint: check.entrypoint,
              checkSnapshotRequest: check.request ?? Prisma.DbNull,
              checkSnapshotDegradedResponseTime: check.degradedResponseTime,
              checkSnapshotGroupName: check.group?.name,
              checkSnapshotProjectSlug: metadata.projectSlug,
            })),
          },
        },
      });
      if (checks.length) {
        await queue.addBulk(
          checks.map(({ check, runId }) => ({
            name: "run-check",
            data: {
              accounts: check.accounts,
              checkId: check.id,
              checkKey: check.key,
              env,
              projectSlug: metadata.projectSlug,
              reporter: metadata.reporter,
              retries: metadata.retries,
              rootDir,
              runId,
              runSource: "CLI",
              triggerSessionId: triggerId,
              type: check.type.toLowerCase(),
            },
            opts: { jobId: runId },
          })),
        );
      }
    } catch {
      await prisma.$transaction([
        prisma.checkRun.updateMany({
          where: { testSessionId: triggerId, status: "QUEUED" },
          data: {
            status: "CANCELLED",
            finishedAt: new Date(),
            errorMessage: "Unable to queue trigger.",
          },
        }),
        prisma.testSession.updateMany({
          where: { id: triggerId },
          data: { status: "CANCELLED" },
        }),
      ]);
      return NextResponse.json({ error: "Unable to queue trigger." }, { status: 503 });
    } finally {
      await queue.close();
    }

    return NextResponse.json(
      {
        status: "queued",
        statusUrl: `/api/cli/triggers/${encodeURIComponent(triggerId)}`,
        triggerId,
      },
      { status: 202 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid trigger request." },
      { status: 400 },
    );
  }
}

function parseMetadata(value: unknown): TriggerMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Trigger metadata is required.");
  }

  const metadata = value as Partial<TriggerMetadata>;

  if (!metadata.projectSlug?.trim()) {
    throw new Error("Project slug is required.");
  }

  return {
    commitSha: readOptionalString(metadata.commitSha),
    env: readEnv(metadata.env),
    jobUrl: readOptionalString(metadata.jobUrl),
    pipelineUrl: readOptionalString(metadata.pipelineUrl),
    projectSlug: metadata.projectSlug.trim(),
    ref: readOptionalString(metadata.ref),
    reporter: readOptionalString(metadata.reporter) ?? "list",
    repository: readOptionalString(metadata.repository),
    retries: readOptionalRetries(metadata.retries),
    testSessionName: readOptionalString(metadata.testSessionName),
  };
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

function mergeEnv(
  configured: Array<{ name: string; value: string }>,
  overrides: Array<{ name: string; value: string }>,
) {
  const merged = new Map(configured.map((item) => [item.name, item.value]));

  overrides.forEach((item) => merged.set(item.name, item.value));

  return [...merged].map(([name, value]) => ({ name, value }));
}

function createCheckQueue() {
  return new Queue(normalizeCheckQueueName(process.env.SELFCHECKS_QUEUE_NAME), {
    connection: {
      host: process.env.REDIS_HOST || "localhost",
      port: parsePositiveInteger(process.env.REDIS_PORT, 6379),
    },
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: 1000,
      removeOnFail: 1000,
    },
  });
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
