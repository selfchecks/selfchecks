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
  checkRunFindFirst: vi.fn(),
  checkRunUpdate: vi.fn(),
  spawn: vi.fn(),
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
    },
    checkRun: {
      findFirst: mocks.checkRunFindFirst,
      update: mocks.checkRunUpdate,
    },
  },
}));

vi.mock("./ai-analysis.js", () => ({
  analyzeFailedCheck: vi.fn(),
}));

import { runCheckById } from "./runner.js";

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
});
