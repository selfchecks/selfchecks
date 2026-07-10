import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  apiKeyFindUnique: vi.fn(),
  checkRunCreate: vi.fn(),
  getRunEnvironment: vi.fn(),
  importCheckDefinitions: vi.fn(),
  queueAdd: vi.fn(),
  queueClose: vi.fn(),
  queueConstructor: vi.fn(),
  testSessionCreate: vi.fn(),
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
      env: [{ name: "ENVIRONMENT_URL", value: "https://preview.example.test" }],
      projectSlug: "account",
      reporter: "github",
      source: "account | release/1.2.3 | abc123",
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
    mocks.checkRunCreate.mockResolvedValue({ id: "run_1" });
    mocks.transaction.mockImplementation((callback) =>
      callback({
        checkRun: { create: mocks.checkRunCreate },
        testSession: { create: mocks.testSessionCreate },
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
        kind: "TEST",
        name: "Release 1.2.3",
        source: "account | release/1.2.3 | abc123",
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
      "run-test-session",
      expect.objectContaining({
        existingRunIds: { homepage: "run_1" },
        kind: "test-session",
        rootDir,
        sessionId: "session_1",
      }),
      { jobId: "session_1" },
    );
    expect(mocks.queueClose).toHaveBeenCalledOnce();
  });

  it("rejects requests with an invalid API token", async () => {
    const response = await POST(createRequest("wrong-token"));

    await expect(response.json()).resolves.toEqual({ error: "Unauthorized." });
    expect(response.status).toBe(401);
    expect(mocks.importCheckDefinitions).not.toHaveBeenCalled();
  });
});
