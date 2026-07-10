import { EventEmitter } from "node:events";

import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkRunUpdateMany: vi.fn(),
  checkRunUpdate: vi.fn(),
  runCheckById: vi.fn(),
  runChecks: vi.fn(),
  spawn: vi.fn(),
  testSessionUpdate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  default: {
    spawn: mocks.spawn,
  },
  spawn: mocks.spawn,
}));

vi.mock("@selfchecks/cli/runner", () => ({
  runCheckById: mocks.runCheckById,
  runChecks: mocks.runChecks,
}));

vi.mock("@selfchecks/db", () => ({
  prisma: {
    $transaction: mocks.transaction,
    checkRun: {
      update: mocks.checkRunUpdate,
      updateMany: mocks.checkRunUpdateMany,
    },
    testSession: {
      update: mocks.testSessionUpdate,
    },
  },
}));

import { handleCheckJob, handleTestSessionJob } from "./jobs.js";

describe("handleCheckJob", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("runs a queued check through the shared runner", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    mocks.runCheckById.mockResolvedValue({
      checkKey: "issue.get",
      checkName: "issue.get",
      durationMs: 42,
      runId: "run_1",
      status: "passed",
    });

    await expect(
      handleCheckJob({
        data: {
          checkId: "check_1",
          checkKey: "issue.get",
          env: [{ name: "BASE_URL", value: "https://example.test" }],
          projectSlug: "account",
          reporter: "dot",
          rootDir: "/repo/config/checkly",
          runId: "run_1",
          runSource: "SCHEDULE",
          type: "browser",
        },
      }),
    ).resolves.toEqual({
      checkKey: "issue.get",
      checkName: "issue.get",
      durationMs: 42,
      runId: "run_1",
      status: "passed",
    });

    expect(log).toHaveBeenCalledWith("Running browser check issue.get for account");
    expect(mocks.runCheckById).toHaveBeenCalledWith({
      checkId: "check_1",
      env: [{ name: "BASE_URL", value: "https://example.test" }],
      projectSlug: "account",
      record: true,
      reporter: "dot",
      rootDir: "/repo/config/checkly",
      runId: "run_1",
      runSource: "SCHEDULE",
    });
  });

  it("marks the queued run failed when runner execution throws", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    mocks.runCheckById.mockRejectedValue(new Error("Playwright failed"));

    await expect(
      handleCheckJob({
        data: {
          checkId: "check_1",
          checkKey: "issue.get",
          projectSlug: "account",
          rootDir: "/repo/config/checkly",
          runId: "run_1",
          type: "browser",
        },
      }),
    ).rejects.toThrow("Playwright failed");

    expect(mocks.checkRunUpdate).toHaveBeenCalledWith({
      data: {
        errorMessage: "Playwright failed",
        finishedAt: expect.any(Date),
        status: "FAILED",
      },
      where: {
        id: "run_1",
      },
    });
  });

  it("installs and runs an uploaded test session workspace", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    mocks.spawn.mockImplementation(() => {
      const child = new EventEmitter();
      setImmediate(() => child.emit("close", 0));
      return child;
    });
    mocks.runChecks.mockResolvedValue({
      durationMs: 42,
      failed: 0,
      passed: 1,
      results: [],
      sessionId: "session_1",
      skipped: 0,
      total: 1,
    });

    await expect(
      handleTestSessionJob({
        data: {
          checkKeys: ["homepage"],
          checks: [
            {
              enabled: true,
              entrypoint: "homepage.spec.ts",
              key: "homepage",
              name: "Homepage",
              tags: [],
              type: "browser",
            },
          ],
          env: [],
          existingRunIds: {
            homepage: "run_1",
          },
          kind: "test-session",
          projectSlug: "account",
          reporter: "github",
          rootDir: "/runtime/test-sessions/session_1",
          sessionId: "session_1",
          tagSets: [],
        },
      }),
    ).resolves.toMatchObject({
      passed: 1,
      sessionId: "session_1",
    });

    expect(mocks.spawn).toHaveBeenNthCalledWith(
      1,
      "npm",
      ["install", "--omit=dev", "--no-audit", "--no-fund"],
      expect.objectContaining({
        cwd: "/runtime/test-sessions/session_1",
      }),
    );
    expect(mocks.spawn).toHaveBeenNthCalledWith(
      2,
      "npx",
      ["playwright", "install", "chromium"],
      expect.objectContaining({
        cwd: "/runtime/test-sessions/session_1",
      }),
    );
    expect(mocks.runChecks).toHaveBeenCalledWith(
      expect.objectContaining({
        existingRunIds: {
          homepage: "run_1",
        },
        existingTestSessionId: "session_1",
        record: true,
        runMode: "test",
      }),
    );
  });
});
