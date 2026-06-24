import { type JobsOptions } from "bullmq";
import { normalizeCheckQueueName } from "@selfchecks/core";

export type WorkerRuntimeConfig = {
  concurrency: number;
  connection: {
    host: string;
    port: number;
  };
  defaultJobOptions: JobsOptions;
  queueName: string;
};

export type WorkerRuntimeEnv = {
  REDIS_HOST?: string;
  REDIS_PORT?: string;
  SELFCHECKS_QUEUE_NAME?: string;
  SELFCHECKS_WORKER_CONCURRENCY?: string;
};

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

export function getWorkerRuntimeConfig(
  env: WorkerRuntimeEnv = process.env,
): WorkerRuntimeConfig {
  return {
    concurrency: parsePositiveInteger(env.SELFCHECKS_WORKER_CONCURRENCY, 2),
    connection: {
      host: env.REDIS_HOST || "localhost",
      port: parsePositiveInteger(env.REDIS_PORT, 6379),
    },
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: 1000,
      removeOnFail: 1000,
    },
    queueName: normalizeCheckQueueName(env.SELFCHECKS_QUEUE_NAME),
  };
}
