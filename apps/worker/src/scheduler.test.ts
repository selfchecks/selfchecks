import { mkdir, mkdtemp, rm, utimes } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  artifactDeleteMany: vi.fn(),
  artifactFindMany: vi.fn(),
  checkFindMany: vi.fn(),
  checkRunCreate: vi.fn(),
  checkRunDeleteMany: vi.fn(),
  checkRunFindMany: vi.fn(),
  checkRunUpdate: vi.fn(),
  checkRunUpdateMany: vi.fn(),
  finalizeTestSession: vi.fn(),
  getRunEnvironment: vi.fn(),
  markTestSessionRuns: vi.fn(),
  queueAdd: vi.fn(),
  queueGetJob: vi.fn(),
  readPerformanceRuntimeSettings: vi.fn(),
  testSessionFindMany: vi.fn(),
}));

vi.mock("@selfchecks/db", () => ({
  prisma: {
    artifact: {
      deleteMany: mocks.artifactDeleteMany,
      findMany: mocks.artifactFindMany,
    },
    check: {
      findMany: mocks.checkFindMany,
    },
    checkRun: {
      create: mocks.checkRunCreate,
      deleteMany: mocks.checkRunDeleteMany,
      findMany: mocks.checkRunFindMany,
      update: mocks.checkRunUpdate,
      updateMany: mocks.checkRunUpdateMany,
    },
    testSession: {
      findMany: mocks.testSessionFindMany,
    },
  },
}));

vi.mock("@selfchecks/cli/environment", () => ({
  getRunEnvironment: mocks.getRunEnvironment,
}));

vi.mock("./performance-settings.js", () => ({
  readPerformanceRuntimeSettings: mocks.readPerformanceRuntimeSettings,
}));

vi.mock("./jobs.js", () => ({
  finalizeTestSession: mocks.finalizeTestSession,
  markTestSessionRuns: mocks.markTestSessionRuns,
}));

import { scheduleDueChecks } from "./scheduler.js";

const now = new Date("2026-06-29T10:00:00.000Z");

function createLogger() {
  return {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
}

function createQueue() {
  return {
    add: mocks.queueAdd,
    getJob: mocks.queueGetJob,
  };
}

function createScheduledCheck(
  overrides: Partial<{
    deployment: { source: string | null } | null;
    frequencyMinutes: number | null;
    id: string;
    key: string;
    project: { slug: string };
    runs: Array<{ createdAt: Date; status: string }>;
    type: string;
  }> = {},
) {
  return {
    deployment: {
      source: "/repo/config/checkly",
    },
    frequencyMinutes: 5,
    id: "check_1",
    key: "issue.get",
    project: {
      slug: "account",
    },
    runs: [],
    type: "API",
    ...overrides,
  };
}

describe("scheduleDueChecks", () => {
  beforeEach(() => {
    mocks.artifactFindMany.mockResolvedValue([]);
    mocks.checkRunFindMany.mockResolvedValue([]);
    mocks.checkRunUpdateMany.mockResolvedValue({
      count: 0,
    });
    mocks.queueGetJob.mockResolvedValue(undefined);
    mocks.testSessionFindMany.mockResolvedValue([]);
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
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("creates queued runs and enqueues due checks", async () => {
    const logger = createLogger();
    mocks.checkFindMany.mockResolvedValue([createScheduledCheck()]);
    mocks.checkRunCreate.mockResolvedValue({
      id: "run_1",
    });
    mocks.getRunEnvironment.mockResolvedValue([
      {
        name: "BASE_URL",
        value: "https://app.example.com",
      },
    ]);

    await expect(
      scheduleDueChecks({
        config: {
          pollIntervalMs: 60_000,
          queuedRunTimeoutMinutes: 30,
          reporter: "dot",
          runningRunTimeoutMinutes: 120,
        },
        logger,
        now,
        queue: createQueue(),
      }),
    ).resolves.toEqual({
      active: 0,
      cancelledQueued: 0,
      cancelledRunning: 0,
      failed: 0,
      missingRoot: 0,
      notDue: 0,
      queued: 1,
      scanned: 1,
      skipped: 0,
    });

    expect(mocks.checkFindMany).toHaveBeenCalledWith({
      include: {
        deployment: {
          select: {
            source: true,
          },
        },
        project: {
          select: {
            slug: true,
          },
        },
        runs: {
          orderBy: {
            createdAt: "desc",
          },
          select: {
            createdAt: true,
            status: true,
          },
          take: 1,
        },
      },
      where: {
        enabled: true,
        frequencyMinutes: {
          gt: 0,
        },
      },
    });
    expect(mocks.checkRunCreate).toHaveBeenCalledWith({
      data: {
        checkId: "check_1",
        runSource: "SCHEDULE",
        status: "QUEUED",
      },
      select: {
        id: true,
      },
    });
    expect(mocks.queueAdd).toHaveBeenCalledWith(
      "run-check",
      {
        checkId: "check_1",
        checkKey: "issue.get",
        env: [
          {
            name: "BASE_URL",
            value: "https://app.example.com",
          },
        ],
        projectSlug: "account",
        reporter: "dot",
        rootDir: "/repo/config/checkly",
        runId: "run_1",
        runSource: "SCHEDULE",
        type: "api",
      },
      {
        jobId: "run_1",
      },
    );
    expect(mocks.checkRunUpdate).not.toHaveBeenCalled();
  });

  it("uses the configured checks root before deployment source", async () => {
    mocks.checkFindMany.mockResolvedValue([
      createScheduledCheck({
        deployment: {
          source: "/wrong/source",
        },
      }),
    ]);
    mocks.checkRunCreate.mockResolvedValue({
      id: "run_1",
    });
    mocks.getRunEnvironment.mockResolvedValue([]);

    await scheduleDueChecks({
      config: {
        checksRoot: "/mounted/checks",
        pollIntervalMs: 60_000,
        queuedRunTimeoutMinutes: 30,
        reporter: "list",
        runningRunTimeoutMinutes: 120,
      },
      now,
      queue: createQueue(),
    });

    expect(mocks.queueAdd).toHaveBeenCalledWith(
      "run-check",
      expect.objectContaining({
        rootDir: "/mounted/checks",
      }),
      expect.any(Object),
    );
  });

  it("skips checks that are not due or already active", async () => {
    mocks.checkFindMany.mockResolvedValue([
      createScheduledCheck({
        id: "check_1",
        key: "recent",
        runs: [
          {
            createdAt: new Date("2026-06-29T09:58:00.000Z"),
            status: "PASSED",
          },
        ],
      }),
      createScheduledCheck({
        id: "check_2",
        key: "queued",
        runs: [
          {
            createdAt: new Date("2026-06-29T09:00:00.000Z"),
            status: "QUEUED",
          },
        ],
      }),
    ]);

    await expect(
      scheduleDueChecks({
        config: {
          pollIntervalMs: 60_000,
          queuedRunTimeoutMinutes: 30,
          reporter: "list",
          runningRunTimeoutMinutes: 120,
        },
        now,
        queue: createQueue(),
      }),
    ).resolves.toEqual({
      active: 1,
      cancelledQueued: 0,
      cancelledRunning: 0,
      failed: 0,
      missingRoot: 0,
      notDue: 1,
      queued: 0,
      scanned: 2,
      skipped: 2,
    });

    expect(mocks.checkRunCreate).not.toHaveBeenCalled();
    expect(mocks.queueAdd).not.toHaveBeenCalled();
  });

  it("skips due checks without a source root", async () => {
    const logger = createLogger();
    mocks.checkFindMany.mockResolvedValue([
      createScheduledCheck({
        deployment: null,
      }),
    ]);

    await expect(
      scheduleDueChecks({
        config: {
          pollIntervalMs: 60_000,
          queuedRunTimeoutMinutes: 30,
          reporter: "list",
          runningRunTimeoutMinutes: 120,
        },
        logger,
        now,
        queue: createQueue(),
      }),
    ).resolves.toEqual({
      active: 0,
      cancelledQueued: 0,
      cancelledRunning: 0,
      failed: 0,
      missingRoot: 1,
      notDue: 0,
      queued: 0,
      scanned: 1,
      skipped: 1,
    });

    expect(logger.warn).toHaveBeenCalledWith(
      "Skipping scheduled check issue.get because source root is unknown.",
    );
    expect(mocks.checkRunCreate).not.toHaveBeenCalled();
    expect(mocks.queueAdd).not.toHaveBeenCalled();
  });

  it("marks the run failed when queueing fails", async () => {
    const logger = createLogger();
    mocks.checkFindMany.mockResolvedValue([createScheduledCheck()]);
    mocks.checkRunCreate.mockResolvedValue({
      id: "run_1",
    });
    mocks.getRunEnvironment.mockResolvedValue([]);
    mocks.queueAdd.mockRejectedValue(new Error("Redis unavailable"));

    await expect(
      scheduleDueChecks({
        config: {
          pollIntervalMs: 60_000,
          queuedRunTimeoutMinutes: 30,
          reporter: "list",
          runningRunTimeoutMinutes: 120,
        },
        logger,
        now,
        queue: createQueue(),
      }),
    ).resolves.toEqual({
      active: 0,
      cancelledQueued: 0,
      cancelledRunning: 0,
      failed: 1,
      missingRoot: 0,
      notDue: 0,
      queued: 0,
      scanned: 1,
      skipped: 0,
    });

    expect(mocks.checkRunUpdate).toHaveBeenCalledWith({
      data: {
        errorMessage: "Redis unavailable",
        finishedAt: now,
        status: "FAILED",
      },
      where: {
        id: "run_1",
      },
    });
    expect(logger.error).toHaveBeenCalledWith(
      "Unable to queue scheduled check issue.get.",
      expect.any(Error),
    );
  });

  it("cancels stale queued and running runs before scanning checks", async () => {
    mocks.checkFindMany.mockResolvedValue([]);
    mocks.readPerformanceRuntimeSettings.mockResolvedValue({
      failedArtifactRetentionDays: 14,
      historyRetentionDays: 180,
      passedArtifactRetentionDays: 14,
      queuedRunTimeoutMinutes: 40,
      runningRunTimeoutMinutes: 180,
      testSessionTimeoutMinutes: 30,
      testSessionWorkspaceRetentionDays: 14,
      workerConcurrency: 2,
    });
    mocks.checkRunUpdateMany
      .mockResolvedValueOnce({
        count: 1,
      })
      .mockResolvedValueOnce({
        count: 2,
      })
      .mockResolvedValueOnce({
        count: 1,
      });

    await expect(
      scheduleDueChecks({
        config: {
          pollIntervalMs: 60_000,
          queuedRunTimeoutMinutes: 30,
          reporter: "list",
          runningRunTimeoutMinutes: 120,
        },
        now,
        queue: createQueue(),
      }),
    ).resolves.toEqual({
      active: 0,
      cancelledQueued: 2,
      cancelledRunning: 2,
      failed: 0,
      missingRoot: 0,
      notDue: 0,
      queued: 0,
      scanned: 0,
      skipped: 0,
    });

    expect(mocks.checkRunUpdateMany).toHaveBeenNthCalledWith(1, {
      data: {
        errorMessage: "Browser run timed out after its configured deadline.",
        finishedAt: now,
        status: "TIMED_OUT",
      },
      where: {
        AND: [
          {
            OR: [
              {
                checkSnapshotType: "BROWSER",
              },
              {
                check: {
                  is: {
                    type: "BROWSER",
                  },
                },
              },
            ],
          },
          {
            OR: [
              {
                timeoutAt: {
                  lte: now,
                },
              },
              {
                startedAt: {
                  lt: new Date("2026-06-29T09:50:00.000Z"),
                },
                timeoutAt: null,
              },
              {
                createdAt: {
                  lt: new Date("2026-06-29T09:50:00.000Z"),
                },
                startedAt: null,
                timeoutAt: null,
              },
            ],
          },
        ],
        status: "RUNNING",
      },
    });
    expect(mocks.checkRunUpdateMany).toHaveBeenNthCalledWith(2, {
      data: {
        errorMessage: "Run was cancelled after waiting in queue for 40 minutes.",
        finishedAt: now,
        status: "CANCELLED",
      },
      where: {
        OR: [
          {
            testSessionId: null,
          },
          {
            testSession: {
              is: {
                kind: {
                  not: "TEST",
                },
              },
            },
          },
        ],
        createdAt: {
          lt: new Date("2026-06-29T09:20:00.000Z"),
        },
        status: "QUEUED",
      },
    });
    expect(mocks.checkRunUpdateMany).toHaveBeenNthCalledWith(3, {
      data: {
        errorMessage:
          "Run was cancelled after running for 180 minutes without completion.",
        finishedAt: now,
        status: "CANCELLED",
      },
      where: {
        OR: [
          {
            startedAt: {
              lt: new Date("2026-06-29T07:00:00.000Z"),
            },
          },
          {
            createdAt: {
              lt: new Date("2026-06-29T07:00:00.000Z"),
            },
            startedAt: null,
          },
        ],
        status: "RUNNING",
      },
    });
  });

  it("reconciles orphaned and duplicate active runs with the queue", async () => {
    const logger = createLogger();

    mocks.checkFindMany.mockResolvedValue([]);
    mocks.checkRunFindMany
      .mockResolvedValueOnce([
        {
          createdAt: new Date("2026-06-29T09:00:00.000Z"),
          id: "run_missing",
          retryGroupId: "job_missing",
          startedAt: new Date("2026-06-29T09:01:00.000Z"),
          status: "RUNNING",
        },
        {
          createdAt: new Date("2026-06-29T09:00:00.000Z"),
          id: "run_completed",
          retryGroupId: null,
          startedAt: null,
          status: "QUEUED",
        },
        {
          createdAt: new Date("2026-06-29T09:00:00.000Z"),
          id: "run_live_old",
          retryGroupId: "job_live",
          startedAt: new Date("2026-06-29T09:02:00.000Z"),
          status: "RUNNING",
        },
        {
          createdAt: new Date("2026-06-29T09:00:00.000Z"),
          id: "run_live_current",
          retryGroupId: "job_live",
          startedAt: new Date("2026-06-29T09:59:30.000Z"),
          status: "RUNNING",
        },
        {
          createdAt: new Date("2026-06-29T09:00:00.000Z"),
          id: "run_waiting",
          retryGroupId: null,
          startedAt: null,
          status: "QUEUED",
        },
      ])
      .mockResolvedValueOnce([]);
    mocks.queueGetJob.mockImplementation(async (jobId: string) => {
      const state = {
        job_live: "active",
        run_completed: "completed",
        run_waiting: "waiting",
      }[jobId];

      return state
        ? {
            getState: vi.fn().mockResolvedValue(state),
          }
        : undefined;
    });
    mocks.checkRunUpdateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 2 });

    await expect(
      scheduleDueChecks({
        config: {
          pollIntervalMs: 60_000,
          queuedRunTimeoutMinutes: 30,
          reporter: "list",
          runningRunTimeoutMinutes: 120,
        },
        logger,
        now,
        queue: createQueue(),
      }),
    ).resolves.toEqual({
      active: 0,
      cancelledQueued: 1,
      cancelledRunning: 2,
      failed: 0,
      missingRoot: 0,
      notDue: 0,
      queued: 0,
      scanned: 0,
      skipped: 0,
    });

    expect(mocks.checkRunFindMany).toHaveBeenNthCalledWith(1, {
      select: {
        createdAt: true,
        id: true,
        retryGroupId: true,
        startedAt: true,
        status: true,
      },
      where: {
        runSource: {
          in: ["SCHEDULE", "MANUAL"],
        },
        status: {
          in: ["QUEUED", "RUNNING"],
        },
      },
    });
    expect(mocks.queueGetJob).toHaveBeenCalledTimes(4);
    expect(mocks.queueGetJob).toHaveBeenCalledWith("job_missing");
    expect(mocks.queueGetJob).toHaveBeenCalledWith("run_completed");
    expect(mocks.queueGetJob).toHaveBeenCalledWith("job_live");
    expect(mocks.queueGetJob).toHaveBeenCalledWith("run_waiting");
    expect(mocks.checkRunUpdateMany).toHaveBeenCalledWith({
      data: {
        errorMessage: "Run was cancelled because its queue job is no longer active.",
        finishedAt: now,
        status: "CANCELLED",
      },
      where: {
        id: {
          in: ["run_completed"],
        },
        status: "QUEUED",
      },
    });
    expect(mocks.checkRunUpdateMany).toHaveBeenCalledWith({
      data: {
        errorMessage: "Run was cancelled because its queue job is no longer active.",
        finishedAt: now,
        status: "CANCELLED",
      },
      where: {
        id: {
          in: ["run_missing", "run_live_old"],
        },
        status: "RUNNING",
      },
    });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("times out expired test sessions and finalizes completed sessions", async () => {
    mocks.checkFindMany.mockResolvedValue([]);
    mocks.testSessionFindMany.mockResolvedValue([
      {
        id: "session_expired",
        runs: [
          {
            createdAt: new Date("2026-06-29T09:29:00.000Z"),
          },
        ],
      },
      {
        id: "session_completed",
        runs: [],
      },
    ]);

    await scheduleDueChecks({
      config: {
        pollIntervalMs: 60_000,
        queuedRunTimeoutMinutes: 30,
        reporter: "list",
        runningRunTimeoutMinutes: 120,
      },
      now,
      queue: createQueue(),
    });

    expect(mocks.testSessionFindMany).toHaveBeenCalledWith({
      select: {
        id: true,
        runs: {
          orderBy: {
            createdAt: "desc",
          },
          select: {
            createdAt: true,
          },
          take: 1,
          where: {
            status: {
              in: ["QUEUED", "RUNNING"],
            },
          },
        },
      },
      where: {
        kind: "TEST",
        OR: [
          {
            runs: {
              none: {
                createdAt: {
                  gt: new Date("2026-06-29T09:30:00.000Z"),
                },
                status: {
                  in: ["QUEUED", "RUNNING"],
                },
              },
              some: {
                status: {
                  in: ["QUEUED", "RUNNING"],
                },
              },
            },
          },
          {
            runs: {
              none: {
                OR: [
                  {
                    status: {
                      in: ["QUEUED", "RUNNING"],
                    },
                  },
                  {
                    finishedAt: null,
                  },
                  {
                    finishedAt: {
                      gte: new Date("2026-06-29T09:59:00.000Z"),
                    },
                  },
                ],
              },
              some: {},
            },
          },
        ],
        status: {
          in: ["QUEUED", "RUNNING"],
        },
      },
    });
    expect(mocks.markTestSessionRuns).toHaveBeenCalledWith(
      "session_expired",
      "Test session timed out after 30 minutes.",
      "TIMED_OUT",
    );
    expect(mocks.finalizeTestSession).toHaveBeenCalledWith("session_completed");
  });

  it("cleans expired artifact files and finished run history", async () => {
    const logger = createLogger();
    const deleteFile = vi.fn().mockResolvedValue(undefined);

    mocks.checkFindMany.mockResolvedValue([]);
    mocks.readPerformanceRuntimeSettings.mockResolvedValue({
      failedArtifactRetentionDays: 5,
      historyRetentionDays: 30,
      passedArtifactRetentionDays: 2,
      queuedRunTimeoutMinutes: 60,
      runningRunTimeoutMinutes: 180,
      testSessionTimeoutMinutes: 60,
      testSessionWorkspaceRetentionDays: 7,
      workerConcurrency: 4,
    });
    mocks.artifactFindMany.mockResolvedValue([
      {
        id: "artifact_1",
        path: "/tmp/selfchecks/artifact-1.zip",
      },
    ]);
    mocks.checkRunFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        artifacts: [
          {
            path: "/tmp/selfchecks/run-artifact.zip",
          },
        ],
        id: "run_1",
        logsPath: "/tmp/selfchecks/run.log",
      },
    ]);
    mocks.artifactDeleteMany.mockResolvedValue({
      count: 1,
    });
    mocks.checkRunDeleteMany.mockResolvedValue({
      count: 1,
    });

    await scheduleDueChecks({
      config: {
        pollIntervalMs: 60_000,
        queuedRunTimeoutMinutes: 30,
        reporter: "list",
        runningRunTimeoutMinutes: 120,
      },
      deleteFile,
      logger,
      now,
      queue: createQueue(),
    });

    expect(mocks.artifactFindMany).toHaveBeenCalledWith({
      select: {
        id: true,
        path: true,
      },
      where: {
        OR: [
          {
            createdAt: {
              lt: new Date("2026-06-27T10:00:00.000Z"),
            },
            run: {
              status: "PASSED",
            },
          },
          {
            createdAt: {
              lt: new Date("2026-06-24T10:00:00.000Z"),
            },
            run: {
              status: {
                in: ["FAILED", "TIMED_OUT", "CANCELLED"],
              },
            },
          },
        ],
      },
    });
    expect(mocks.artifactDeleteMany).toHaveBeenCalledWith({
      where: {
        id: {
          in: ["artifact_1"],
        },
      },
    });
    expect(mocks.checkRunFindMany).toHaveBeenCalledWith({
      select: {
        artifacts: {
          select: {
            path: true,
          },
        },
        id: true,
        logsPath: true,
      },
      where: {
        createdAt: {
          lt: new Date("2026-05-30T10:00:00.000Z"),
        },
        status: {
          notIn: ["QUEUED", "RUNNING"],
        },
      },
    });
    expect(mocks.checkRunDeleteMany).toHaveBeenCalledWith({
      where: {
        id: {
          in: ["run_1"],
        },
      },
    });
    expect(deleteFile).toHaveBeenCalledWith("/tmp/selfchecks/artifact-1.zip");
    expect(deleteFile).toHaveBeenCalledWith("/tmp/selfchecks/run.log");
    expect(deleteFile).toHaveBeenCalledWith("/tmp/selfchecks/run-artifact.zip");
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("cleans only expired test session branch folders", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "selfchecks-sessions-"));
    const expiredDirectory = path.join(root, "expired-session");
    const retainedDirectory = path.join(root, "retained-session");
    const deleteDirectory = vi.fn().mockResolvedValue(undefined);
    const logger = createLogger();

    try {
      await mkdir(expiredDirectory);
      await mkdir(retainedDirectory);
      await utimes(
        expiredDirectory,
        new Date("2026-06-20T10:00:00.000Z"),
        new Date("2026-06-20T10:00:00.000Z"),
      );
      await utimes(
        retainedDirectory,
        new Date("2026-06-25T10:00:00.000Z"),
        new Date("2026-06-25T10:00:00.000Z"),
      );
      vi.stubEnv("SELFCHECKS_TEST_SESSIONS_DIR", root);
      mocks.checkFindMany.mockResolvedValue([]);
      mocks.readPerformanceRuntimeSettings.mockResolvedValue({
        failedArtifactRetentionDays: 14,
        historyRetentionDays: 180,
        passedArtifactRetentionDays: 14,
        queuedRunTimeoutMinutes: 30,
        runningRunTimeoutMinutes: 120,
        testSessionTimeoutMinutes: 30,
        testSessionWorkspaceRetentionDays: 7,
        workerConcurrency: 2,
      });

      await scheduleDueChecks({
        config: {
          pollIntervalMs: 60_000,
          queuedRunTimeoutMinutes: 30,
          reporter: "list",
          runningRunTimeoutMinutes: 120,
        },
        deleteDirectory,
        logger,
        now,
        queue: createQueue(),
      });

      expect(deleteDirectory).toHaveBeenCalledTimes(1);
      expect(deleteDirectory).toHaveBeenCalledWith(expiredDirectory);
      expect(deleteDirectory).not.toHaveBeenCalledWith(retainedDirectory);
      expect(logger.warn).not.toHaveBeenCalled();
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
