import { describe, expect, it } from "vitest";

import { getWorkerRuntimeConfig } from "./config.js";

describe("getWorkerRuntimeConfig", () => {
  it("returns defaults for local development", () => {
    expect(getWorkerRuntimeConfig({})).toEqual({
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
    });
  });

  it("reads queue and Redis settings from env", () => {
    expect(
      getWorkerRuntimeConfig({
        REDIS_HOST: "redis.internal",
        REDIS_PORT: "6380",
        SELFCHECKS_QUEUE_NAME: "custom-checks",
        SELFCHECKS_WORKER_CONCURRENCY: "5",
      }),
    ).toMatchObject({
      concurrency: 5,
      connection: {
        host: "redis.internal",
        port: 6380,
      },
      queueName: "custom-checks",
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
        SELFCHECKS_WORKER_CONCURRENCY: "-1",
      }),
    ).toMatchObject({
      concurrency: 2,
      connection: {
        port: 6379,
      },
    });
  });
});
