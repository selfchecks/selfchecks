import { NextResponse } from "next/server";

import { Prisma } from "@prisma/client";
import { analyzeFailedTestSession } from "@selfchecks/cli/ai-analysis";

import { prisma } from "@/lib/prisma";
import {
  summarizeTestSessionFailures,
  type TestSessionFailureInput,
} from "@/lib/test-session-analysis";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    sessionId: string;
  }>;
};

const ACTIVE_STATUSES = new Set(["QUEUED", "RUNNING"]);
const FAILED_STATUSES = new Set(["CANCELLED", "FAILED", "TIMED_OUT"]);

export async function POST(_request: Request, context: RouteContext) {
  const { sessionId } = await context.params;
  const session = await prisma.testSession.findFirst({
    select: {
      id: true,
      aiAnalysis: true,
      name: true,
      ref: true,
      status: true,
      targetUrl: true,
      project: {
        select: {
          slug: true,
        },
      },
      runs: {
        orderBy: [{ createdAt: "desc" }, { attempt: "desc" }],
        select: {
          attempt: true,
          checkSnapshotKey: true,
          checkSnapshotName: true,
          checkSnapshotProjectSlug: true,
          createdAt: true,
          errorMessage: true,
          id: true,
          result: true,
          status: true,
          check: {
            select: {
              id: true,
              key: true,
              name: true,
              project: {
                select: {
                  slug: true,
                },
              },
            },
          },
        },
      },
    },
    where: {
      id: sessionId,
      kind: "TEST",
    },
  });

  if (!session) {
    return NextResponse.json({ error: "Test session was not found." }, { status: 404 });
  }

  if (
    ACTIVE_STATUSES.has(session.status) ||
    session.runs.some((run) => ACTIVE_STATUSES.has(run.status))
  ) {
    return NextResponse.json(
      { error: "AI analysis is available after every test in the session finishes." },
      { status: 409 },
    );
  }

  const latestRuns = selectLatestRuns(session.runs, session.project.slug);
  const failedRuns = latestRuns.filter((run) => FAILED_STATUSES.has(run.status));

  if (failedRuns.length === 0) {
    return NextResponse.json(
      { error: "This test session has no failed tests to analyze." },
      { status: 422 },
    );
  }

  const failures = failedRuns.map((run) => mapFailure(run, session.project.slug));
  const summary = summarizeTestSessionFailures(failures);
  const failedRunIds = failedRuns.map((run) => run.id).sort();
  const cachedAnalysis = readCachedAnalysis(session.aiAnalysis, failedRunIds);

  if (cachedAnalysis) {
    return NextResponse.json(cachedAnalysis);
  }

  const categoryByRunId = new Map(
    summary.categories.flatMap((category) =>
      category.tests.map((test) => [test.runId, category.key] as const),
    ),
  );
  const analysis = await analyzeFailedTestSession({
    categories: summary.categories.map(({ count, key, label }) => ({
      count,
      key,
      label,
    })),
    failures: failures.map((failure) => ({
      category: categoryByRunId.get(failure.runId) ?? "other",
      checkKey: failure.checkKey,
      checkName: failure.checkName,
      errorMessage: failure.errorMessage,
      existingAnalysis: getExistingAnalysis(failure.result),
      projectSlug: failure.projectSlug,
      status: failure.status,
    })),
    projectSlug: session.project.slug,
    ref: session.ref,
    sessionName: session.name,
    targetUrl: session.targetUrl,
  });

  const payload = {
    analysis:
      analysis ??
      ({
        error:
          "AI analysis is not configured. Failure categories were calculated from the recorded errors.",
        status: "unavailable",
      } as const),
    ...summary,
  };

  if (analysis?.status === "completed") {
    await prisma.testSession.update({
      data: {
        aiAnalysis: toJsonValue({
          ...payload,
          failedRunIds,
        }),
      },
      where: {
        id: session.id,
      },
    });
  }

  return NextResponse.json(payload);
}

function selectLatestRuns<
  T extends {
    check: { key: string; project: { slug: string } } | null;
    checkSnapshotKey: string | null;
    checkSnapshotProjectSlug: string | null;
  },
>(runs: T[], fallbackProjectSlug: string) {
  const latestRuns = new Map<string, T>();

  for (const run of runs) {
    const checkKey = run.check?.key ?? run.checkSnapshotKey;

    if (!checkKey) {
      continue;
    }

    const projectSlug =
      run.check?.project.slug ?? run.checkSnapshotProjectSlug ?? fallbackProjectSlug;
    const identity = `${projectSlug}\u0000${checkKey}`;

    if (!latestRuns.has(identity)) {
      latestRuns.set(identity, run);
    }
  }

  return [...latestRuns.values()];
}

function mapFailure(
  run: {
    check: {
      id: string;
      key: string;
      name: string;
      project: { slug: string };
    } | null;
    checkSnapshotKey: string | null;
    checkSnapshotName: string | null;
    checkSnapshotProjectSlug: string | null;
    errorMessage: string | null;
    id: string;
    result: unknown;
    status: string;
  },
  fallbackProjectSlug: string,
): TestSessionFailureInput {
  const checkKey = run.check?.key ?? run.checkSnapshotKey ?? run.id;

  return {
    checkId: run.check?.id,
    checkKey,
    checkName: run.check?.name ?? run.checkSnapshotName ?? checkKey,
    errorMessage: run.errorMessage,
    projectSlug:
      run.check?.project.slug ?? run.checkSnapshotProjectSlug ?? fallbackProjectSlug,
    result: run.result,
    runId: run.id,
    status: run.status,
  };
}

function getExistingAnalysis(result: unknown) {
  const resultRecord = asRecord(result);
  const analysis = asRecord(resultRecord.aiAnalysis);

  return typeof analysis.content === "string" ? analysis.content : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readCachedAnalysis(value: unknown, failedRunIds: string[]) {
  const stored = asRecord(value);
  const storedRunIds = Array.isArray(stored.failedRunIds)
    ? stored.failedRunIds.filter((runId): runId is string => typeof runId === "string")
    : [];

  if (
    storedRunIds.length !== failedRunIds.length ||
    storedRunIds.some((runId, index) => runId !== failedRunIds[index]) ||
    !stored.analysis ||
    !Array.isArray(stored.categories) ||
    typeof stored.failedCount !== "number"
  ) {
    return undefined;
  }

  return {
    analysis: stored.analysis,
    categories: stored.categories,
    failedCount: stored.failedCount,
  };
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
