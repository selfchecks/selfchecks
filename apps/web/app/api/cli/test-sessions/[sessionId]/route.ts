import { NextResponse } from "next/server";

import { summarizeTerminalRunStatuses, type CheckRunStatus } from "@selfchecks/core";

import { isCliRequestAuthorized } from "@/lib/cli-auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    sessionId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  if (!(await isCliRequestAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { sessionId } = await context.params;
  const session = await prisma.testSession.findUnique({
    include: {
      runs: {
        orderBy: [
          {
            createdAt: "asc",
          },
          {
            attempt: "asc",
          },
        ],
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

  const inferredStatus = summarizeTerminalRunStatuses(
    getFinalRuns(session.runs).map((run) => run.status),
  );
  const persistedStatus = session.status;
  const status = (
    persistedStatus === "QUEUED" || persistedStatus === "RUNNING"
      ? (inferredStatus ?? persistedStatus)
      : persistedStatus
  ).toLowerCase();

  return NextResponse.json({
    sessionId: session.id,
    status,
    ...(isTerminalStatus(status) ? { summary: buildSummary(session) } : {}),
  });
}

function buildSummary(session: {
  createdAt: Date;
  id: string;
  runs: Array<{
    attempt: number;
    checkSnapshotKey: string | null;
    checkSnapshotName: string | null;
    createdAt: Date;
    durationMs: number | null;
    errorMessage: string | null;
    finishedAt: Date | null;
    id: string;
    status: string;
  }>;
}) {
  const results = getFinalRuns(session.runs).map((run) => ({
    checkKey: run.checkSnapshotKey ?? run.id,
    checkName: run.checkSnapshotName ?? run.checkSnapshotKey ?? "Unknown check",
    durationMs: run.durationMs ?? 0,
    errorMessage: run.errorMessage ?? undefined,
    runId: run.id,
    status: run.status.toLowerCase() as CheckRunStatus,
  }));
  const finishedAt = session.runs.reduce(
    (latest, run) =>
      run.finishedAt && (!latest || run.finishedAt > latest) ? run.finishedAt : latest,
    undefined as Date | undefined,
  );

  return {
    durationMs: Math.max(
      0,
      (finishedAt ?? session.createdAt).getTime() - session.createdAt.getTime(),
    ),
    failed: results.filter((result) => result.status !== "passed").length,
    passed: results.filter((result) => result.status === "passed").length,
    results,
    sessionId: session.id,
    skipped: 0,
    total: results.length,
  };
}

function getFinalRuns<
  T extends {
    attempt: number;
    checkSnapshotKey: string | null;
    id: string;
  },
>(runs: T[]): T[] {
  const finalRuns = new Map<string, T>();

  runs.forEach((run) => {
    const key = run.checkSnapshotKey ?? run.id;
    const current = finalRuns.get(key);

    if (!current || run.attempt >= current.attempt) {
      finalRuns.set(key, run);
    }
  });

  return [...finalRuns.values()];
}

function isTerminalStatus(status: string) {
  return ["cancelled", "failed", "passed", "timed_out"].includes(status);
}
