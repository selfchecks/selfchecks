import { Queue } from "bullmq";
import { NextResponse } from "next/server";

import { Prisma } from "@prisma/client";
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
  accounts: string[];
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
  testSessionId?: string;
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

export async function POST(request: Request, context: RouteContext) {
  const { checkId } = await context.params;
  const include = {
    deployment: {
      select: {
        source: true,
      },
    },
    group: {
      select: {
        name: true,
      },
    },
    project: {
      select: {
        id: true,
        slug: true,
      },
    },
  } as const;
  let check = await prisma.check.findUnique({
    include,
    where: {
      id: checkId,
    },
  });
  const searchParams = new URL(request.url).searchParams;
  const projectSlug = searchParams.get("project")?.trim();
  const testSessionId = searchParams.get("testSession")?.trim();

  if (!check && projectSlug) {
    check = await prisma.check.findFirst({
      include,
      where: {
        key: checkId,
        project: {
          slug: projectSlug,
        },
      },
    });
  }

  if (!check || !check.enabled) {
    return NextResponse.json({ error: "Check was not found." }, { status: 404 });
  }

  const testSession = testSessionId
    ? await prisma.testSession.findFirst({
        select: {
          id: true,
        },
        where: {
          id: testSessionId,
          kind: "TEST",
          projectId: check.project.id,
          runs: {
            some: {
              OR: [
                {
                  checkId: check.id,
                },
                {
                  checkSnapshotKey: check.key,
                },
              ],
            },
          },
        },
      })
    : undefined;

  if (testSessionId && !testSession) {
    return NextResponse.json(
      { error: "Test was not found in this test session." },
      { status: 404 },
    );
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

  const runData: Prisma.CheckRunUncheckedCreateInput = {
    checkId: check.id,
    ...(testSession
      ? {
          checkSnapshotAccounts: check.accounts,
          checkSnapshotDegradedResponseTime: check.degradedResponseTime,
          checkSnapshotEntrypoint: check.entrypoint,
          checkSnapshotGroupName: check.group?.name,
          checkSnapshotKey: check.key,
          checkSnapshotName: check.name,
          checkSnapshotProjectSlug: check.project.slug,
          ...(check.request === null
            ? {}
            : { checkSnapshotRequest: check.request as Prisma.InputJsonValue }),
          checkSnapshotTags: check.tags,
          checkSnapshotType: check.type,
          testSessionId: testSession.id,
        }
      : {}),
    projectId: check.project.id,
    runSource: "MANUAL",
    status: "QUEUED",
  };
  const run = testSession
    ? await prisma.$transaction(async (tx) => {
        await tx.testSession.update({
          data: {
            aiAnalysis: Prisma.DbNull,
            status: "RUNNING",
          },
          where: {
            id: testSession.id,
          },
        });

        return tx.checkRun.create({
          data: runData,
          select: {
            id: true,
          },
        });
      })
    : await prisma.checkRun.create({
        data: runData,
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
        accounts: check.accounts,
        checkId: check.id,
        checkKey: check.key,
        env,
        projectSlug: check.project.slug,
        rootDir,
        runId: run.id,
        runSource: "MANUAL",
        ...(testSession ? { testSessionId: testSession.id } : {}),
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

    if (testSession) {
      await prisma.testSession.update({
        data: {
          status: "FAILED",
        },
        where: {
          id: testSession.id,
        },
      });
    }

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
