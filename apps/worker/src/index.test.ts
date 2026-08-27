import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  CheckScheduler: vi.fn(),
  Queue: vi.fn(),
  Worker: vi.fn(),
  getWorkerRuntimeConfig: vi.fn(),
  handleSelfchecksJob: vi.fn(),
  queueClose: vi.fn(),
  queueSetGlobalConcurrency: vi.fn(),
  readPerformanceRuntimeSettings: vi.fn(),
  schedulerClose: vi.fn(),
  schedulerStart: vi.fn(),
  workerClose: vi.fn(),
  workerOn: vi.fn(),
}));

vi.mock("bullmq", () => ({
  DelayedError: class DelayedError extends Error {
    name = "DelayedError";
  },
  Queue: mocks.Queue,
  Worker: mocks.Worker,
}));

vi.mock("./config.js", () => ({
  getWorkerRuntimeConfig: mocks.getWorkerRuntimeConfig,
}));

vi.mock("./jobs.js", () => ({
  handleSelfchecksJob: mocks.handleSelfchecksJob,
}));

vi.mock("./performance-settings.js", () => ({
  readPerformanceRuntimeSettings: mocks.readPerformanceRuntimeSettings,
}));

vi.mock("./scheduler.js", () => ({
  CheckScheduler: mocks.CheckScheduler,
}));

describe("worker entrypoint", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;
  let consoleLog: ReturnType<typeof vi.spyOn>;
  let processOnce: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    mocks.getWorkerRuntimeConfig.mockReturnValue({
      checksRoot: "/checks",
      concurrency: 2,
      connection: {
        host: "localhost",
        port: 6379,
      },
      defaultJobOptions: {
        attempts: 1,
      },
      queueName: "selfchecks-checks",
      scheduler: {
        enabled: true,
        pollIntervalMs: 5000,
        queuedRunTimeoutMinutes: 30,
        reporter: "list",
        runningRunTimeoutMinutes: 10,
      },
    });
    mocks.Queue.mockImplementation(() => ({
      close: mocks.queueClose,
      setGlobalConcurrency: mocks.queueSetGlobalConcurrency,
    }));
    mocks.Worker.mockImplementation(() => ({
      close: mocks.workerClose,
      concurrency: 2,
      on: mocks.workerOn,
    }));
    mocks.CheckScheduler.mockImplementation(() => ({
      close: mocks.schedulerClose,
      start: mocks.schedulerStart,
    }));
    mocks.queueClose.mockResolvedValue(undefined);
    mocks.queueSetGlobalConcurrency.mockResolvedValue(2);
    mocks.readPerformanceRuntimeSettings.mockResolvedValue({
      failedArtifactRetentionDays: 14,
      historyRetentionDays: 180,
      passedArtifactRetentionDays: 14,
      queuedRunTimeoutMinutes: 30,
      runningRunTimeoutMinutes: 120,
      testSessionTimeoutMinutes: 30,
      testSessionWorkspaceRetentionDays: 14,
      workerConcurrency: 2,
    });
    mocks.workerClose.mockResolvedValue(undefined);
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
    processOnce = vi.spyOn(process, "once").mockImplementation(() => process);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("creates the queue, worker, scheduler and closes them on shutdown", async () => {
    await import("./index.js");

    expect(mocks.Queue).toHaveBeenCalledWith("selfchecks-checks", {
      connection: {
        host: "localhost",
        port: 6379,
      },
      defaultJobOptions: {
        attempts: 1,
      },
    });
    expect(mocks.Worker).toHaveBeenCalledWith(
      "selfchecks-checks",
      expect.any(Function),
      {
        concurrency: 2,
        connection: {
          host: "localhost",
          port: 6379,
        },
      },
    );
    expect(mocks.queueSetGlobalConcurrency).toHaveBeenCalledWith(2);
    expect(mocks.readPerformanceRuntimeSettings).toHaveBeenCalledWith({
      fallback: {
        failedArtifactRetentionDays: 14,
        historyRetentionDays: 180,
        passedArtifactRetentionDays: 14,
        queuedRunTimeoutMinutes: 30,
        runningRunTimeoutMinutes: 120,
        testSessionTimeoutMinutes: 30,
        testSessionWorkspaceRetentionDays: 14,
        workerConcurrency: 2,
      },
      logger: console,
    });
    expect(mocks.CheckScheduler).toHaveBeenCalledWith({
      config: {
        checksRoot: "/checks",
        pollIntervalMs: 5000,
        queuedRunTimeoutMinutes: 30,
        reporter: "list",
        runningRunTimeoutMinutes: 10,
      },
      logger: console,
      queue: expect.any(Object),
    });
    expect(mocks.schedulerStart).toHaveBeenCalled();
    expect(consoleLog).toHaveBeenCalledWith(
      "selfchecks worker listening on queue selfchecks-checks",
    );

    const completedHandler = mocks.workerOn.mock.calls.find(
      ([eventName]) => eventName === "completed",
    )?.[1] as (job: { id: string }) => void;
    const failedHandler = mocks.workerOn.mock.calls.find(
      ([eventName]) => eventName === "failed",
    )?.[1] as (job: { id: string } | undefined, error: Error) => void;
    const shutdownHandler = processOnce.mock.calls.find(
      ([signal]) => signal === "SIGINT",
    )?.[1] as (signal: NodeJS.Signals) => Promise<void>;

    completedHandler({
      id: "job_1",
    });
    const error = new Error("boom");
    failedHandler(undefined, error);
    await shutdownHandler("SIGINT");

    expect(consoleLog).toHaveBeenCalledWith("Completed queued check job job_1");
    expect(consoleError).toHaveBeenCalledWith(
      "Failed queued check job unknown:",
      error,
    );
    expect(mocks.schedulerClose).toHaveBeenCalled();
    expect(mocks.workerClose).toHaveBeenCalled();
    expect(mocks.queueClose).toHaveBeenCalled();
  });

  it("defers overlapping account jobs without blocking disjoint jobs", async () => {
    const finishPaid = createDeferred<void>();

    mocks.handleSelfchecksJob.mockImplementation(async (job) => {
      if (job.id === "paid_1") {
        await finishPaid.promise;
      }

      return job.id;
    });
    await import("./index.js");
    const processor = mocks.Worker.mock.calls[0]?.[1] as (
      job: ReturnType<typeof createAccountJob>,
      token?: string,
    ) => Promise<unknown>;
    const paidJob = createAccountJob("paid_1", ["paid"]);
    const blockedPaidJob = createAccountJob("paid_2", ["paid"]);
    const freeJob = createAccountJob("free_1", ["free"]);
    const paidRun = processor(paidJob, "token_paid_1");

    await vi.waitFor(() => {
      expect(mocks.handleSelfchecksJob).toHaveBeenCalledWith(
        paidJob,
        expect.any(Object),
      );
    });
    await expect(processor(blockedPaidJob, "token_paid_2")).rejects.toMatchObject({
      name: "DelayedError",
    });
    await expect(processor(freeJob, "token_free_1")).resolves.toBe("free_1");

    expect(blockedPaidJob.moveToDelayed).toHaveBeenCalledWith(
      expect.any(Number),
      "token_paid_2",
    );
    expect(mocks.handleSelfchecksJob).not.toHaveBeenCalledWith(
      blockedPaidJob,
      expect.any(Object),
    );

    finishPaid.resolve();
    await paidRun;

    expect(blockedPaidJob.promote).toHaveBeenCalledTimes(1);
    await expect(processor(blockedPaidJob, "token_paid_2_retry")).resolves.toBe(
      "paid_2",
    );
  });
});

function createAccountJob(id: string, accounts: string[]) {
  return {
    data: {
      accounts,
      checkId: `check_${id}`,
      checkKey: id,
      projectSlug: "account",
      rootDir: "/runtime/checks",
      type: "browser" as const,
    },
    id,
    moveToDelayed: vi.fn(async () => undefined),
    promote: vi.fn(async () => undefined),
  };
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
}
