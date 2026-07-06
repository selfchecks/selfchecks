import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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
  projectFindUnique: vi.fn(),
  spawn: vi.fn(),
  testSessionCreate: vi.fn(),
  testSessionUpdate: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  default: {
    spawn: mocks.spawn,
  },
  spawn: mocks.spawn,
}));

vi.mock("@selfchecks/db", () => ({
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
    },
    testSession: {
      create: mocks.testSessionCreate,
      update: mocks.testSessionUpdate,
    },
  },
}));

vi.mock("./ai-analysis.js", () => ({
  analyzeFailedCheck: vi.fn(),
}));

import { runCheckById, runChecks } from "./runner.js";

const tempDirs: string[] = [];

async function createTempProject() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "selfchecks-runner-"));

  tempDirs.push(directory);
  return directory;
}

describe("runCheckById", () => {
  afterEach(async () => {
    vi.clearAllMocks();
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

  it("isolates Playwright artifacts per recorded run", async () => {
    const rootDir = await createTempProject();
    const runId = "run_1";
    const artifactsRootDir = path.join(rootDir, "runtime-artifacts");
    vi.stubEnv("SELFCHECKS_ARTIFACTS_DIR", artifactsRootDir);

    const isolatedOutputDir = path.join(artifactsRootDir, runId, "test-results");
    const isolatedTracePath = path.join(
      isolatedOutputDir,
      "autopayment-chromium",
      "trace.zip",
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
          await writeFile(isolatedTracePath, "trace payload");
          await writeFile(sharedTracePath, "shared trace payload");

          child.stdout.emit("data", Buffer.from("passed"));
          child.emit("close", 0);
        })();
      });

      return child;
    });

    await expect(
      runCheckById({
        checkId: "check_1",
        env: [{ name: "ENVIRONMENT_URL", value: "https://example.test" }],
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

    expect(spawn).toHaveBeenCalledWith(
      "npx",
      [
        "playwright",
        "test",
        "src/__checks__/UI/App/billing/rest.autopayment.spec.ts",
        "--config",
        "playwright.config.ts",
        "--output",
        isolatedOutputDir,
        "--reporter",
        "list",
      ],
      expect.objectContaining({
        cwd: rootDir,
        env: expect.objectContaining({
          ENVIRONMENT_URL: "https://example.test",
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
      ]),
    );
    expect(artifactCreateArgs.data.map((artifact) => artifact.path)).not.toContain(
      sharedTracePath,
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

    expect(mocks.checkRunCreate).toHaveBeenCalledWith({
      data: {
        attempt: 2,
        checkId: "check_1",
        maxAttempts: 2,
        retryGroupId: runId,
        startedAt: expect.any(Date),
        status: "RUNNING",
        testSessionId: undefined,
      },
    });
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
  });
});

describe("runChecks", () => {
  afterEach(async () => {
    vi.clearAllMocks();
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
        kind: "TEST",
        name: undefined,
        source: "/repo",
        status: "RUNNING",
        targetUrl: "https://example.test",
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
        kind: "TRIGGER",
        name: "Deploy v1.2.3",
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
