import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  apiKeyFindUnique: vi.fn(),
  checkRunCreate: vi.fn(),
  checkRunUpdateMany: vi.fn(),
  getRunEnvironment: vi.fn(),
  importCheckDefinitions: vi.fn(),
  queueAdd: vi.fn(),
  queueClose: vi.fn(),
  queueConstructor: vi.fn(),
  projectUpsert: vi.fn(),
  testSessionCreate: vi.fn(),
  testSessionFindMany: vi.fn(),
  testSessionUpdateMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("bullmq", () => ({
  Queue: mocks.queueConstructor.mockImplementation(() => ({
    add: mocks.queueAdd,
    close: mocks.queueClose,
  })),
}));

vi.mock("@selfchecks/cli/environment", () => ({
  getRunEnvironment: mocks.getRunEnvironment,
}));

vi.mock("@selfchecks/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@selfchecks/core")>();

  return {
    ...actual,
    importCheckDefinitions: mocks.importCheckDefinitions,
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    apiKey: {
      findUnique: mocks.apiKeyFindUnique,
    },
  },
}));

import { POST } from "./route";

let tempDir: string;

function createRequest(token = "api-token") {
  const formData = new FormData();
  const file = Buffer.from("export const check = true;\n");

  formData.set(
    "metadata",
    JSON.stringify({
      checkKeys: [],
      checkTypes: ["browser"],
      commitSha: "abc123def456",
      env: [{ name: "ENVIRONMENT_URL", value: "https://preview.example.test" }],
      jobUrl: "https://gitlab.example.test/jobs/456",
      pipelineUrl: "https://gitlab.example.test/pipelines/123",
      projectSlug: "account",
      ref: "release/1.2.3",
      reporter: "github",
      repository: "sendsay-ru/frontend/account",
      tagSets: [],
      testSessionName: "Release 1.2.3",
    }),
  );
  formData.set(
    "manifest",
    JSON.stringify([{ path: "src/homepage.spec.ts", size: file.length }]),
  );
  formData.set("file-0", new Blob([file]), "homepage.spec.ts");

  return {
    formData: async () => formData,
    headers: new Headers({
      Authorization: `Bearer ${token}`,
    }),
  } as Request;
}

describe("CLI test session upload route", () => {
  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "selfchecks-upload-"));
    vi.stubEnv("SELFCHECKS_API_TOKEN", "api-token");
    vi.stubEnv("SELFCHECKS_TEST_SESSIONS_DIR", tempDir);
    mocks.getRunEnvironment.mockResolvedValue([
      { name: "API_URL", value: "https://api.example.test" },
    ]);
    mocks.apiKeyFindUnique.mockResolvedValue(null);
    mocks.importCheckDefinitions.mockResolvedValue({
      checks: [
        {
          enabled: true,
          entrypoint: "src/homepage.spec.ts",
          key: "homepage",
          name: "Homepage",
          tags: ["browser"],
          type: "browser",
        },
      ],
    });
    mocks.testSessionCreate.mockResolvedValue({ id: "session_1" });
    mocks.testSessionFindMany.mockResolvedValue([]);
    mocks.checkRunCreate.mockResolvedValue({ id: "run_1" });
    mocks.projectUpsert.mockResolvedValue({ id: "project_1" });
    mocks.transaction.mockImplementation((callback) =>
      callback({
        checkRun: {
          create: mocks.checkRunCreate,
          updateMany: mocks.checkRunUpdateMany,
        },
        project: { upsert: mocks.projectUpsert },
        testSession: {
          create: mocks.testSessionCreate,
          findMany: mocks.testSessionFindMany,
          updateMany: mocks.testSessionUpdateMany,
        },
      }),
    );
  });

  afterEach(async () => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    await rm(tempDir, { force: true, recursive: true });
  });

  it("stores an isolated bundle and queues pre-created test runs", async () => {
    const response = await POST(createRequest());

    await expect(response.json()).resolves.toEqual({
      sessionId: "session_1",
      status: "queued",
      statusUrl: "/api/cli/test-sessions/session_1",
    });
    expect(response.status).toBe(202);
    const rootDir = mocks.importCheckDefinitions.mock.calls[0]?.[0].rootDir as string;
    await expect(
      readFile(path.join(rootDir, "src/homepage.spec.ts"), "utf8"),
    ).resolves.toBe("export const check = true;\n");
    expect(mocks.testSessionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        commitSha: "abc123def456",
        jobUrl: "https://gitlab.example.test/jobs/456",
        kind: "TEST",
        name: "Release 1.2.3",
        pipelineUrl: "https://gitlab.example.test/pipelines/123",
        ref: "release/1.2.3",
        repository: "sendsay-ru/frontend/account",
        source: undefined,
        status: "QUEUED",
        targetUrl: "https://preview.example.test",
      }),
      select: { id: true },
    });
    expect(mocks.checkRunCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        checkSnapshotKey: "homepage",
        checkSnapshotProjectSlug: "account",
        checkSnapshotType: "BROWSER",
        status: "QUEUED",
        testSessionId: "session_1",
      }),
      select: { id: true },
    });
    expect(mocks.queueAdd).toHaveBeenCalledWith(
      "prepare-test-session",
      expect.objectContaining({
        existingRunIds: { homepage: "run_1" },
        kind: "test-session",
        rootDir,
        sessionId: "session_1",
      }),
      { jobId: "session_1", priority: 10 },
    );
    expect(mocks.queueClose).toHaveBeenCalledOnce();
  });

  it("rejects requests with an invalid API token", async () => {
    const response = await POST(createRequest("wrong-token"));

    await expect(response.json()).resolves.toEqual({ error: "Unauthorized." });
    expect(response.status).toBe(401);
    expect(mocks.importCheckDefinitions).not.toHaveBeenCalled();
  });

  it("cancels an older active session for the same repository and ref", async () => {
    mocks.testSessionFindMany.mockResolvedValue([{ id: "session_old" }]);

    const response = await POST(createRequest());

    expect(response.status).toBe(202);
    expect(mocks.testSessionFindMany).toHaveBeenCalledWith({
      select: { id: true },
      where: {
        commitSha: { not: "abc123def456" },
        kind: "TEST",
        projectId: "project_1",
        ref: "release/1.2.3",
        repository: "sendsay-ru/frontend/account",
        status: { in: ["QUEUED", "RUNNING"] },
      },
    });
    expect(mocks.testSessionUpdateMany).toHaveBeenCalledWith({
      data: { status: "CANCELLED" },
      where: {
        id: { in: ["session_old"] },
        status: { in: ["QUEUED", "RUNNING"] },
      },
    });
    expect(mocks.checkRunUpdateMany).toHaveBeenCalledWith({
      data: {
        errorMessage: "Superseded by commit abc123def456.",
        finishedAt: expect.any(Date),
        status: "CANCELLED",
      },
      where: {
        status: { in: ["QUEUED", "RUNNING"] },
        testSessionId: { in: ["session_old"] },
      },
    });
  });
});
