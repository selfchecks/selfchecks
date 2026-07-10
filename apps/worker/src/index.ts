import { Queue, Worker } from "bullmq";

import { defaultPerformanceSettings } from "@selfchecks/core";

import { getWorkerRuntimeConfig } from "./config.js";
import { type CheckJob, handleSelfchecksJob } from "./jobs.js";
import { readPerformanceRuntimeSettings } from "./performance-settings.js";
import { CheckScheduler } from "./scheduler.js";

const config = getWorkerRuntimeConfig();
const fallbackPerformanceSettings = {
  ...defaultPerformanceSettings,
  workerConcurrency: config.concurrency,
};
const performanceSettings = await readPerformanceRuntimeSettings({
  fallback: fallbackPerformanceSettings,
  logger: console,
});

export const checkQueue = new Queue<CheckJob>(config.queueName, {
  connection: config.connection,
  defaultJobOptions: config.defaultJobOptions,
});

const worker = new Worker<CheckJob>(config.queueName, handleSelfchecksJob, {
  concurrency: performanceSettings.workerConcurrency,
  connection: config.connection,
});
const scheduler = config.scheduler.enabled
  ? new CheckScheduler({
      config: {
        checksRoot: config.checksRoot,
        pollIntervalMs: config.scheduler.pollIntervalMs,
        queuedRunTimeoutMinutes: config.scheduler.queuedRunTimeoutMinutes,
        reporter: config.scheduler.reporter,
        runningRunTimeoutMinutes: config.scheduler.runningRunTimeoutMinutes,
      },
      logger: console,
      queue: checkQueue,
    })
  : undefined;
let performanceSyncTimer: NodeJS.Timeout | undefined;

worker.on("completed", (job) => {
  console.log(`Completed queued check job ${job.id}`);
});

worker.on("failed", (job, error) => {
  console.error(`Failed queued check job ${job?.id ?? "unknown"}:`, error);
});

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  console.log(`Received ${signal}; closing worker and queue.`);
  stopPerformanceSettingsSync();
  scheduler?.close();
  await worker.close();
  await checkQueue.close();
}

async function syncPerformanceSettings(): Promise<void> {
  const nextSettings = await readPerformanceRuntimeSettings({
    fallback: fallbackPerformanceSettings,
    logger: console,
  });

  if (worker.concurrency === nextSettings.workerConcurrency) {
    return;
  }

  worker.concurrency = nextSettings.workerConcurrency;
  console.log(
    `selfchecks worker concurrency updated to ${nextSettings.workerConcurrency}`,
  );
}

function startPerformanceSettingsSync(): void {
  if (performanceSyncTimer) {
    return;
  }

  performanceSyncTimer = setInterval(() => {
    void syncPerformanceSettings();
  }, config.scheduler.pollIntervalMs);
  performanceSyncTimer.unref?.();
}

function stopPerformanceSettingsSync(): void {
  if (!performanceSyncTimer) {
    return;
  }

  clearInterval(performanceSyncTimer);
  performanceSyncTimer = undefined;
}

process.once("SIGINT", (signal) => {
  void shutdown(signal);
});

process.once("SIGTERM", (signal) => {
  void shutdown(signal);
});

console.log(`selfchecks worker listening on queue ${config.queueName}`);
startPerformanceSettingsSync();

if (scheduler) {
  scheduler.start();
  console.log(
    `selfchecks scheduler polling every ${config.scheduler.pollIntervalMs} ms`,
  );
} else {
  console.log("selfchecks scheduler disabled");
}
