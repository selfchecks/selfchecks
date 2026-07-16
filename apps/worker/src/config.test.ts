import { describe, expect, it } from "vitest";

import { getWorkerRuntimeConfig } from "./config.js";

describe("getWorkerRuntimeConfig", () => {
  it("returns defaults for local development", () => {
    expect(getWorkerRuntimeConfig({})).toEqual({
      checksRoot: undefined,
      concurrency: 2,
      connection: {
        host: "localhost",
        port: 6379,
      },
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: 1000,
        removeOnFail: 1000,
      },
      queueName: "selfchecks-checks",
      scheduler: {
        enabled: true,
        pollIntervalMs: 60_000,
        queuedRunTimeoutMinutes: 30,
        reporter: "list",
        runningRunTimeoutMinutes: 120,
      },
    });
  });

  it("reads queue and Redis settings from env", () => {
    expect(
      getWorkerRuntimeConfig({
        REDIS_HOST: "redis.internal",
        REDIS_PORT: "6380",
        SELFCHECKS_CHECKS_ROOT: "/repo/checks",
        SELFCHECKS_QUEUED_RUN_TIMEOUT_MINUTES: "45",
        SELFCHECKS_RUNNING_RUN_TIMEOUT_MINUTES: "180",
        SELFCHECKS_QUEUE_NAME: "custom-checks",
        SELFCHECKS_SCHEDULER_ENABLED: "0",
        SELFCHECKS_SCHEDULER_INTERVAL_MS: "30000",
        SELFCHECKS_SCHEDULER_REPORTER: "dot",
        SELFCHECKS_WORKER_CONCURRENCY: "5",
      }),
    ).toMatchObject({
      checksRoot: "/repo/checks",
      concurrency: 5,
      connection: {
        host: "redis.internal",
        port: 6380,
      },
      queueName: "custom-checks",
      scheduler: {
        enabled: false,
        pollIntervalMs: 30_000,
        queuedRunTimeoutMinutes: 45,
        reporter: "dot",
        runningRunTimeoutMinutes: 180,
      },
    });
  });

  it("rejects queue names with colons because BullMQ reserves them for Redis keys", () => {
    expect(() =>
      getWorkerRuntimeConfig({
        SELFCHECKS_QUEUE_NAME: "custom:checks",
      }),
    ).toThrow('SELFCHECKS_QUEUE_NAME cannot contain ":"');
  });

  it("falls back for invalid numeric values", () => {
    expect(
      getWorkerRuntimeConfig({
        REDIS_PORT: "not-a-port",
        SELFCHECKS_QUEUED_RUN_TIMEOUT_MINUTES: "1441",
        SELFCHECKS_RUNNING_RUN_TIMEOUT_MINUTES: "1441",
        SELFCHECKS_SCHEDULER_INTERVAL_MS: "not-an-interval",
        SELFCHECKS_WORKER_CONCURRENCY: "-1",
      }),
    ).toMatchObject({
      concurrency: 2,
      connection: {
        port: 6379,
      },
      scheduler: {
        pollIntervalMs: 60_000,
        queuedRunTimeoutMinutes: 30,
        runningRunTimeoutMinutes: 120,
      },
    });
  });
});
