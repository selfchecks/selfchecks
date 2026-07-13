import { Queue } from "bullmq";
import { NextResponse } from "next/server";

import { getRunEnvironment } from "@selfchecks/cli/environment";
import { type CheckType } from "@selfchecks/core";

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    checkId: string;
  }>;
};

type CheckJob = {
  checkId: string;
  checkKey: string;
  env?: Array<{
    name: string;
    value: string;
  }>;
  projectSlug: string;
  rootDir: string;
  runId: string;
  runSource: "MANUAL";
  type: CheckType;
};

function normalizeCheckQueueName(value: string | undefined): string {
  const queueName = value?.trim() || "selfchecks-checks";

  if (queueName.includes(":")) {
    throw new Error(
      'SELFCHECKS_QUEUE_NAME cannot contain ":" because BullMQ reserves it for Redis keys. Use "-" or "_" instead.',
    );
  }

  return queueName;
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsedValue = Number.parseInt(value, 10);

  if (!Number.isSafeInteger(parsedValue) || parsedValue <= 0) {
    return fallback;
  }

  return parsedValue;
}

function createCheckQueue() {
  return new Queue<CheckJob>(
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

function resolveRootDir(deploymentSource: string | null | undefined) {
  return process.env.SELFCHECKS_CHECKS_ROOT?.trim() || deploymentSource?.trim();
}

function toCheckType(type: string): CheckType {
  return type.toLowerCase() as CheckType;
}

export async function POST(_request: Request, context: RouteContext) {
  const { checkId } = await context.params;
  const check = await prisma.check.findUnique({
    include: {
      deployment: {
        select: {
          source: true,
        },
      },
      project: {
        select: {
          id: true,
          slug: true,
        },
      },
    },
    where: {
      id: checkId,
    },
  });

  if (!check || !check.enabled) {
    return NextResponse.json({ error: "Check was not found." }, { status: 404 });
  }

  const rootDir = resolveRootDir(check.deployment?.source);

  if (!rootDir) {
    return NextResponse.json(
      {
        error:
          "Check source root is unknown. Redeploy checks or set SELFCHECKS_CHECKS_ROOT.",
      },
      { status: 422 },
    );
  }

  const run = await prisma.checkRun.create({
    data: {
      checkId: check.id,
      projectId: check.project.id,
      runSource: "MANUAL",
      status: "QUEUED",
    },
    select: {
      id: true,
    },
  });
  const env = await getRunEnvironment(check.project.slug);
  const queue = createCheckQueue();

  try {
    await queue.add(
      "run-check",
      {
        checkId: check.id,
        checkKey: check.key,
        env,
        projectSlug: check.project.slug,
        rootDir,
        runId: run.id,
        runSource: "MANUAL",
        type: toCheckType(check.type),
      },
      {
        jobId: run.id,
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await prisma.checkRun.update({
      data: {
        errorMessage: message,
        finishedAt: new Date(),
        status: "FAILED",
      },
      where: {
        id: run.id,
      },
    });

    return NextResponse.json(
      {
        error: "Unable to queue check run.",
      },
      { status: 503 },
    );
  } finally {
    await queue.close();
  }

  return NextResponse.json(
    {
      runId: run.id,
      status: "queued",
    },
    { status: 202 },
  );
}
