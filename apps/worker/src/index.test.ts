import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  CheckScheduler: vi.fn(),
  Queue: vi.fn(),
  Worker: vi.fn(),
  getWorkerRuntimeConfig: vi.fn(),
  handleCheckJob: vi.fn(),
  queueClose: vi.fn(),
  schedulerClose: vi.fn(),
  schedulerStart: vi.fn(),
  workerClose: vi.fn(),
  workerOn: vi.fn(),
}));

vi.mock("bullmq", () => ({
  Queue: mocks.Queue,
  Worker: mocks.Worker,
}));

vi.mock("./config.js", () => ({
  getWorkerRuntimeConfig: mocks.getWorkerRuntimeConfig,
}));

vi.mock("./jobs.js", () => ({
  handleCheckJob: mocks.handleCheckJob,
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
    }));
    mocks.Worker.mockImplementation(() => ({
      close: mocks.workerClose,
      on: mocks.workerOn,
    }));
    mocks.CheckScheduler.mockImplementation(() => ({
      close: mocks.schedulerClose,
      start: mocks.schedulerStart,
    }));
    mocks.queueClose.mockResolvedValue(undefined);
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
      mocks.handleCheckJob,
      {
        concurrency: 2,
        connection: {
          host: "localhost",
          port: 6379,
        },
      },
    );
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
});
