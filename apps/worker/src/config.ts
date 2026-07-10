import { type JobsOptions } from "bullmq";
import { normalizeCheckQueueName, performanceSettingsLimits } from "@selfchecks/core";

export type WorkerRuntimeConfig = {
  checksRoot?: string;
  concurrency: number;
  connection: {
    host: string;
    port: number;
  };
  defaultJobOptions: JobsOptions;
  queueName: string;
  scheduler: {
    enabled: boolean;
    pollIntervalMs: number;
    queuedRunTimeoutMinutes: number;
    reporter: string;
    runningRunTimeoutMinutes: number;
  };
};

export type WorkerRuntimeEnv = {
  REDIS_HOST?: string;
  REDIS_PORT?: string;
  SELFCHECKS_CHECKS_ROOT?: string;
  SELFCHECKS_QUEUED_RUN_TIMEOUT_MINUTES?: string;
  SELFCHECKS_RUNNING_RUN_TIMEOUT_MINUTES?: string;
  SELFCHECKS_QUEUE_NAME?: string;
  SELFCHECKS_SCHEDULER_ENABLED?: string;
  SELFCHECKS_SCHEDULER_INTERVAL_MS?: string;
  SELFCHECKS_SCHEDULER_REPORTER?: string;
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

function parseIntegerInRange(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsedValue = parsePositiveInteger(value, fallback);

  return parsedValue >= min && parsedValue <= max ? parsedValue : fallback;
}

function parseEnabled(value: string | undefined, fallback: boolean): boolean {
  if (!value) {
    return fallback;
  }

  return !["0", "false", "no", "off"].includes(value.trim().toLowerCase());
}

export function getWorkerRuntimeConfig(
  env: WorkerRuntimeEnv = process.env,
): WorkerRuntimeConfig {
  return {
    checksRoot: env.SELFCHECKS_CHECKS_ROOT?.trim() || undefined,
    concurrency: parseIntegerInRange(
      env.SELFCHECKS_WORKER_CONCURRENCY,
      performanceSettingsLimits.workerConcurrency.default,
      performanceSettingsLimits.workerConcurrency.min,
      performanceSettingsLimits.workerConcurrency.max,
    ),
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
    scheduler: {
      enabled: parseEnabled(env.SELFCHECKS_SCHEDULER_ENABLED, true),
      pollIntervalMs: parsePositiveInteger(
        env.SELFCHECKS_SCHEDULER_INTERVAL_MS,
        60_000,
      ),
      queuedRunTimeoutMinutes: parseIntegerInRange(
        env.SELFCHECKS_QUEUED_RUN_TIMEOUT_MINUTES,
        performanceSettingsLimits.queuedRunTimeoutMinutes.default,
        performanceSettingsLimits.queuedRunTimeoutMinutes.min,
        performanceSettingsLimits.queuedRunTimeoutMinutes.max,
      ),
      reporter: env.SELFCHECKS_SCHEDULER_REPORTER?.trim() || "list",
      runningRunTimeoutMinutes: parseIntegerInRange(
        env.SELFCHECKS_RUNNING_RUN_TIMEOUT_MINUTES,
        performanceSettingsLimits.runningRunTimeoutMinutes.default,
        performanceSettingsLimits.runningRunTimeoutMinutes.min,
        performanceSettingsLimits.runningRunTimeoutMinutes.max,
      ),
    },
  };
}
