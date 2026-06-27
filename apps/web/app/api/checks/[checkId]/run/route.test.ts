import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queueAdd: vi.fn(),
  queueClose: vi.fn(),
  queueConstructor: vi.fn(),
  checkFindUnique: vi.fn(),
  checkRunCreate: vi.fn(),
  checkRunUpdate: vi.fn(),
  getRunEnvironment: vi.fn(),
}));

vi.mock("bullmq", () => ({
  Queue: mocks.queueConstructor.mockImplementation(() => ({
    add: mocks.queueAdd,
    close: mocks.queueClose,
  })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    check: {
      findUnique: mocks.checkFindUnique,
    },
    checkRun: {
      create: mocks.checkRunCreate,
      update: mocks.checkRunUpdate,
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

function createRequest() {
  return new Request("http://localhost/api/checks/check_1/run", {
    method: "POST",
  });
}

describe("run check route", () => {
  beforeEach(() => {
    mocks.getRunEnvironment.mockResolvedValue([]);
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
