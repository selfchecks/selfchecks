import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkFindMany: vi.fn(),
  checkRunCreate: vi.fn(),
  checkRunUpdate: vi.fn(),
  checkRunUpdateMany: vi.fn(),
  getRunEnvironment: vi.fn(),
  queueAdd: vi.fn(),
}));

vi.mock("@selfchecks/db", () => ({
  prisma: {
    check: {
      findMany: mocks.checkFindMany,
    },
    checkRun: {
      create: mocks.checkRunCreate,
      update: mocks.checkRunUpdate,
      updateMany: mocks.checkRunUpdateMany,
    },
  },
}));

vi.mock("@selfchecks/cli/environment", () => ({
  getRunEnvironment: mocks.getRunEnvironment,
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
    mocks.checkRunUpdateMany.mockResolvedValue({
      count: 0,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
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
        queue: {
          add: mocks.queueAdd,
        },
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
      queue: {
        add: mocks.queueAdd,
      },
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
        queue: {
          add: mocks.queueAdd,
        },
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
        queue: {
          add: mocks.queueAdd,
        },
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
        queue: {
          add: mocks.queueAdd,
        },
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
    mocks.checkRunUpdateMany
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
        queue: {
          add: mocks.queueAdd,
        },
      }),
    ).resolves.toEqual({
      active: 0,
      cancelledQueued: 2,
      cancelledRunning: 1,
      failed: 0,
      missingRoot: 0,
      notDue: 0,
      queued: 0,
      scanned: 0,
      skipped: 0,
    });

    expect(mocks.checkRunUpdateMany).toHaveBeenNthCalledWith(1, {
      data: {
        errorMessage: "Run was cancelled after waiting in queue for 30 minutes.",
        finishedAt: now,
        status: "CANCELLED",
      },
      where: {
        createdAt: {
          lt: new Date("2026-06-29T09:30:00.000Z"),
        },
        status: "QUEUED",
      },
    });
    expect(mocks.checkRunUpdateMany).toHaveBeenNthCalledWith(2, {
      data: {
        errorMessage:
          "Run was cancelled after running for 120 minutes without completion.",
        finishedAt: now,
        status: "CANCELLED",
      },
      where: {
        OR: [
          {
            startedAt: {
              lt: new Date("2026-06-29T08:00:00.000Z"),
            },
          },
          {
            createdAt: {
              lt: new Date("2026-06-29T08:00:00.000Z"),
            },
            startedAt: null,
          },
        ],
        status: "RUNNING",
      },
    });
  });
});
