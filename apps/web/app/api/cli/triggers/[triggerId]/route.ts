import { Queue } from "bullmq";
import { NextResponse } from "next/server";

import { normalizeCheckQueueName } from "@selfchecks/core";

import type { RunChecksSummary } from "@selfchecks/cli/runner";

import { isCliRequestAuthorized } from "@/lib/cli-auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ triggerId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  if (!(await isCliRequestAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { triggerId } = await context.params;
  const session = await prisma.testSession.findUnique({
    where: { id: triggerId },
    select: {
      id: true,
      kind: true,
      status: true,
      createdAt: true,
      runs: {
        orderBy: [{ attempt: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          retryGroupId: true,
          status: true,
          checkSnapshotKey: true,
          checkSnapshotName: true,
          durationMs: true,
          errorMessage: true,
          finishedAt: true,
        },
      },
    },
  });

  if (session?.kind === "TRIGGER") {
    if (
      session.runs.some((run) => run.status === "QUEUED" || run.status === "RUNNING")
    ) {
      return NextResponse.json({
        status: session.status === "QUEUED" ? "queued" : "active",
        triggerId,
      });
    }

    // Only the final attempt of each check contributes to the CLI summary.
    const finalRuns = new Map(
      session.runs.map((run) => [run.retryGroupId ?? run.id, run]),
    );
    const results = [...finalRuns.values()].map((run) => ({
      checkKey: run.checkSnapshotKey ?? run.id,
      checkName: run.checkSnapshotName ?? run.id,
      durationMs: run.durationMs ?? 0,
      errorMessage: run.errorMessage ?? undefined,
      runId: run.id,
      status: run.status.toLowerCase(),
    }));
    const passed = results.filter((result) => result.status === "passed").length;
    const finishedAt = session.runs.reduce(
      (latest, run) => Math.max(latest, run.finishedAt?.getTime() ?? latest),
      session.createdAt.getTime(),
    );

    return NextResponse.json({
      status: "completed",
      summary: {
        durationMs: finishedAt - session.createdAt.getTime(),
        failed: results.length - passed,
        passed,
        results,
        sessionId: session.id,
        skipped: 0,
        total: results.length,
      },
      triggerId,
    });
  }

  // Keep polling compatible with project jobs queued before this deployment.
  const queue = createCheckQueue();

  try {
    const job = await queue.getJob(triggerId);

    if (!job) {
      return NextResponse.json({ error: "Trigger was not found." }, { status: 404 });
    }

    const state = await job.getState();

    if (state === "completed") {
      return NextResponse.json({
        status: "completed",
        summary: job.returnvalue as RunChecksSummary,
        triggerId,
      });
    }

    if (state === "failed") {
      return NextResponse.json({
        error: job.failedReason || "Trigger failed.",
        status: "failed",
        triggerId,
      });
    }

    return NextResponse.json({ status: state, triggerId });
  } finally {
    await queue.close();
  }
}

function createCheckQueue() {
  return new Queue(normalizeCheckQueueName(process.env.SELFCHECKS_QUEUE_NAME), {
    connection: {
      host: process.env.REDIS_HOST || "localhost",
      port: parsePositiveInteger(process.env.REDIS_PORT, 6379),
    },
  });
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
