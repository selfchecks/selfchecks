import { randomUUID } from "node:crypto";
import path from "node:path";

import { Queue } from "bullmq";
import { NextResponse } from "next/server";

import { normalizeCheckQueueName } from "@selfchecks/core";

import { parseCliBundle, writeCliBundle } from "@/lib/cli-bundle";
import { isCliRequestAuthorized } from "@/lib/cli-auth";

export const runtime = "nodejs";

type DeploymentJob = {
  allowRemovals: boolean;
  kind: "deployment";
  projectSlug: string;
  rootDir: string;
};

type DeploymentMetadata = {
  allowRemovals: boolean;
  projectSlug: string;
};

export async function POST(request: Request) {
  if (!(await isCliRequestAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const metadata = parseMetadata(formData.get("metadata"));
    const deploymentId = randomUUID();
    const rootDir = path.join(resolveDeploymentsRoot(), deploymentId);

    await writeCliBundle(rootDir, await parseCliBundle(formData));

    const queue = createCheckQueue();

    try {
      await queue.add(
        "deploy-checks",
        {
          allowRemovals: metadata.allowRemovals,
          kind: "deployment",
          projectSlug: metadata.projectSlug,
          rootDir,
        },
        { jobId: deploymentId, priority: 5 },
      );
    } catch {
      return NextResponse.json(
        { error: "Unable to queue deployment." },
        { status: 503 },
      );
    } finally {
      await queue.close();
    }

    return NextResponse.json(
      {
        deploymentId,
        status: "queued",
        statusUrl: `/api/cli/deployments/${encodeURIComponent(deploymentId)}`,
      },
      { status: 202 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid deployment bundle." },
      { status: 400 },
    );
  }
}

function parseMetadata(value: FormDataEntryValue | null): DeploymentMetadata {
  if (typeof value !== "string") {
    throw new Error("Deployment metadata is required.");
  }

  const metadata = JSON.parse(value) as Partial<DeploymentMetadata>;

  if (!metadata.projectSlug?.trim()) {
    throw new Error("Project slug is required.");
  }

  return {
    allowRemovals: metadata.allowRemovals === true,
    projectSlug: metadata.projectSlug.trim(),
  };
}

function resolveDeploymentsRoot() {
  const configuredRoot = process.env.SELFCHECKS_DEPLOYMENTS_DIR?.trim();

  if (configuredRoot) {
    return configuredRoot;
  }

  return process.env.NODE_ENV === "production"
    ? "/app/runtime/deployments"
    : path.join(process.cwd(), ".selfchecks", "deployments");
}

function createCheckQueue() {
  return new Queue<DeploymentJob>(
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

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
