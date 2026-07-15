import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queueAdd: vi.fn(),
  queueClose: vi.fn(),
  queueConstructor: vi.fn(),
  checkFindFirst: vi.fn(),
  checkFindUnique: vi.fn(),
  checkRunCreate: vi.fn(),
  checkRunUpdate: vi.fn(),
  getRunEnvironment: vi.fn(),
  testSessionFindFirst: vi.fn(),
  testSessionUpdate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("bullmq", () => ({
  Queue: mocks.queueConstructor.mockImplementation(() => ({
    add: mocks.queueAdd,
    close: mocks.queueClose,
  })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    check: {
      findFirst: mocks.checkFindFirst,
      findUnique: mocks.checkFindUnique,
    },
    checkRun: {
      create: mocks.checkRunCreate,
      update: mocks.checkRunUpdate,
    },
    testSession: {
      findFirst: mocks.testSessionFindFirst,
      update: mocks.testSessionUpdate,
    },
  },
}));

vi.mock("@selfchecks/cli/environment", () => ({
  getRunEnvironment: mocks.getRunEnvironment,
}));

import { Queue } from "bullmq";

import { POST } from "./route";

function createContext(checkId = "check_1") {
  return {
    params: Promise.resolve({
      checkId,
    }),
  };
}

function createRequest(url = "http://localhost/api/checks/check_1/run") {
  return new Request(url, {
    method: "POST",
  });
}

describe("run check route", () => {
  beforeEach(() => {
    mocks.getRunEnvironment.mockResolvedValue([]);
    mocks.transaction.mockImplementation(async (callback) =>
      callback({
        checkRun: {
          create: mocks.checkRunCreate,
        },
        testSession: {
          update: mocks.testSessionUpdate,
        },
      }),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("creates a queued run and enqueues a worker job", async () => {
    vi.stubEnv("REDIS_HOST", "redis.internal");
    vi.stubEnv("REDIS_PORT", "6380");
    vi.stubEnv("SELFCHECKS_QUEUE_NAME", "custom-checks");
    mocks.checkFindUnique.mockResolvedValue({
      deployment: {
        source: "/repo/config/checkly",
      },
      enabled: true,
      id: "check_1",
      key: "issue.get",
      project: {
        slug: "account",
      },
      type: "API",
    });
    mocks.checkRunCreate.mockResolvedValue({
      id: "run_1",
    });
    mocks.getRunEnvironment.mockResolvedValue([
      {
        name: "BASE_URL",
        value: "https://app.example.com",
      },
    ]);

    const response = await POST(createRequest(), createContext());

    await expect(response.json()).resolves.toEqual({
      runId: "run_1",
      status: "queued",
    });
    expect(response.status).toBe(202);
    expect(Queue).toHaveBeenCalledWith("custom-checks", {
      connection: {
        host: "redis.internal",
        port: 6380,
      },
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: 1000,
        removeOnFail: 1000,
      },
    });
    expect(mocks.checkRunCreate).toHaveBeenCalledWith({
      data: {
        checkId: "check_1",
        runSource: "MANUAL",
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
        rootDir: "/repo/config/checkly",
        runId: "run_1",
        runSource: "MANUAL",
        type: "api",
      },
      {
        jobId: "run_1",
      },
    );
    expect(mocks.queueClose).toHaveBeenCalledOnce();
  });

  it("returns not found for missing checks", async () => {
    mocks.checkFindUnique.mockResolvedValue(null);

    const response = await POST(createRequest(), createContext());

    await expect(response.json()).resolves.toEqual({
      error: "Check was not found.",
    });
    expect(response.status).toBe(404);
    expect(mocks.queueAdd).not.toHaveBeenCalled();
  });

  it("queues a new run inside the selected test session", async () => {
    mocks.checkFindUnique.mockResolvedValue(null);
    mocks.checkFindFirst.mockResolvedValue({
      deployment: {
        source: "/repo/config/checkly",
      },
      enabled: true,
      entrypoint: "checks/issue.get.spec.ts",
      group: {
        name: "API",
      },
      id: "check_1",
      key: "issue.get",
      name: "Issue get",
      project: {
        id: "project_1",
        slug: "account",
      },
      request: {
        assertions: [],
        headers: {},
        method: "GET",
        url: "https://example.test/issues/1",
      },
      tags: ["api"],
      type: "API",
    });
    mocks.testSessionFindFirst.mockResolvedValue({
      id: "session_1",
    });
    mocks.checkRunCreate.mockResolvedValue({
      id: "run_1",
    });

    const response = await POST(
      createRequest(
        "http://localhost/api/checks/issue.get/run?project=account&testSession=session_1",
      ),
      createContext("issue.get"),
    );

    expect(response.status).toBe(202);
    expect(mocks.checkFindFirst).toHaveBeenCalledWith({
      include: expect.any(Object),
      where: {
        key: "issue.get",
        project: {
          slug: "account",
        },
      },
    });
    expect(mocks.testSessionFindFirst).toHaveBeenCalledWith({
      select: {
        id: true,
      },
      where: {
        id: "session_1",
        kind: "TEST",
        projectId: "project_1",
        runs: {
          some: {
            OR: [{ checkId: "check_1" }, { checkSnapshotKey: "issue.get" }],
          },
        },
      },
    });
    expect(mocks.testSessionUpdate).toHaveBeenCalledWith({
      data: {
        status: "RUNNING",
      },
      where: {
        id: "session_1",
      },
    });
    expect(mocks.checkRunCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        checkId: "check_1",
        checkSnapshotKey: "issue.get",
        checkSnapshotName: "Issue get",
        checkSnapshotProjectSlug: "account",
        projectId: "project_1",
        runSource: "MANUAL",
        status: "QUEUED",
        testSessionId: "session_1",
      }),
      select: { id: true },
    });
    expect(mocks.queueAdd).toHaveBeenCalledWith(
      "run-check",
      expect.objectContaining({
        runId: "run_1",
        testSessionId: "session_1",
      }),
      { jobId: "run_1" },
    );
  });

  it("rejects reruns for tests outside the selected session", async () => {
    mocks.checkFindUnique.mockResolvedValue(null);
    mocks.checkFindFirst.mockResolvedValue({
      deployment: { source: "/repo/config/checkly" },
      enabled: true,
      id: "check_1",
      key: "issue.get",
      project: { id: "project_1", slug: "account" },
      type: "API",
    });
    mocks.testSessionFindFirst.mockResolvedValue(null);

    const response = await POST(
      createRequest(
        "http://localhost/api/checks/issue.get/run?project=account&testSession=session_1",
      ),
      createContext("issue.get"),
    );

    await expect(response.json()).resolves.toEqual({
      error: "Test was not found in this test session.",
    });
    expect(response.status).toBe(404);
    expect(mocks.checkRunCreate).not.toHaveBeenCalled();
  });

  it("rejects checks without a known source root", async () => {
    mocks.checkFindUnique.mockResolvedValue({
      deployment: null,
      enabled: true,
      id: "check_1",
      key: "issue.get",
      project: {
        slug: "account",
      },
      type: "API",
    });

    const response = await POST(createRequest(), createContext());

    await expect(response.json()).resolves.toEqual({
      error:
        "Check source root is unknown. Redeploy checks or set SELFCHECKS_CHECKS_ROOT.",
    });
    expect(response.status).toBe(422);
    expect(mocks.queueAdd).not.toHaveBeenCalled();
  });

  it("marks the run failed when queueing fails", async () => {
    mocks.checkFindUnique.mockResolvedValue({
      deployment: {
        source: "/repo/config/checkly",
      },
      enabled: true,
      id: "check_1",
      key: "issue.get",
      project: {
        slug: "account",
      },
      type: "API",
    });
    mocks.checkRunCreate.mockResolvedValue({
      id: "run_1",
    });
    mocks.queueAdd.mockRejectedValue(new Error("Redis unavailable"));

    const response = await POST(createRequest(), createContext());

    await expect(response.json()).resolves.toEqual({
      error: "Unable to queue check run.",
    });
    expect(response.status).toBe(503);
    expect(mocks.checkRunUpdate).toHaveBeenCalledWith({
      data: {
        errorMessage: "Redis unavailable",
        finishedAt: expect.any(Date),
        status: "FAILED",
      },
      where: {
        id: "run_1",
      },
    });
    expect(mocks.queueClose).toHaveBeenCalledOnce();
  });
});
