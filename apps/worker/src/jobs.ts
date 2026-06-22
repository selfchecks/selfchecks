import { type Job } from "bullmq";

import { type CheckType } from "@selfchecks/core";

export type CheckJob = {
  checkId: string;
  projectSlug: string;
  type: CheckType;
};

export type CheckJobResult = {
  status: "pending_runner_implementation";
};

export async function handleCheckJob(
  job: Pick<Job<CheckJob>, "data">,
): Promise<CheckJobResult> {
  console.log(
    `Received ${job.data.type} check ${job.data.checkId} for ${job.data.projectSlug}`,
  );

  return {
    status: "pending_runner_implementation",
  };
}
