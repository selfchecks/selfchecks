import { type JobsOptions } from "bullmq";

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

const DEFAULT_QUEUE_NAME = "selfchecks-checks";

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

function parseQueueName(value: string | undefined): string {
  const queueName = value?.trim() || DEFAULT_QUEUE_NAME;

  if (queueName.includes(":")) {
    throw new Error(
      'SELFCHECKS_QUEUE_NAME cannot contain ":" because BullMQ reserves it for Redis keys. Use "-" or "_" instead.',
    );
  }

  return queueName;
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
    queueName: parseQueueName(env.SELFCHECKS_QUEUE_NAME),
  };
}
