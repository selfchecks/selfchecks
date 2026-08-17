import { EventEmitter } from "node:events";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkRunFindFirst: vi.fn(),
  checkRunFindMany: vi.fn(),
  checkRunFindUnique: vi.fn(),
  checkRunUpdateMany: vi.fn(),
  checkRunUpdate: vi.fn(),
  importCheckDefinitions: vi.fn(),
  persistDeploySummary: vi.fn(),
  queueAddBulk: vi.fn(),
  readPerformanceRuntimeSettings: vi.fn(),
  runCheckById: vi.fn(),
  runChecks: vi.fn(),
  runTestSessionCheck: vi.fn(),
  spawn: vi.fn(),
  testSessionFindUnique: vi.fn(),
  testSessionUpdate: vi.fn(),
  testSessionUpdateMany: vi.fn(),
  TestSessionTimeoutError: class TestSessionTimeoutError extends Error {
    constructor(timeoutMs: number) {
      super(`Test session timed out after ${timeoutMs} ms.`);
      this.name = "TestSessionTimeoutError";
    }
  },
  TestSessionCancelledError: class TestSessionCancelledError extends Error {
    constructor() {
      super("Test session was cancelled.");
      this.name = "TestSessionCancelledError";
    }
  },
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
  runTestSessionCheck: mocks.runTestSessionCheck,
  TestSessionCancelledError: mocks.TestSessionCancelledError,
  TestSessionTimeoutError: mocks.TestSessionTimeoutError,
}));

vi.mock("@selfchecks/cli/storage", () => ({
  persistDeploySummary: mocks.persistDeploySummary,
}));

vi.mock("@selfchecks/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@selfchecks/core")>();

  return {
    ...actual,
    importCheckDefinitions: mocks.importCheckDefinitions,
  };
});

vi.mock("./performance-settings.js", () => ({
  readPerformanceRuntimeSettings: mocks.readPerformanceRuntimeSettings,
}));

vi.mock("@selfchecks/db", () => ({
  prisma: {
    $transaction: mocks.transaction,
    checkRun: {
      findFirst: mocks.checkRunFindFirst,
      findMany: mocks.checkRunFindMany,
      findUnique: mocks.checkRunFindUnique,
      update: mocks.checkRunUpdate,
      updateMany: mocks.checkRunUpdateMany,
    },
    testSession: {
      findUnique: mocks.testSessionFindUnique,
      update: mocks.testSessionUpdate,
      updateMany: mocks.testSessionUpdateMany,
    },
  },
}));

import {
  finalizeTestSession,
  handleCheckJob,
  handleDeploymentJob,
  handleTestSessionCheckJob,
  handleTestSessionJob,
  handleTriggerJob,
} from "./jobs.js";

describe("handleCheckJob", () => {
  beforeEach(() => {
    mocks.checkRunFindFirst.mockResolvedValue(null);
    mocks.checkRunFindMany.mockResolvedValue([]);
    mocks.testSessionFindUnique.mockResolvedValue({ status: "RUNNING" });
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
    vi.useRealTimers();
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

  it("finalizes a test session after a manual session rerun", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    mocks.runCheckById.mockResolvedValue({
      checkKey: "issue.get",
      checkName: "issue.get",
      durationMs: 42,
      runId: "run_2",
      status: "passed",
    });
    mocks.checkRunFindMany.mockResolvedValue([
      {
        attempt: 1,
        checkSnapshotKey: "issue.get",
        createdAt: new Date("2026-07-15T09:00:00.000Z"),
        id: "run_1",
        status: "FAILED",
      },
      {
        attempt: 1,
        checkSnapshotKey: "issue.get",
        createdAt: new Date("2026-07-15T10:00:00.000Z"),
        id: "run_2",
        status: "PASSED",
      },
    ]);

    await handleCheckJob({
      data: {
        checkId: "check_1",
        checkKey: "issue.get",
        projectSlug: "account",
        rootDir: "/repo/config/checkly",
        runId: "run_2",
        runSource: "MANUAL",
        testSessionId: "session_1",
        type: "api",
      },
    });

    expect(mocks.runCheckById).toHaveBeenCalledWith(
      expect.objectContaining({
        existingTestSessionId: "session_1",
        runId: "run_2",
      }),
    );
    expect(mocks.testSessionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          status: "PASSED",
        },
        where: expect.objectContaining({
          id: "session_1",
        }),
      }),
    );
  });

  it("keeps same-key tests from different projects separate when finalizing", async () => {
    mocks.checkRunFindFirst.mockResolvedValue(null);
    mocks.checkRunFindMany.mockResolvedValue([
      {
        attempt: 1,
        checkSnapshotKey: "health",
        checkSnapshotProjectSlug: "account",
        createdAt: new Date("2026-08-17T15:00:00.000Z"),
        id: "run_account",
        status: "FAILED",
      },
      {
        attempt: 1,
        checkSnapshotKey: "health",
        checkSnapshotProjectSlug: "api",
        createdAt: new Date("2026-08-17T15:01:00.000Z"),
        id: "run_api",
        status: "PASSED",
      },
    ]);

    await finalizeTestSession("session_full");

    expect(mocks.testSessionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: "FAILED" },
        where: expect.objectContaining({ id: "session_full" }),
      }),
    );
  });

  it("installs and persists an uploaded deployment", async () => {
    const summary = {
      checks: [
        {
          enabled: true,
          key: "health",
          name: "Health",
          request: {
            assertions: [],
            headers: {},
            method: "GET",
            url: "https://example.test/health",
          },
          tags: [],
          type: "api" as const,
        },
      ],
      created: 1,
      projectSlug: "account",
      removed: 0,
      updated: 0,
      warnings: [],
    };
    mocks.importCheckDefinitions.mockResolvedValue(summary);
    mocks.persistDeploySummary.mockResolvedValue(summary);
    mocks.spawn.mockImplementation(() => {
      const child = new EventEmitter();
      setImmediate(() => child.emit("close", 0));
      return child;
    });

    await expect(
      handleDeploymentJob({
        data: {
          allowRemovals: true,
          kind: "deployment",
          projectSlug: "account",
          rootDir: "/runtime/deployments/deployment_1",
        },
      }),
    ).resolves.toEqual(summary);

    expect(mocks.spawn).toHaveBeenCalledWith(
      "npm",
      ["install", "--omit=dev", "--no-audit", "--no-fund"],
      expect.objectContaining({ cwd: "/runtime/deployments/deployment_1" }),
    );
    expect(mocks.persistDeploySummary).toHaveBeenCalledWith(
      expect.objectContaining({
        allowRemovals: true,
        projectSlug: "account",
        source: "/runtime/deployments/deployment_1",
      }),
    );
  });

  it("persists DeploymentManifest v1 without reparsing project source", async () => {
    const deploymentManifest = {
      alertChannels: [],
      checks: [
        {
          alertChannelLogicalIds: [],
          enabled: true,
          key: "health",
          muted: false,
          name: "Health",
          request: {
            assertions: [],
            headers: {},
            method: "GET",
            queryParameters: {},
            url: "https://example.test/health",
          },
          shouldFail: false,
          tags: [],
          type: "api" as const,
        },
      ],
      project: { logicalId: "demo", name: "Demo" },
      version: 1 as const,
      warnings: [],
    };
    const summary = {
      checks: deploymentManifest.checks,
      created: 1,
      projectSlug: "demo",
      removed: 0,
      updated: 0,
      warnings: [],
    };
    mocks.persistDeploySummary.mockResolvedValue(summary);
    mocks.spawn.mockImplementation(() => {
      const child = new EventEmitter();
      setImmediate(() => child.emit("close", 0));
      return child;
    });

    await expect(
      handleDeploymentJob({
        data: {
          allowRemovals: false,
          deploymentManifest,
          kind: "deployment",
          projectSlug: "demo",
          rootDir: "/runtime/deployments/deployment_2",
        },
      }),
    ).resolves.toEqual(summary);

    expect(mocks.importCheckDefinitions).not.toHaveBeenCalled();
    expect(mocks.persistDeploySummary).toHaveBeenCalledWith(
      expect.objectContaining({
        summary: expect.objectContaining({
          checks: deploymentManifest.checks,
          projectSlug: "demo",
        }),
      }),
    );
  });

  it("runs a remote trigger through the shared runner", async () => {
    const summary = {
      durationMs: 10,
      failed: 0,
      passed: 1,
      results: [],
      sessionId: "session_1",
      skipped: 0,
      total: 1,
    };
    mocks.runChecks.mockResolvedValue(summary);

    await expect(
      handleTriggerJob({
        data: {
          commitSha: "abc123",
          env: [],
          kind: "trigger",
          projectSlug: "account",
          ref: "stable",
          reporter: "github",
          rootDir: "/runtime/deployments/deployment_1",
          testSessionName: "Nightly stable",
        },
      }),
    ).resolves.toEqual(summary);

    expect(mocks.runChecks).toHaveBeenCalledWith(
      expect.objectContaining({
        projectSlug: "account",
        record: true,
        rootDir: "/runtime/deployments/deployment_1",
        runMode: "monitoring",
        testSessionCommitSha: "abc123",
        testSessionRef: "stable",
      }),
    );
  });

  it("installs an uploaded workspace and queues every check independently", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    mocks.spawn.mockImplementation(() => {
      const child = new EventEmitter();
      setImmediate(() => child.emit("close", 0));
      return child;
    });

    await expect(
      handleTestSessionJob(
        {
          data: {
            checkKeys: ["homepage", "health"],
            checks: [
              {
                enabled: true,
                entrypoint: "homepage.spec.ts",
                key: "homepage",
                name: "Homepage",
                tags: [],
                type: "browser",
              },
              {
                enabled: true,
                key: "health",
                name: "Health",
                request: {
                  assertions: [],
                  headers: {},
                  method: "GET",
                  url: "https://example.test/health",
                },
                tags: [],
                type: "api",
              },
            ],
            env: [],
            existingRunIds: {
              health: "run_2",
              homepage: "run_1",
            },
            kind: "test-session",
            projectSlug: "account",
            reporter: "github",
            rootDir: "/runtime/test-sessions/session_1",
            sessionId: "session_1",
            tagSets: [],
          },
        },
        {
          addBulk: mocks.queueAddBulk,
        },
      ),
    ).resolves.toEqual({
      queued: 2,
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
    expect(mocks.queueAddBulk).toHaveBeenCalledWith([
      expect.objectContaining({
        data: expect.objectContaining({
          existingRunId: "run_1",
          kind: "test-session-check",
          sessionId: "session_1",
          testSessionDeadline: {
            at: expect.any(Number),
            timeoutMs: 30 * 60_000,
          },
        }),
        name: "run-test-session-check",
        opts: {
          jobId: "run_1",
          priority: 10,
        },
      }),
      expect.objectContaining({
        data: expect.objectContaining({
          existingRunId: "run_2",
          kind: "test-session-check",
          sessionId: "session_1",
        }),
        opts: {
          jobId: "run_2",
          priority: 10,
        },
      }),
    ]);
    expect(mocks.runTestSessionCheck).not.toHaveBeenCalled();
  });

  it("runs one test-session check and finalizes from the latest attempts", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    mocks.checkRunFindUnique.mockResolvedValue({
      checkSnapshotKey: "homepage",
      checkSnapshotName: "Homepage",
      durationMs: null,
      id: "run_1",
      status: "QUEUED",
      testSessionId: "session_1",
    });
    mocks.runTestSessionCheck.mockResolvedValue({
      checkKey: "homepage",
      checkName: "Homepage",
      durationMs: 42,
      runId: "run_2",
      status: "passed",
    });
    mocks.checkRunFindMany.mockResolvedValue([
      {
        attempt: 1,
        checkSnapshotKey: "homepage",
        createdAt: new Date("2026-07-15T09:00:00.000Z"),
        id: "run_1",
        status: "FAILED",
      },
      {
        attempt: 2,
        checkSnapshotKey: "homepage",
        createdAt: new Date("2026-07-15T09:01:00.000Z"),
        id: "run_2",
        status: "PASSED",
      },
      {
        attempt: 1,
        checkSnapshotKey: "health",
        createdAt: new Date("2026-07-15T09:00:00.000Z"),
        id: "run_3",
        status: "PASSED",
      },
    ]);

    await expect(
      handleTestSessionCheckJob({
        data: {
          check: {
            enabled: true,
            entrypoint: "homepage.spec.ts",
            key: "homepage",
            name: "Homepage",
            tags: [],
            type: "browser",
          },
          env: [],
          existingRunId: "run_1",
          kind: "test-session-check",
          projectSlug: "account",
          reporter: "github",
          rootDir: "/runtime/test-sessions/session_1",
          sessionId: "session_1",
          testSessionDeadline: {
            at: Date.now() + 30 * 60_000,
            timeoutMs: 30 * 60_000,
          },
        },
      }),
    ).resolves.toMatchObject({
      runId: "run_2",
      status: "passed",
    });

    expect(mocks.runTestSessionCheck).toHaveBeenCalledWith(
      expect.objectContaining({
        existingRunId: "run_1",
        existingTestSessionId: "session_1",
      }),
    );
    expect(mocks.testSessionUpdateMany).toHaveBeenCalledWith({
      data: {
        status: "PASSED",
      },
      where: {
        id: "session_1",
        kind: "TEST",
        runs: {
          none: {
            status: {
              in: ["QUEUED", "RUNNING"],
            },
          },
        },
        status: {
          in: ["QUEUED", "RUNNING"],
        },
      },
    });
  });

  it("does not start a queued check after its test session is cancelled", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    mocks.checkRunFindUnique.mockResolvedValue({
      checkSnapshotKey: "homepage",
      checkSnapshotName: "Homepage",
      durationMs: null,
      id: "run_1",
      status: "QUEUED",
      testSessionId: "session_1",
    });
    mocks.testSessionFindUnique.mockResolvedValue({ status: "CANCELLED" });

    await expect(
      handleTestSessionCheckJob({
        data: {
          check: {
            enabled: true,
            entrypoint: "homepage.spec.ts",
            key: "homepage",
            name: "Homepage",
            tags: [],
            type: "browser",
          },
          env: [],
          existingRunId: "run_1",
          kind: "test-session-check",
          projectSlug: "account",
          reporter: "github",
          rootDir: "/runtime/test-sessions/session_1",
          sessionId: "session_1",
          testSessionDeadline: {
            at: Date.now() + 30 * 60_000,
            timeoutMs: 30 * 60_000,
          },
        },
      }),
    ).resolves.toMatchObject({
      runId: "run_1",
      status: "cancelled",
    });

    expect(mocks.runTestSessionCheck).not.toHaveBeenCalled();
  });

  it("keeps a test session active while another check is queued", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    mocks.checkRunFindUnique.mockResolvedValue({
      checkSnapshotKey: "homepage",
      checkSnapshotName: "Homepage",
      durationMs: null,
      id: "run_1",
      status: "QUEUED",
      testSessionId: "session_1",
    });
    mocks.runTestSessionCheck.mockResolvedValue({
      checkKey: "homepage",
      checkName: "Homepage",
      durationMs: 42,
      runId: "run_1",
      status: "passed",
    });
    mocks.checkRunFindFirst.mockResolvedValue({ id: "run_2" });

    await handleTestSessionCheckJob({
      data: {
        check: {
          enabled: true,
          entrypoint: "homepage.spec.ts",
          key: "homepage",
          name: "Homepage",
          tags: [],
          type: "browser",
        },
        env: [],
        existingRunId: "run_1",
        kind: "test-session-check",
        projectSlug: "account",
        reporter: "github",
        rootDir: "/runtime/test-sessions/session_1",
        sessionId: "session_1",
        testSessionDeadline: {
          at: Date.now() + 30 * 60_000,
          timeoutMs: 30 * 60_000,
        },
      },
    });

    expect(mocks.testSessionUpdateMany).not.toHaveBeenCalled();
    expect(mocks.checkRunFindMany).not.toHaveBeenCalled();
  });

  it("marks the session and unfinished runs timed out at the configured limit", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-10T10:00:00.000Z"));
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    let child:
      | (EventEmitter & {
          kill: (signal: NodeJS.Signals) => boolean;
        })
      | undefined;
    const kill = vi.fn((signal: NodeJS.Signals) => {
      child?.emit("close", null, signal);
      return true;
    });
    let resolveSpawned: () => void = () => {};
    const spawned = new Promise<void>((resolve) => {
      resolveSpawned = resolve;
    });
    mocks.spawn.mockImplementation(() => {
      child = new EventEmitter() as EventEmitter & {
        kill: (signal: NodeJS.Signals) => boolean;
      };
      child.kill = kill;
      resolveSpawned();
      return child;
    });
    mocks.readPerformanceRuntimeSettings.mockResolvedValue({
      failedArtifactRetentionDays: 14,
      historyRetentionDays: 180,
      passedArtifactRetentionDays: 14,
      queuedRunTimeoutMinutes: 30,
      runningRunTimeoutMinutes: 120,
      testSessionTimeoutMinutes: 10,
      testSessionWorkspaceRetentionDays: 14,
      workerConcurrency: 2,
    });
    const jobPromise = handleTestSessionJob(
      {
        data: {
          checkKeys: ["homepage"],
          checks: [
            {
              enabled: true,
              key: "homepage",
              name: "Homepage",
              request: {
                assertions: [],
                headers: {},
                method: "GET",
                url: "https://example.test",
              },
              tags: [],
              type: "api",
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
      },
      {
        addBulk: mocks.queueAddBulk,
      },
    );
    const rejection = expect(jobPromise).rejects.toThrow("Test session timed out");

    await spawned;
    await vi.advanceTimersByTimeAsync(10 * 60_000);

    await rejection;
    expect(kill).toHaveBeenCalledWith("SIGTERM");
    expect(mocks.queueAddBulk).not.toHaveBeenCalled();

    expect(mocks.testSessionUpdateMany).toHaveBeenCalledWith({
      data: {
        status: "TIMED_OUT",
      },
      where: {
        id: "session_1",
        kind: "TEST",
        status: {
          in: ["QUEUED", "RUNNING"],
        },
      },
    });
    expect(mocks.checkRunUpdateMany).toHaveBeenCalledWith({
      data: {
        errorMessage: "Test session timed out after 600000 ms.",
        finishedAt: expect.any(Date),
        status: "TIMED_OUT",
      },
      where: {
        status: {
          in: ["QUEUED", "RUNNING"],
        },
        testSessionId: "session_1",
      },
    });
  });
});
