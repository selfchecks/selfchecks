import { Queue } from "bullmq";
import { NextResponse } from "next/server";

import { normalizeCheckQueueName, type DeploySummary } from "@selfchecks/core";

import { isCliRequestAuthorized } from "@/lib/cli-auth";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ deploymentId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  if (!(await isCliRequestAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { deploymentId } = await context.params;
  const queue = createCheckQueue();

  try {
    const job = await queue.getJob(deploymentId);

    if (!job) {
      return NextResponse.json({ error: "Deployment was not found." }, { status: 404 });
    }

    const state = await job.getState();

    if (state === "completed") {
      return NextResponse.json({
        deploymentId,
        status: "completed",
        summary: job.returnvalue as DeploySummary,
      });
    }

    if (state === "failed") {
      return NextResponse.json({
        deploymentId,
        error: job.failedReason || "Deployment failed.",
        status: "failed",
      });
    }

    return NextResponse.json({ deploymentId, status: state });
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
