import { Queue, Worker } from "bullmq";

import { getWorkerRuntimeConfig } from "./config.js";
import { type CheckJob, handleCheckJob } from "./jobs.js";
import { CheckScheduler } from "./scheduler.js";

const config = getWorkerRuntimeConfig();

export const checkQueue = new Queue<CheckJob>(config.queueName, {
  connection: config.connection,
  defaultJobOptions: config.defaultJobOptions,
});

const worker = new Worker<CheckJob>(config.queueName, handleCheckJob, {
  concurrency: config.concurrency,
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

worker.on("completed", (job) => {
  console.log(`Completed queued check job ${job.id}`);
});

worker.on("failed", (job, error) => {
  console.error(`Failed queued check job ${job?.id ?? "unknown"}:`, error);
});

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  console.log(`Received ${signal}; closing worker and queue.`);
  scheduler?.close();
  await worker.close();
  await checkQueue.close();
}

process.once("SIGINT", (signal) => {
  void shutdown(signal);
});

process.once("SIGTERM", (signal) => {
  void shutdown(signal);
});

console.log(`selfchecks worker listening on queue ${config.queueName}`);

if (scheduler) {
  scheduler.start();
  console.log(
    `selfchecks scheduler polling every ${config.scheduler.pollIntervalMs} ms`,
  );
} else {
  console.log("selfchecks scheduler disabled");
}
