import { type Job } from "bullmq";

import { type CheckType } from "@selfchecks/core";
import { runCheckById, type EnvVar } from "@selfchecks/cli/runner";
import { prisma } from "@selfchecks/db";

export type CheckJob = {
  checkId: string;
  checkKey: string;
  env?: EnvVar[];
  projectSlug: string;
  reporter?: string;
  rootDir: string;
  runId?: string;
  type: CheckType;
};

export type CheckJobResult = {
  checkKey: string;
  checkName: string;
  durationMs: number;
  runId?: string;
  status: string;
};

export async function handleCheckJob(
  job: Pick<Job<CheckJob>, "data">,
): Promise<CheckJobResult> {
  console.log(
    `Running ${job.data.type} check ${job.data.checkKey} for ${job.data.projectSlug}`,
  );

  try {
    return await runCheckById({
      checkId: job.data.checkId,
      env: job.data.env ?? [],
      projectSlug: job.data.projectSlug,
      record: true,
      reporter: job.data.reporter ?? "list",
      rootDir: job.data.rootDir,
      runId: job.data.runId,
    });
  } catch (error) {
    if (job.data.runId) {
      await prisma.checkRun.update({
        data: {
          errorMessage: error instanceof Error ? error.message : String(error),
          finishedAt: new Date(),
          status: "FAILED",
        },
        where: {
          id: job.data.runId,
        },
      });
    }

    throw error;
  }
}
