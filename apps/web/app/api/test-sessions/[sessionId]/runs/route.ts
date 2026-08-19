import { Queue } from "bullmq";
import { NextResponse } from "next/server";

import { Prisma } from "@prisma/client";
import { getRunEnvironment } from "@selfchecks/cli/environment";
import type { CheckType } from "@selfchecks/core";

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    sessionId: string;
  }>;
};

type SessionRunAction = "full-regression" | "rerun-failed" | "rerun-session";

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
  testSessionId: string;
  type: CheckType;
};

const failedStatuses = ["CANCELLED", "FAILED", "TIMED_OUT"] as const;
const checkInclude = {
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
} satisfies Prisma.CheckInclude;

type RunnableCheck = Prisma.CheckGetPayload<{
  include: typeof checkInclude;
}>;

export async function GET(_request: Request, context: RouteContext) {
  const { sessionId } = await context.params;
  const session = await prisma.testSession.findFirst({
    select: {
      id: true,
    },
    where: {
      id: sessionId,
      kind: "TEST",
    },
  });

  if (!session) {
    return NextResponse.json({ error: "Test session was not found." }, { status: 404 });
  }

  const projects = await prisma.project.findMany({
    orderBy: [{ name: "asc" }, { slug: "asc" }],
    select: {
      _count: {
        select: {
          checks: {
            where: {
              enabled: true,
            },
          },
        },
      },
      name: true,
      slug: true,
    },
    where: {
      checks: {
        some: {
          enabled: true,
        },
      },
    },
  });

  return NextResponse.json({
    projects: projects.map((project) => ({
      checkCount: project._count.checks,
      name: project.name,
      slug: project.slug,
    })),
  });
}

export async function POST(request: Request, context: RouteContext) {
  const { sessionId } = await context.params;
  const body = await readActionBody(request);

  if (body instanceof NextResponse) {
    return body;
  }

  const session = await loadSessionForActions(sessionId);

  if (!session) {
    return NextResponse.json({ error: "Test session was not found." }, { status: 404 });
  }

  const checksResult =
    body.action === "full-regression"
      ? await findFullRegressionChecks(body.projectSlugs)
      : await findSessionChecks(session, body.action === "rerun-failed");

  if ("error" in checksResult) {
    return NextResponse.json(
      { error: checksResult.error },
      { status: checksResult.status },
    );
  }

  const checks = checksResult.checks;
  const missingSources = checks.filter((check) => !resolveRootDir(check, session));

  if (missingSources.length > 0) {
    return NextResponse.json(
      {
        error: `Check source root is unknown for ${formatCheckList(missingSources)}. Redeploy checks or set SELFCHECKS_CHECKS_ROOT.`,
      },
      { status: 422 },
    );
  }

  const environments = await loadProjectEnvironments(checks, session.targetUrl);
  const queued = await createQueuedRuns(session, checks, body.action);
  const queue = createCheckQueue();

  try {
    await queue.addBulk(
      queued.runs.map(({ check, runId }) => ({
        data: {
          checkId: check.id,
          checkKey: check.key,
          env: environments.get(check.project.slug) ?? [],
          projectSlug: check.project.slug,
          rootDir: resolveRootDir(check, session)!,
          runId,
          runSource: "MANUAL" as const,
          testSessionId: queued.sessionId,
          type: check.type.toLowerCase() as CheckType,
        },
        name: "run-check",
        opts: {
          jobId: runId,
        },
      })),
    );
  } catch (error) {
    await markQueueFailure(
      queued.sessionId,
      queued.runs.map((run) => run.runId),
      error instanceof Error ? error.message : String(error),
    );

    return NextResponse.json(
      { error: "Unable to queue test session runs." },
      { status: 503 },
    );
  } finally {
    await queue.close();
  }

  return NextResponse.json(
    {
      runCount: queued.runs.length,
      sessionId: queued.sessionId,
      status: "queued",
    },
    { status: 202 },
  );
}

async function readActionBody(request: Request): Promise<
  | NextResponse
  | {
      action: SessionRunAction;
      projectSlugs: string[];
    }
> {
  let value: unknown;

  try {
    value = await request.json();
  } catch {
    return NextResponse.json(
      { error: "A JSON request body is required." },
      { status: 400 },
    );
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return NextResponse.json(
      { error: "Invalid test session action." },
      { status: 400 },
    );
  }

  const body = value as { action?: unknown; projectSlugs?: unknown };

  if (
    body.action !== "full-regression" &&
    body.action !== "rerun-failed" &&
    body.action !== "rerun-session"
  ) {
    return NextResponse.json(
      { error: "Invalid test session action." },
      { status: 400 },
    );
  }

  const projectSlugs = Array.isArray(body.projectSlugs)
    ? [
        ...new Set(
          body.projectSlugs
            .filter((slug): slug is string => typeof slug === "string")
            .map((slug) => slug.trim())
            .filter(Boolean),
        ),
      ]
    : [];

  if (body.action === "full-regression" && projectSlugs.length === 0) {
    return NextResponse.json(
      { error: "Select at least one project." },
      { status: 400 },
    );
  }

  return {
    action: body.action,
    projectSlugs,
  };
}

async function findFullRegressionChecks(
  projectSlugs: string[],
): Promise<{ checks: RunnableCheck[] } | { error: string; status: number }> {
  const projects = await prisma.project.findMany({
    select: {
      slug: true,
    },
    where: {
      checks: {
        some: {
          enabled: true,
        },
      },
      slug: {
        in: projectSlugs,
      },
    },
  });
  const availableSlugs = new Set(projects.map((project) => project.slug));
  const unavailableSlugs = projectSlugs.filter((slug) => !availableSlugs.has(slug));

  if (unavailableSlugs.length > 0) {
    return {
      error: `No enabled tests were found for ${unavailableSlugs.join(", ")}.`,
      status: 422,
    };
  }

  const checks = await prisma.check.findMany({
    include: checkInclude,
    orderBy: [{ project: { name: "asc" } }, { name: "asc" }],
    where: {
      enabled: true,
      project: {
        slug: {
          in: projectSlugs,
        },
      },
    },
  });

  return { checks };
}

async function findSessionChecks(
  session: NonNullable<Awaited<ReturnType<typeof loadSessionForActions>>>,
  failedOnly: boolean,
): Promise<{ checks: RunnableCheck[] } | { error: string; status: number }> {
  const identities = new Map<string, { checkKey: string; projectSlug: string }>();
  const seenIdentities = new Set<string>();

  for (const run of session.runs) {
    const checkKey = run.check?.key ?? run.checkSnapshotKey;
    const projectSlug =
      run.check?.project.slug ?? run.checkSnapshotProjectSlug ?? session.project.slug;

    if (!checkKey) {
      continue;
    }

    const identity = getCheckIdentity(projectSlug, checkKey);

    if (seenIdentities.has(identity)) {
      continue;
    }

    seenIdentities.add(identity);

    if (
      failedOnly &&
      !failedStatuses.includes(run.status as (typeof failedStatuses)[number])
    ) {
      continue;
    }

    identities.set(identity, { checkKey, projectSlug });
  }

  if (identities.size === 0) {
    return {
      error: failedOnly
        ? "This test session has no failed tests to rerun."
        : "This test session has no tests to rerun.",
      status: 422,
    };
  }

  const checks = await prisma.check.findMany({
    include: checkInclude,
    orderBy: [{ project: { name: "asc" } }, { name: "asc" }],
    where: {
      enabled: true,
      OR: [...identities.values()].map(({ checkKey, projectSlug }) => ({
        key: checkKey,
        project: {
          slug: projectSlug,
        },
      })),
    },
  });

  if (checks.length !== identities.size) {
    const foundIdentities = new Set(
      checks.map((check) => getCheckIdentity(check.project.slug, check.key)),
    );
    const unavailable = [...identities.values()].filter(
      ({ checkKey, projectSlug }) =>
        !foundIdentities.has(getCheckIdentity(projectSlug, checkKey)),
    );

    return {
      error: `Some tests are no longer available: ${unavailable
        .map(({ checkKey, projectSlug }) => `${projectSlug}/${checkKey}`)
        .join(", ")}.`,
      status: 422,
    };
  }

  return { checks };
}

function loadSessionForActions(sessionId: string) {
  return prisma.testSession.findFirst({
    include: {
      project: {
        select: {
          slug: true,
        },
      },
      runs: {
        include: {
          check: {
            include: {
              project: {
                select: {
                  slug: true,
                },
              },
            },
          },
        },
        orderBy: [{ createdAt: "desc" }, { attempt: "desc" }],
      },
    },
    where: {
      id: sessionId,
      kind: "TEST",
    },
  });
}

async function createQueuedRuns(
  session: NonNullable<Awaited<ReturnType<typeof loadSessionForActions>>>,
  checks: RunnableCheck[],
  action: SessionRunAction,
) {
  return prisma.$transaction(async (tx) => {
    const targetSession =
      action === "full-regression"
        ? await tx.testSession.create({
            data: {
              commitSha: session.commitSha,
              jobUrl: session.jobUrl,
              kind: "TEST",
              name: session.name,
              pipelineUrl: session.pipelineUrl,
              projectId: session.projectId,
              ref: session.ref,
              repository: session.repository,
              source: session.source,
              status: "RUNNING",
              targetUrl: session.targetUrl,
              workspacePath: session.workspacePath,
            },
            select: {
              id: true,
            },
          })
        : await tx.testSession.update({
            data: {
              aiAnalysis: Prisma.DbNull,
              status: "RUNNING",
            },
            select: {
              id: true,
            },
            where: {
              id: session.id,
            },
          });
    const runs: Array<{ check: RunnableCheck; runId: string }> = [];

    for (const check of checks) {
      const run = await tx.checkRun.create({
        data: buildRunData(check, targetSession.id),
        select: {
          id: true,
        },
      });

      runs.push({ check, runId: run.id });
    }

    return {
      runs,
      sessionId: targetSession.id,
    };
  });
}

function buildRunData(
  check: RunnableCheck,
  testSessionId: string,
): Prisma.CheckRunUncheckedCreateInput {
  return {
    checkId: check.id,
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
    projectId: check.project.id,
    runSource: "MANUAL",
    status: "QUEUED",
    testSessionId,
  };
}

async function loadProjectEnvironments(
  checks: RunnableCheck[],
  targetUrl: string | null,
) {
  const projectSlugs = [...new Set(checks.map((check) => check.project.slug))];
  const entries = await Promise.all(
    projectSlugs.map(
      async (projectSlug) =>
        [
          projectSlug,
          applyTargetUrl(await getRunEnvironment(projectSlug), targetUrl),
        ] as const,
    ),
  );

  return new Map(entries);
}

function applyTargetUrl(
  environment: Array<{ name: string; value: string }>,
  targetUrl: string | null,
) {
  if (!targetUrl) {
    return environment;
  }

  const targetVariableNames = new Set([
    "APP_URL",
    "BASE_URL",
    "ENVIRONMENT_URL",
    "PLAYWRIGHT_BASE_URL",
    "PLAYWRIGHT_TEST_BASE_URL",
    "TARGET_URL",
  ]);
  let replaced = false;
  const updatedEnvironment = environment.map((variable) => {
    if (!targetVariableNames.has(variable.name)) {
      return variable;
    }

    replaced = true;
    return {
      ...variable,
      value: targetUrl,
    };
  });
  const environmentWithBaseUrl = replaced
    ? updatedEnvironment
    : [...updatedEnvironment, { name: "BASE_URL", value: targetUrl }];

  return environmentWithBaseUrl.some(
    (variable) => variable.name === "PLAYWRIGHT_BASE_URL",
  )
    ? environmentWithBaseUrl
    : [...environmentWithBaseUrl, { name: "PLAYWRIGHT_BASE_URL", value: targetUrl }];
}

async function markQueueFailure(
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

function resolveRootDir(
  check: RunnableCheck,
  session: NonNullable<Awaited<ReturnType<typeof loadSessionForActions>>>,
) {
  if (check.project.slug === session.project.slug) {
    const workspacePath = session.workspacePath?.trim();

    if (workspacePath) {
      return workspacePath;
    }
  }

  return process.env.SELFCHECKS_CHECKS_ROOT?.trim() || check.deployment?.source?.trim();
}

function getCheckIdentity(projectSlug: string, checkKey: string) {
  return `${projectSlug}\u0000${checkKey}`;
}

function formatCheckList(checks: RunnableCheck[]) {
  return checks
    .slice(0, 5)
    .map((check) => `${check.project.slug}/${check.key}`)
    .join(", ");
}

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

  return Number.isSafeInteger(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
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
