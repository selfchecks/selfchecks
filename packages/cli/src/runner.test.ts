import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  artifactCreateMany: vi.fn(),
  artifactDeleteMany: vi.fn(),
  checkFindFirst: vi.fn(),
  checkFindMany: vi.fn(),
  checkRunCreate: vi.fn(),
  checkRunFindFirst: vi.fn(),
  checkRunUpdate: vi.fn(),
  deliverRunNotifications: vi.fn(),
  projectFindUnique: vi.fn().mockResolvedValue({ id: "project_1" }),
  projectUpsert: vi.fn().mockResolvedValue({ id: "project_1" }),
  spawn: vi.fn(),
  testSessionCreate: vi.fn(),
  testSessionFindUnique: vi.fn(),
  testSessionUpdate: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  default: {
    spawn: mocks.spawn,
  },
  spawn: mocks.spawn,
}));

vi.mock("@selfchecks/db", () => ({
  Prisma: {
    DbNull: { type: "DbNull" },
  },
  prisma: {
    artifact: {
      createMany: mocks.artifactCreateMany,
      deleteMany: mocks.artifactDeleteMany,
    },
    check: {
      findFirst: mocks.checkFindFirst,
      findMany: mocks.checkFindMany,
    },
    checkRun: {
      create: mocks.checkRunCreate,
      findFirst: mocks.checkRunFindFirst,
      update: mocks.checkRunUpdate,
    },
    project: {
      findUnique: mocks.projectFindUnique,
      upsert: mocks.projectUpsert,
    },
    testSession: {
      create: mocks.testSessionCreate,
      findUnique: mocks.testSessionFindUnique,
      update: mocks.testSessionUpdate,
    },
  },
}));

vi.mock("./ai-analysis.js", () => ({
  analyzeFailedCheck: vi.fn(),
}));

vi.mock("./notifications.js", () => ({
  deliverRunNotifications: mocks.deliverRunNotifications,
}));

import {
  runCheckById,
  runChecks,
  runTestSessionCheck,
  TestSessionTimeoutError,
} from "./runner.js";

const tempDirs: string[] = [];

async function createTempProject() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "selfchecks-runner-"));

  tempDirs.push(directory);
  return directory;
}

function createStoredZip(entries: Record<string, string>) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  let entryCount = 0;

  for (const [entryName, content] of Object.entries(entries)) {
    const name = Buffer.from(entryName);
    const data = Buffer.from(content);
    const localHeader = Buffer.alloc(30);

    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localParts.push(localHeader, name, data);

    const centralHeader = Buffer.alloc(46);

    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, name);

    offset += localHeader.length + name.length + data.length;
    entryCount += 1;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const endOfCentralDirectory = Buffer.alloc(22);

  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0);
  endOfCentralDirectory.writeUInt16LE(entryCount, 8);
  endOfCentralDirectory.writeUInt16LE(entryCount, 10);
  endOfCentralDirectory.writeUInt32LE(centralDirectory.length, 12);
  endOfCentralDirectory.writeUInt32LE(offset, 16);

  return Buffer.concat([...localParts, centralDirectory, endOfCentralDirectory]);
}

describe("runCheckById", () => {
  afterEach(async () => {
    vi.clearAllMocks();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    await Promise.all(
      tempDirs.splice(0).map((directory) =>
        rm(directory, {
          force: true,
          recursive: true,
        }),
      ),
    );
  });

  it("disables Playwright retries, preserves trace settings, and isolates artifacts", async () => {
    const rootDir = await createTempProject();
    const runId = "run_1";
    const artifactsRootDir = path.join(rootDir, "runtime-artifacts");
    vi.stubEnv("CI", "");
    vi.stubEnv("SELFCHECKS_ARTIFACTS_DIR", artifactsRootDir);
    vi.stubEnv("PLAYWRIGHT_BROWSERS_PATH", "/ms-playwright");

    await writeFile(
      path.join(rootDir, "playwright.config.ts"),
      `export default { use: { trace: "retain-on-failure" } };\n`,
    );

    const isolatedOutputDir = path.join(artifactsRootDir, runId, "test-results");
    const isolatedTracePath = path.join(
      isolatedOutputDir,
      "autopayment-chromium",
      "trace.zip",
    );
    const screenshotOutputDir = path.join(isolatedOutputDir, "autopayment-chromium");
    const actualScreenshotPath = path.join(
      screenshotOutputDir,
      "limits-is-spent-actual.png",
    );
    const expectedScreenshotPath = path.join(
      screenshotOutputDir,
      "limits-is-spent-expected.png",
    );
    const updateScreenshotPath = path.join(
      screenshotOutputDir,
      "limits-is-spent-chromium-linux.png",
    );
    const baselineSnapshotPath = path.join(
      rootDir,
      "src",
      "__checks__",
      "UI",
      "App",
      "billing",
      "rest.limit-checks.spec.ts-snapshots",
      "limits-is-spent-chromium-linux.png",
    );
    const sharedTracePath = path.join(
      rootDir,
      "test-results",
      "other-run-chromium",
      "trace.zip",
    );

    mocks.checkFindFirst.mockResolvedValue({
      entrypoint: "src/__checks__/UI/App/billing/rest.autopayment.spec.ts",
      id: "check_1",
      key: "autopayment",
      name: "Autopayment",
      request: null,
      runs: [],
      type: "BROWSER",
    });
    mocks.checkRunFindFirst.mockResolvedValue({
      checkId: "check_1",
      id: runId,
    });
    mocks.checkRunUpdate.mockImplementation(async (args) => ({
      checkId: "check_1",
      id: args.where.id,
      ...args.data,
    }));
    mocks.artifactDeleteMany.mockResolvedValue({ count: 0 });
    mocks.artifactCreateMany.mockResolvedValue({ count: 2 });
    mocks.spawn.mockImplementation((_command, args: string[]) => {
      const child = new EventEmitter() as EventEmitter & {
        stderr: EventEmitter;
        stdout: EventEmitter;
      };
      child.stderr = new EventEmitter();
      child.stdout = new EventEmitter();

      setImmediate(() => {
        void (async () => {
          const outputIndex = args.indexOf("--output");
          const outputDir = args[outputIndex + 1];

          await mkdir(path.dirname(isolatedTracePath), { recursive: true });
          await mkdir(path.dirname(sharedTracePath), { recursive: true });
          await writeFile(path.join(String(outputDir), ".last-run.json"), "{}");
          await writeFile(
            isolatedTracePath,
            createStoredZip({
              "trace.network": "",
              "trace.trace": "",
            }),
          );
          await writeFile(actualScreenshotPath, "actual screenshot payload");
          await writeFile(expectedScreenshotPath, "expected screenshot payload");
          await writeFile(sharedTracePath, "shared trace payload");

          child.stdout.emit(
            "data",
            Buffer.from(
              [
                "Error: Screenshot comparison failed",
                `Expected: ${baselineSnapshotPath}`,
                `Received: ${actualScreenshotPath}`,
              ].join("\n"),
            ),
          );
          child.emit("close", 0);
        })();
      });

      return child;
    });

    await expect(
      runCheckById({
        checkId: "check_1",
        env: [
          { name: "ENVIRONMENT_URL", value: "https://example.test" },
          { name: "PLAYWRIGHT_BROWSERS_PATH", value: "0" },
        ],
        projectSlug: "default",
        record: true,
        reporter: "list",
        rootDir,
        runId,
      }),
    ).resolves.toMatchObject({
      checkKey: "autopayment",
      runId,
      status: "passed",
    });

    const spawnCall = mocks.spawn.mock.calls[0];

    expect(spawnCall?.[0]).toBe("npx");
    expect(spawnCall?.[1]).toEqual([
      "playwright",
      "test",
      "src/__checks__/UI/App/billing/rest.autopayment.spec.ts",
      "--config",
      "playwright.config.ts",
      "--output",
      isolatedOutputDir,
      "--reporter",
      "list",
      "--retries",
      "0",
    ]);
    expect(spawnCall?.[2]?.env?.CI).toBe("1");
    expect(spawnCall?.[2]).toEqual(
      expect.objectContaining({
        cwd: rootDir,
        env: expect.objectContaining({
          ENVIRONMENT_URL: "https://example.test",
          PLAYWRIGHT_BROWSERS_PATH: "/ms-playwright",
          PLAYWRIGHT_BLOB_OUTPUT_DIR: path.join(artifactsRootDir, runId, "blob-report"),
          PLAYWRIGHT_HTML_OUTPUT_DIR: path.join(
            artifactsRootDir,
            runId,
            "playwright-report",
          ),
        }),
      }),
    );
    const artifactCreateArgs = mocks.artifactCreateMany.mock.calls[0]?.[0] as {
      data: Array<{ path: string; type: string }>;
    };

    expect(artifactCreateArgs.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: path.join(rootDir, ".selfchecks", "runs", `${runId}.log`),
          type: "LOG",
        }),
        expect.objectContaining({
          path: isolatedTracePath,
          type: "TRACE",
        }),
        expect.objectContaining({
          path: updateScreenshotPath,
          type: "SCREENSHOT",
        }),
      ]),
    );
    expect(artifactCreateArgs.data.map((artifact) => artifact.path)).not.toContain(
      sharedTracePath,
    );
    await expect(readFile(updateScreenshotPath, "utf8")).resolves.toBe(
      "actual screenshot payload",
    );
  });

  it("maps on-first-retry tracing to the final SelfChecks attempt", async () => {
    const rootDir = await createTempProject();
    const runId = "run_1";
    let createdRunNumber = 1;

    await writeFile(
      path.join(rootDir, "playwright.config.ts"),
      `
        export default {
          use: {
            trace: "on-first-retry",
          },
        };
      `,
    );

    mocks.checkFindFirst.mockResolvedValue({
      entrypoint: "homepage.spec.ts",
      id: "check_1",
      key: "homepage",
      name: "Homepage",
      request: null,
      retryStrategy: null,
      runs: [],
      type: "BROWSER",
    });
    mocks.checkRunFindFirst.mockResolvedValue({
      checkId: "check_1",
      id: runId,
    });
    mocks.checkRunCreate.mockImplementation(async (args) => ({
      checkId: "check_1",
      id: `run_${(createdRunNumber += 1)}`,
      ...args.data,
    }));
    mocks.checkRunUpdate.mockImplementation(async (args) => ({
      checkId: "check_1",
      id: args.where.id,
      ...args.data,
    }));
    mocks.artifactDeleteMany.mockResolvedValue({ count: 0 });
    mocks.artifactCreateMany.mockResolvedValue({ count: 0 });
    mocks.spawn.mockImplementation(() => {
      const child = new EventEmitter() as EventEmitter & {
        stderr: EventEmitter;
        stdout: EventEmitter;
      };
      child.stderr = new EventEmitter();
      child.stdout = new EventEmitter();

      setImmediate(() => child.emit("close", 1));

      return child;
    });

    await expect(
      runCheckById({
        checkId: "check_1",
        env: [],
        projectSlug: "default",
        record: true,
        reporter: "list",
        retries: 2,
        rootDir,
        runId,
      }),
    ).resolves.toMatchObject({
      runId: "run_3",
      status: "failed",
    });

    const traceArguments = mocks.spawn.mock.calls.map((call) => {
      const args = call[1] as string[];
      const traceIndex = args.indexOf("--trace");

      return traceIndex >= 0 ? args.slice(traceIndex, traceIndex + 2) : [];
    });

    expect(traceArguments).toEqual([
      ["--trace", "off"],
      ["--trace", "off"],
      ["--trace", "on"],
    ]);
  });

  it("marks browser checks as timed out and terminates Playwright", async () => {
    const rootDir = await createTempProject();
    const runId = "run_1";
    let child:
      | (EventEmitter & {
          kill: (signal: NodeJS.Signals) => boolean;
          stderr: EventEmitter;
          stdout: EventEmitter;
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

    await writeFile(
      path.join(rootDir, "playwright.config.ts"),
      "export default { globalTimeout: 1000 };\n",
    );

    mocks.checkFindFirst.mockResolvedValue({
      entrypoint: "src/__checks__/UI/App/core/rest.dashboard.onboarding-widget.spec.ts",
      id: "check_1",
      key: "onboarding",
      name: "Onboarding",
      request: null,
      retryStrategy: null,
      runs: [],
      type: "BROWSER",
    });
    mocks.checkRunFindFirst.mockResolvedValue({
      checkId: "check_1",
      id: runId,
    });
    mocks.checkRunUpdate.mockImplementation(async (args) => ({
      checkId: "check_1",
      id: args.where.id,
      ...args.data,
    }));
    mocks.artifactDeleteMany.mockResolvedValue({ count: 0 });
    mocks.artifactCreateMany.mockResolvedValue({ count: 1 });
    mocks.spawn.mockImplementation(() => {
      child = new EventEmitter() as EventEmitter & {
        kill: (signal: NodeJS.Signals) => boolean;
        stderr: EventEmitter;
        stdout: EventEmitter;
      };
      child.stderr = new EventEmitter();
      child.stdout = new EventEmitter();
      child.kill = kill;
      resolveSpawned();

      return child;
    });

    vi.useFakeTimers();
    const runPromise = runCheckById({
      checkId: "check_1",
      env: [{ name: "ENVIRONMENT_URL", value: "https://example.test" }],
      projectSlug: "default",
      record: true,
      reporter: "list",
      rootDir,
      runId,
    });

    await spawned;
    await vi.advanceTimersByTimeAsync(1000);

    await expect(runPromise).resolves.toMatchObject({
      checkKey: "onboarding",
      errorMessage: "Browser check timed out after 1 s (playwright.globalTimeout).",
      runId,
      status: "timed_out",
    });
    expect(kill).toHaveBeenCalledWith("SIGTERM");
    expect(mocks.checkRunUpdate).toHaveBeenCalledWith({
      data: {
        timeoutAt: new Date(Date.now()),
      },
      where: {
        id: runId,
      },
    });
    expect(mocks.checkRunUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          errorMessage: "Browser check timed out after 1 s (playwright.globalTimeout).",
          result: expect.objectContaining({
            exitCode: 124,
            signal: "SIGTERM",
            timedOut: true,
            timeoutMs: 1000,
            timeoutSource: "playwright.globalTimeout",
          }),
          status: "TIMED_OUT",
        }),
        where: {
          id: runId,
        },
      }),
    );
  });

  it("terminates Playwright when a test session is cancelled", async () => {
    const rootDir = await createTempProject();
    const runId = "run_1";
    const controller = new AbortController();
    let child:
      | (EventEmitter & {
          kill: (signal: NodeJS.Signals) => boolean;
          stderr: EventEmitter;
          stdout: EventEmitter;
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

    mocks.testSessionFindUnique.mockResolvedValue({
      id: "session_1",
      kind: "TEST",
      projectId: "project_1",
      status: "RUNNING",
    });
    mocks.testSessionUpdate.mockResolvedValue({
      id: "session_1",
      kind: "TEST",
      projectId: "project_1",
      status: "RUNNING",
    });
    mocks.checkRunFindFirst.mockResolvedValue({ id: runId });
    mocks.checkRunUpdate.mockImplementation(async (args) => ({
      id: args.where.id,
      ...args.data,
    }));
    mocks.artifactDeleteMany.mockResolvedValue({ count: 0 });
    mocks.artifactCreateMany.mockResolvedValue({ count: 0 });
    mocks.spawn.mockImplementation(() => {
      child = new EventEmitter() as EventEmitter & {
        kill: (signal: NodeJS.Signals) => boolean;
        stderr: EventEmitter;
        stdout: EventEmitter;
      };
      child.stderr = new EventEmitter();
      child.stdout = new EventEmitter();
      child.kill = kill;
      resolveSpawned();

      return child;
    });

    const runPromise = runTestSessionCheck({
      check: {
        enabled: true,
        entrypoint: "homepage.spec.ts",
        key: "homepage",
        name: "Homepage",
        tags: ["app", "core"],
        type: "browser",
      },
      env: [{ name: "ENVIRONMENT_URL", value: "https://example.test" }],
      existingRunId: runId,
      existingTestSessionId: "session_1",
      projectSlug: "account",
      reporter: "list",
      rootDir,
      signal: controller.signal,
      testSessionDeadline: {
        at: Date.now() + 30 * 60_000,
        timeoutMs: 30 * 60_000,
      },
    });

    await spawned;
    controller.abort();

    await expect(runPromise).resolves.toMatchObject({
      checkKey: "homepage",
      errorMessage: "Test session was cancelled.",
      runId,
      status: "cancelled",
    });
    expect(kill).toHaveBeenCalledWith("SIGTERM");
    expect(mocks.checkRunUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          errorMessage: "Test session was cancelled.",
          status: "CANCELLED",
        }),
        where: { id: runId },
      }),
    );
  });

  it("records failed retry attempts as separate runs before returning a passing retry", async () => {
    const runId = "run_1";

    mocks.checkFindFirst.mockResolvedValue({
      entrypoint: null,
      id: "check_1",
      key: "api-health",
      name: "API health",
      request: {
        assertions: [],
        headers: {},
        method: "GET",
        url: "https://example.test/health",
      },
      retryStrategy: {
        baseBackoffSeconds: 0,
        maxRetries: 1,
        type: "FIXED",
      },
      runs: [],
      type: "API",
    });
    mocks.checkRunFindFirst.mockResolvedValue({
      checkId: "check_1",
      id: runId,
    });
    mocks.checkRunCreate.mockImplementation(async (args) => ({
      checkId: "check_1",
      id: "run_2",
      ...args.data,
    }));
    mocks.checkRunUpdate.mockImplementation(async (args) => ({
      checkId: "check_1",
      id: args.where.id,
      ...args.data,
    }));
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response("upstream error", {
            status: 500,
            statusText: "Internal Server Error",
          }),
        )
        .mockResolvedValueOnce(
          new Response('{"ok":true}', {
            status: 200,
            statusText: "OK",
          }),
        ),
    );

    await expect(
      runCheckById({
        checkId: "check_1",
        env: [],
        projectSlug: "default",
        record: true,
        reporter: "list",
        rootDir: "/repo",
        runId,
      }),
    ).resolves.toMatchObject({
      checkKey: "api-health",
      runId: "run_2",
      status: "passed",
    });

    expect(mocks.checkRunCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          checkSnapshotDegradedResponseTime: 10_000,
          checkSnapshotKey: "api-health",
          checkSnapshotName: "API health",
          checkSnapshotProjectSlug: "default",
          checkSnapshotType: "API",
          attempt: 2,
          checkId: "check_1",
          maxAttempts: 2,
          retryGroupId: runId,
          runSource: "CLI",
          startedAt: expect.any(Date),
          status: "RUNNING",
          testSessionId: undefined,
        }),
      }),
    );
    expect(mocks.checkRunUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          result: expect.objectContaining({
            attempt: 1,
            attempts: 2,
            retries: 1,
            retryGroupId: runId,
          }),
          status: "FAILED",
        }),
        where: {
          id: runId,
        },
      }),
    );
    expect(mocks.checkRunUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          result: expect.objectContaining({
            attempt: 2,
            attempts: 2,
            status: 200,
          }),
          status: "PASSED",
        }),
        where: {
          id: "run_2",
        },
      }),
    );
    expect(mocks.deliverRunNotifications).toHaveBeenCalledTimes(1);
    expect(mocks.deliverRunNotifications).toHaveBeenCalledWith("run_2");
  });

  it("keeps a manual rerun attached to its existing test session", async () => {
    const runId = "run_2";

    mocks.checkFindFirst.mockResolvedValue({
      degradedResponseTime: 2_500,
      entrypoint: null,
      group: null,
      id: "check_1",
      key: "api-health",
      name: "API health",
      request: {
        assertions: [],
        headers: {},
        method: "GET",
        url: "https://example.test/health",
      },
      retryStrategy: null,
      runs: [],
      tags: ["api"],
      type: "API",
    });
    mocks.testSessionFindUnique.mockResolvedValue({
      id: "session_1",
      kind: "TEST",
      projectId: "project_1",
    });
    mocks.testSessionUpdate.mockResolvedValue({
      id: "session_1",
      kind: "TEST",
      projectId: "project_1",
      status: "RUNNING",
    });
    mocks.checkRunFindFirst.mockResolvedValue({
      checkId: "check_1",
      id: runId,
      testSessionId: "session_1",
    });
    mocks.checkRunUpdate.mockImplementation(async (args) => ({
      checkId: "check_1",
      id: args.where.id,
      ...args.data,
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response('{"ok":true}', {
          status: 200,
          statusText: "OK",
        }),
      ),
    );

    await expect(
      runCheckById({
        checkId: "check_1",
        env: [],
        existingTestSessionId: "session_1",
        projectSlug: "default",
        record: true,
        reporter: "list",
        rootDir: "/repo",
        runId,
        runSource: "MANUAL",
      }),
    ).resolves.toMatchObject({
      checkKey: "api-health",
      runId,
      status: "passed",
    });

    expect(mocks.testSessionUpdate).toHaveBeenCalledWith({
      data: {
        aiAnalysis: expect.anything(),
        status: "RUNNING",
      },
      where: {
        id: "session_1",
      },
    });
    expect(mocks.checkRunUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          checkSnapshotDegradedResponseTime: 2_500,
          checkSnapshotKey: "api-health",
          runSource: "MANUAL",
          status: "RUNNING",
          testSessionId: "session_1",
        }),
        where: {
          id: runId,
        },
      }),
    );
  });

  it("runs a pre-created check from another project inside a full regression session", async () => {
    const runId = "run_cross_project";

    mocks.checkFindFirst.mockResolvedValue({
      degradedResponseTime: null,
      entrypoint: null,
      group: null,
      id: "check_api",
      key: "api-health",
      name: "API health",
      request: {
        assertions: [],
        headers: {},
        method: "GET",
        url: "https://example.test/health",
      },
      retryStrategy: null,
      runs: [],
      tags: ["api"],
      type: "API",
    });
    mocks.projectFindUnique.mockResolvedValue({ id: "project_api" });
    mocks.testSessionFindUnique.mockResolvedValue({
      id: "session_full",
      kind: "TEST",
      projectId: "project_account",
      status: "RUNNING",
    });
    mocks.testSessionUpdate.mockResolvedValue({
      id: "session_full",
      kind: "TEST",
      projectId: "project_account",
      status: "RUNNING",
    });
    mocks.checkRunFindFirst.mockResolvedValue({
      checkId: "check_api",
      id: runId,
      projectId: "project_api",
      testSessionId: "session_full",
    });
    mocks.checkRunUpdate.mockImplementation(async (args) => ({
      checkId: "check_api",
      id: args.where.id,
      ...args.data,
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 })),
    );

    await expect(
      runCheckById({
        checkId: "check_api",
        env: [],
        existingTestSessionId: "session_full",
        projectSlug: "api",
        record: true,
        reporter: "list",
        rootDir: "/repo/api",
        runId,
        runSource: "MANUAL",
      }),
    ).resolves.toMatchObject({
      checkKey: "api-health",
      runId,
      status: "passed",
    });

    expect(mocks.checkRunFindFirst).toHaveBeenNthCalledWith(1, {
      select: {
        id: true,
      },
      where: {
        id: runId,
        projectId: "project_api",
        testSessionId: "session_full",
      },
    });
    expect(mocks.checkRunUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          checkSnapshotProjectSlug: "api",
          testSessionId: "session_full",
        }),
        where: { id: runId },
      }),
    );
  });
});

describe("runChecks", () => {
  afterEach(async () => {
    vi.clearAllMocks();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    await Promise.all(
      tempDirs.splice(0).map((directory) =>
        rm(directory, {
          force: true,
          recursive: true,
        }),
      ),
    );
  });

  it("executes the portable API request contract and validates assertions", async () => {
    const fetchMock = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        expect(String(input)).toBe(
          "https://api.example.test/health?token=runtime-token&verbose=true",
        );
        expect(init).toMatchObject({
          body: '{"probe":"runtime-token"}',
          headers: {
            Authorization: "Basic bW9uaXRvcjpydW50aW1lLXRva2Vu",
            "X-Probe": "runtime-token",
          },
          method: "POST",
          redirect: "manual",
        });

        return new Response('{"data":{"empty":{},"ok":true,"tags":["ready"]}}', {
          headers: { "content-type": "application/json; charset=utf-8" },
          status: 201,
          statusText: "Created",
        });
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      runChecks({
        checks: [
          {
            alertChannelLogicalIds: [],
            enabled: true,
            key: "api-health",
            muted: false,
            name: "API health",
            request: {
              assertions: [
                { comparison: "EQUALS", source: "STATUS_CODE", target: 201 },
                {
                  comparison: "EQUALS",
                  property: "$.data.ok",
                  source: "JSON_BODY",
                  target: true,
                },
                {
                  comparison: "CONTAINS",
                  property: "content-type",
                  source: "HEADERS",
                  target: "application/json",
                },
                {
                  comparison: "CONTAINS",
                  property: "$.data.tags",
                  source: "JSON_BODY",
                  target: "ready",
                },
                {
                  comparison: "HAS_KEY",
                  property: "$.data",
                  source: "JSON_BODY",
                  target: "ok",
                },
                {
                  comparison: "IS_EMPTY",
                  property: "$.data.empty",
                  source: "JSON_BODY",
                },
              ],
              basicAuth: { password: "{{TOKEN}}", username: "monitor" },
              body: '{"probe":"{{TOKEN}}"}',
              bodyType: "JSON",
              followRedirects: false,
              headers: { "X-Probe": "{{TOKEN}}" },
              method: "POST",
              queryParameters: {
                token: "{{TOKEN}}",
                verbose: "true",
              },
              url: "https://api.example.test/health",
            },
            shouldFail: false,
            tags: ["api"],
            type: "api",
          },
        ],
        env: [{ name: "TOKEN", value: "runtime-token" }],
        projectSlug: "demo",
        record: false,
        reporter: "list",
        rootDir: "/repo",
        tagSets: [],
      }),
    ).resolves.toMatchObject({
      failed: 0,
      passed: 1,
      results: [{ checkKey: "api-health", status: "passed" }],
      total: 1,
    });
  });

  it("matches Checkly JSON assertions for missing and dotted properties", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            '{"items":[{"id":1}],"list":{"limit.usage.raw":{"channel":{"email":1}}}}',
            { status: 200 },
          ),
        ),
    );

    await expect(
      runChecks({
        checks: [
          {
            alertChannelLogicalIds: [],
            enabled: true,
            key: "api-settings",
            muted: false,
            name: "API settings",
            request: {
              assertions: [
                {
                  comparison: "IS_EMPTY",
                  property: "$.errors",
                  source: "JSON_BODY",
                },
                {
                  comparison: "IS_NOT_NULL",
                  property: '$.list["limit.usage.raw"]',
                  source: "JSON_BODY",
                },
                {
                  comparison: "EQUALS",
                  property: "$.items[0].id",
                  source: "JSON_BODY",
                  target: 1,
                },
              ],
              headers: {},
              method: "POST",
              queryParameters: {},
              url: "https://api.example.test/settings",
            },
            shouldFail: false,
            tags: [],
            type: "api",
          },
        ],
        env: [],
        projectSlug: "demo",
        record: false,
        reporter: "list",
        rootDir: "/repo",
        tagSets: [],
      }),
    ).resolves.toMatchObject({
      failed: 0,
      passed: 1,
      results: [{ checkKey: "api-settings", status: "passed" }],
      total: 1,
    });
  });

  it("compares JSON numbers with serialized Checkly assertion targets", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response('{"obj":{"id":398}}', { status: 200 })),
    );

    await expect(
      runChecks({
        checks: [
          {
            alertChannelLogicalIds: [],
            enabled: true,
            key: "api-issue",
            muted: false,
            name: "API issue",
            request: {
              assertions: [
                {
                  comparison: "EQUALS",
                  property: "$.obj.id",
                  source: "JSON_BODY",
                  target: "398",
                },
              ],
              headers: {},
              method: "POST",
              queryParameters: {},
              url: "https://api.example.test/issue",
            },
            shouldFail: false,
            tags: [],
            type: "api",
          },
        ],
        env: [],
        projectSlug: "demo",
        record: false,
        reporter: "list",
        rootDir: "/repo",
        tagSets: [],
      }),
    ).resolves.toMatchObject({
      failed: 0,
      passed: 1,
      results: [{ checkKey: "api-issue", status: "passed" }],
      total: 1,
    });
  });

  it("reports failed API assertions as the check error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("not ready", { status: 503 })),
    );

    await expect(
      runChecks({
        checks: [
          {
            alertChannelLogicalIds: [],
            enabled: true,
            key: "api-health",
            muted: false,
            name: "API health",
            request: {
              assertions: [
                { comparison: "EQUALS", source: "STATUS_CODE", target: 200 },
              ],
              headers: {},
              method: "GET",
              queryParameters: {},
              url: "https://api.example.test/health",
            },
            shouldFail: false,
            tags: [],
            type: "api",
          },
        ],
        env: [],
        projectSlug: "demo",
        record: false,
        reporter: "list",
        rootDir: "/repo",
        tagSets: [],
      }),
    ).resolves.toMatchObject({
      failed: 1,
      passed: 0,
      results: [
        {
          errorMessage: "STATUS_CODE expected EQUALS 200, received 503.",
          status: "failed",
        },
      ],
    });
  });

  it("creates recorded CLI test sessions with the target URL", async () => {
    mocks.projectFindUnique.mockResolvedValue({
      id: "project_1",
    });
    mocks.checkFindMany.mockResolvedValue([]);
    mocks.testSessionCreate.mockResolvedValue({
      id: "session_1",
      status: "RUNNING",
    });
    mocks.testSessionUpdate.mockResolvedValue({
      id: "session_1",
      status: "PASSED",
    });

    await expect(
      runChecks({
        checkKeys: [],
        env: [
          {
            name: "ENVIRONMENT_URL",
            value: "https://example.test",
          },
        ],
        projectSlug: "default",
        record: true,
        reporter: "list",
        rootDir: "/repo",
        runMode: "test",
        tagSets: [],
      }),
    ).resolves.toMatchObject({
      sessionId: "session_1",
      total: 0,
    });

    expect(mocks.testSessionCreate).toHaveBeenCalledWith({
      data: {
        commitSha: undefined,
        kind: "TEST",
        name: undefined,
        projectId: "project_1",
        source: undefined,
        status: "RUNNING",
        targetUrl: "https://example.test",
        workspacePath: "/repo",
      },
    });
    expect(mocks.testSessionUpdate).toHaveBeenCalledWith({
      data: {
        status: "PASSED",
      },
      where: {
        id: "session_1",
      },
    });
  });

  it("records local test definitions as check run snapshots", async () => {
    mocks.testSessionCreate.mockResolvedValue({
      id: "session_1",
      status: "RUNNING",
    });
    mocks.checkRunCreate.mockImplementation(async (args) => ({
      id: "run_1",
      ...args.data,
    }));
    mocks.checkRunUpdate.mockImplementation(async (args) => ({
      id: args.where.id,
      ...args.data,
    }));
    mocks.testSessionUpdate.mockResolvedValue({
      id: "session_1",
      status: "PASSED",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response('{"ok":true}', {
          status: 200,
          statusText: "OK",
        }),
      ),
    );

    await expect(
      runChecks({
        checkKeys: ["api-health"],
        checks: [
          {
            enabled: true,
            groupName: "API",
            key: "api-health",
            name: "API health",
            request: {
              assertions: [],
              headers: {},
              method: "GET",
              url: "https://example.test/health",
            },
            tags: ["smoke"],
            type: "api",
          },
        ],
        env: [],
        projectSlug: "default",
        record: true,
        reporter: "list",
        rootDir: "/repo/config/checkly",
        runMode: "test",
        tagSets: [],
        testSessionCommitSha: "abc123def456",
        testSessionJobUrl: "https://gitlab.example.test/jobs/456",
        testSessionName: "Release v1.2.3",
        testSessionPipelineUrl: "https://gitlab.example.test/pipelines/123",
        testSessionRef: "v1.2.3",
        testSessionRepository: "developers/frontend/account",
      }),
    ).resolves.toMatchObject({
      failed: 0,
      passed: 1,
      sessionId: "session_1",
      total: 1,
    });

    expect(mocks.checkFindMany).not.toHaveBeenCalled();
    expect(mocks.projectFindUnique).toHaveBeenCalledWith({
      select: { id: true },
      where: { slug: "default" },
    });
    expect(mocks.testSessionCreate).toHaveBeenCalledWith({
      data: {
        commitSha: "abc123def456",
        jobUrl: "https://gitlab.example.test/jobs/456",
        kind: "TEST",
        name: "Release v1.2.3",
        pipelineUrl: "https://gitlab.example.test/pipelines/123",
        projectId: "project_1",
        ref: "v1.2.3",
        repository: "developers/frontend/account",
        source: undefined,
        status: "RUNNING",
        targetUrl: undefined,
        workspacePath: "/repo/config/checkly",
      },
    });
    expect(mocks.checkRunCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({
          checkId: expect.anything(),
        }),
      }),
    );
    expect(mocks.checkRunCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          checkSnapshotDegradedResponseTime: 10_000,
          checkSnapshotGroupName: "API",
          checkSnapshotKey: "api-health",
          checkSnapshotName: "API health",
          checkSnapshotProjectSlug: "default",
          checkSnapshotTags: ["smoke"],
          checkSnapshotType: "API",
          runSource: "CLI",
          testSessionId: "session_1",
        }),
      }),
    );
  });

  it("continues a queued remote test session without creating duplicate records", async () => {
    mocks.testSessionFindUnique.mockResolvedValue({
      id: "session_queued",
      kind: "TEST",
      status: "QUEUED",
    });
    mocks.testSessionUpdate.mockImplementation(async (args) => ({
      id: args.where.id,
      kind: "TEST",
      ...args.data,
    }));
    mocks.checkRunFindFirst.mockResolvedValue({
      id: "run_queued",
      status: "QUEUED",
    });
    mocks.checkRunUpdate.mockImplementation(async (args) => ({
      id: args.where.id,
      ...args.data,
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 200 })),
    );

    await expect(
      runChecks({
        checkKeys: ["api-health"],
        checks: [
          {
            enabled: true,
            key: "api-health",
            name: "API health",
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
          "api-health": "run_queued",
        },
        existingTestSessionId: "session_queued",
        projectSlug: "default",
        record: true,
        reporter: "list",
        rootDir: "/runtime/test-sessions/session_queued",
        runMode: "test",
        tagSets: [],
      }),
    ).resolves.toMatchObject({
      passed: 1,
      sessionId: "session_queued",
      total: 1,
    });

    expect(mocks.testSessionCreate).not.toHaveBeenCalled();
    expect(mocks.checkRunCreate).not.toHaveBeenCalled();
    expect(mocks.checkRunFindFirst).toHaveBeenCalledWith({
      where: {
        id: "run_queued",
      },
    });
    expect(mocks.checkRunUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "RUNNING",
          testSessionId: "session_queued",
        }),
        where: {
          id: "run_queued",
        },
      }),
    );
  });

  it("runs one remote session check without finalizing sibling checks", async () => {
    mocks.testSessionFindUnique.mockResolvedValue({
      id: "session_queued",
      kind: "TEST",
      status: "QUEUED",
    });
    mocks.testSessionUpdate.mockImplementation(async (args) => ({
      id: args.where.id,
      kind: "TEST",
      ...args.data,
    }));
    mocks.checkRunFindFirst.mockResolvedValue({
      id: "run_queued",
      status: "QUEUED",
    });
    mocks.checkRunUpdate.mockImplementation(async (args) => ({
      id: args.where.id,
      ...args.data,
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 200 })),
    );

    await expect(
      runTestSessionCheck({
        check: {
          enabled: true,
          key: "api-health",
          name: "API health",
          request: {
            assertions: [],
            headers: {},
            method: "GET",
            url: "https://example.test/health",
          },
          tags: [],
          type: "api",
        },
        env: [],
        existingRunId: "run_queued",
        existingTestSessionId: "session_queued",
        projectSlug: "default",
        reporter: "list",
        rootDir: "/runtime/test-sessions/session_queued",
        testSessionDeadline: {
          at: Date.now() + 60_000,
          timeoutMs: 60_000,
        },
      }),
    ).resolves.toMatchObject({
      runId: "run_queued",
      status: "passed",
    });

    expect(mocks.testSessionUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.testSessionUpdate).toHaveBeenCalledWith({
      data: {
        aiAnalysis: expect.anything(),
        status: "RUNNING",
      },
      where: {
        id: "session_queued",
      },
    });
  });

  it("queues a remote retry before completing the previous attempt", async () => {
    mocks.testSessionFindUnique.mockResolvedValue({
      id: "session_queued",
      kind: "TEST",
      status: "QUEUED",
    });
    mocks.testSessionUpdate.mockImplementation(async (args) => ({
      id: args.where.id,
      kind: "TEST",
      ...args.data,
    }));
    mocks.checkRunFindFirst
      .mockResolvedValueOnce({
        id: "run_queued",
        status: "QUEUED",
      })
      .mockResolvedValueOnce({
        id: "run_retry",
        status: "QUEUED",
      });
    mocks.checkRunCreate.mockImplementation(async (args) => ({
      id: "run_retry",
      ...args.data,
    }));
    mocks.checkRunUpdate.mockImplementation(async (args) => ({
      id: args.where.id,
      ...args.data,
    }));
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response("failed", { status: 500 }))
        .mockResolvedValueOnce(new Response("{}", { status: 200 })),
    );

    await expect(
      runTestSessionCheck({
        check: {
          enabled: true,
          key: "api-health",
          name: "API health",
          request: {
            assertions: [],
            headers: {},
            method: "GET",
            url: "https://example.test/health",
          },
          tags: [],
          type: "api",
        },
        env: [],
        existingRunId: "run_queued",
        existingTestSessionId: "session_queued",
        projectSlug: "default",
        reporter: "list",
        retries: 1,
        rootDir: "/runtime/test-sessions/session_queued",
        testSessionDeadline: {
          at: Date.now() + 60_000,
          timeoutMs: 60_000,
        },
      }),
    ).resolves.toMatchObject({
      runId: "run_retry",
      status: "passed",
    });

    expect(mocks.checkRunCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        attempt: 2,
        retryGroupId: "run_queued",
        status: "QUEUED",
        testSessionId: "session_queued",
      }),
    });
    expect(mocks.checkRunCreate.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.checkRunUpdate.mock.invocationCallOrder[1] ?? Number.POSITIVE_INFINITY,
    );
  });

  it("aborts an API check when the test session deadline is reached", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-10T10:00:00.000Z"));
    mocks.testSessionFindUnique.mockResolvedValue({
      id: "session_queued",
      kind: "TEST",
      status: "QUEUED",
    });
    mocks.testSessionUpdate.mockImplementation(async (args) => ({
      id: args.where.id,
      kind: "TEST",
      ...args.data,
    }));
    mocks.checkRunFindFirst.mockResolvedValue({
      id: "run_queued",
      status: "QUEUED",
    });
    mocks.checkRunUpdate.mockImplementation(async (args) => ({
      id: args.where.id,
      ...args.data,
    }));
    const fetchMock = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const timeoutMs = 1000;
    const runPromise = runChecks({
      checkKeys: ["api-health"],
      checks: [
        {
          enabled: true,
          key: "api-health",
          name: "API health",
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
        "api-health": "run_queued",
      },
      existingTestSessionId: "session_queued",
      projectSlug: "default",
      record: true,
      reporter: "list",
      rootDir: "/runtime/test-sessions/session_queued",
      runMode: "test",
      tagSets: [],
      testSessionDeadline: {
        at: Date.now() + timeoutMs,
        timeoutMs,
      },
    });
    const rejection = expect(runPromise).rejects.toEqual(
      expect.objectContaining<TestSessionTimeoutError>({
        name: "TestSessionTimeoutError",
        timeoutMs,
      }),
    );

    await vi.advanceTimersByTimeAsync(timeoutMs);

    await rejection;
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.test/health",
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("records CLI monitoring runs as trigger sessions", async () => {
    mocks.projectFindUnique.mockResolvedValue({
      id: "project_1",
    });
    mocks.checkFindMany.mockResolvedValue([]);
    mocks.testSessionCreate.mockResolvedValue({
      id: "session_1",
      status: "RUNNING",
    });
    mocks.testSessionUpdate.mockResolvedValue({
      id: "session_1",
      status: "PASSED",
    });

    await runChecks({
      checkKeys: [],
      env: [],
      projectSlug: "default",
      record: true,
      reporter: "list",
      rootDir: "/repo",
      runMode: "monitoring",
      tagSets: [],
      testSessionName: "Deploy v1.2.3",
    });

    expect(mocks.testSessionCreate).toHaveBeenCalledWith({
      data: {
        commitSha: undefined,
        kind: "TRIGGER",
        name: "Deploy v1.2.3",
        projectId: "project_1",
        source: "/repo",
        status: "RUNNING",
        targetUrl: undefined,
      },
    });
    expect(mocks.testSessionUpdate).toHaveBeenCalledWith({
      data: {
        status: "PASSED",
      },
      where: {
        id: "session_1",
      },
    });
  });
});
