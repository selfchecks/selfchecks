import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  type CliCommandOutput,
  createSelfchecksProgram,
  parseCheckType,
  parseEnv,
  parseEnvJson,
  parseRetries,
} from "./program.js";

const tempDirs: string[] = [];

async function createTempProject(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "selfchecks-cli-"));
  tempDirs.push(dir);
  return dir;
}

async function createTempChecklyProject(): Promise<string> {
  const rootDir = await createTempProject();

  await mkdir(path.join(rootDir, "config/checkly"), { recursive: true });
  await writeFile(
    path.join(rootDir, "config/checkly/homepage.check.ts"),
    `
      new BrowserCheck("homepage", {
        name: "Homepage",
        entrypoint: "homepage.spec.ts"
      });
    `,
  );

  return rootDir;
}

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(
    tempDirs.splice(0).map((dir) =>
      rm(dir, {
        force: true,
        recursive: true,
      }),
    ),
  );
});

async function parseCommand(args: string[]): Promise<CliCommandOutput[]> {
  const outputs: CliCommandOutput[] = [];
  const program = createSelfchecksProgram({
    runChecksLocally: async () => ({
      durationMs: 10,
      failed: 0,
      passed: 0,
      results: [],
      skipped: 0,
      total: 0,
    }),
    write: (value) => outputs.push(value),
  });

  program.exitOverride();
  program.configureOutput({
    writeErr: () => undefined,
    writeOut: () => undefined,
  });

  await program.parseAsync(["node", "selfchecks", ...args]);

  return outputs;
}

describe("parseEnv", () => {
  it("splits a NAME=value pair", () => {
    expect(parseEnv("ENVIRONMENT_URL=https://example.test")).toEqual({
      name: "ENVIRONMENT_URL",
      value: "https://example.test",
    });
  });

  it("keeps equals signs inside the value", () => {
    expect(parseEnv("TOKEN=a=b=c")).toEqual({
      name: "TOKEN",
      value: "a=b=c",
    });
  });

  it("rejects malformed values", () => {
    expect(() => parseEnv("ENVIRONMENT_URL")).toThrow(
      "Expected environment value in NAME=value format",
    );
    expect(() => parseEnv("=missing")).toThrow(
      "Expected environment value in NAME=value format",
    );
  });
});

describe("parseRetries", () => {
  it("parses non-negative retry counts", () => {
    expect(parseRetries("0")).toBe(0);
    expect(parseRetries("3")).toBe(3);
  });

  it("rejects negative and non-numeric retry counts", () => {
    expect(() => parseRetries("-1")).toThrow(
      "Expected retries to be a non-negative integer",
    );
    expect(() => parseRetries("not-a-number")).toThrow(
      "Expected retries to be a non-negative integer",
    );
    expect(() => parseRetries("1abc")).toThrow(
      "Expected retries to be a non-negative integer",
    );
  });
});

describe("parseCheckType", () => {
  it("normalizes supported check types", () => {
    expect(parseCheckType(" Browser ")).toBe("browser");
    expect(parseCheckType("API")).toBe("api");
  });

  it("rejects unsupported check types", () => {
    expect(() => parseCheckType("heartbeat")).toThrow(
      "Expected check type to be api or browser",
    );
  });
});

describe("parseEnvJson", () => {
  it("reads CI runtime values without command-line arguments", () => {
    expect(
      parseEnvJson(
        JSON.stringify([{ name: "ENVIRONMENT_URL", value: "https://example.test" }]),
      ),
    ).toEqual([{ name: "ENVIRONMENT_URL", value: "https://example.test" }]);
  });

  it("rejects malformed CI runtime values", () => {
    expect(() => parseEnvJson("{}")).toThrow(
      "SELFCHECKS_ENV_JSON must contain an array",
    );
  });
});

describe("createSelfchecksProgram", () => {
  it("emits deploy command options and parsed summary", async () => {
    const rootDir = await createTempProject();
    await mkdir(path.join(rootDir, "config/checkly"), { recursive: true });
    await writeFile(
      path.join(rootDir, "config/checkly/homepage.check.ts"),
      `
        new BrowserCheck("homepage", {
          name: "Homepage",
          entrypoint: "homepage.spec.ts"
        });
      `,
    );

    await expect(
      parseCommand([
        "deploy",
        "--force",
        "--dry-run",
        "--project",
        "account",
        "--root",
        rootDir,
        "--config",
        "config/checkly/checkly.config.ts",
      ]),
    ).resolves.toEqual([
      {
        command: "deploy",
        configPath: "config/checkly/checkly.config.ts",
        dryRun: true,
        force: true,
        projectSlug: "account",
        rootDir,
        status: "parsed",
        summary: {
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
          created: 1,
          projectSlug: "account",
          removed: 0,
          updated: 0,
          warnings: [],
        },
      },
    ]);
  });

  it("uses the config directory as deploy root when --root is omitted", async () => {
    const rootDir = await createTempProject();
    const configDir = path.join(rootDir, "config/checkly");

    await mkdir(configDir, { recursive: true });
    await writeFile(path.join(configDir, "checkly.config.ts"), "export default {};");
    await writeFile(
      path.join(configDir, "homepage.check.ts"),
      `
        new BrowserCheck("homepage", {
          name: "Homepage",
          entrypoint: "homepage.spec.ts"
        });
      `,
    );

    await expect(
      parseCommand([
        "deploy",
        "--dry-run",
        "--project",
        "account",
        "--config",
        path.join(configDir, "checkly.config.ts"),
      ]),
    ).resolves.toEqual([
      expect.objectContaining({
        command: "deploy",
        rootDir: configDir,
        status: "parsed",
        summary: expect.objectContaining({
          checks: [
            expect.objectContaining({
              key: "homepage",
              name: "Homepage",
            }),
          ],
        }),
      }),
    ]);
  });

  it("applies migrations before persisting deployed checks", async () => {
    const calls: string[] = [];
    const rootDir = await createTempProject();
    const migrateDatabase = vi.fn(async () => {
      calls.push("migrate");
    });
    const deployChecks = vi.fn(async ({ summary }) => {
      calls.push("deploy");

      return {
        ...summary,
        created: 0,
        updated: 1,
      };
    });
    const outputs: CliCommandOutput[] = [];
    const program = createSelfchecksProgram({
      deployChecks,
      migrateDatabase,
      write: (value) => outputs.push(value),
    });

    await mkdir(path.join(rootDir, "config/checkly"), { recursive: true });
    await writeFile(
      path.join(rootDir, "config/checkly/homepage.check.ts"),
      `
        new BrowserCheck("homepage", {
          name: "Homepage",
          entrypoint: "homepage.spec.ts"
        });
      `,
    );
    program.exitOverride();
    program.configureOutput({
      writeErr: () => undefined,
      writeOut: () => undefined,
    });

    await program.parseAsync([
      "node",
      "selfchecks",
      "deploy",
      "--project",
      "account",
      "--root",
      rootDir,
    ]);

    expect(calls).toEqual(["migrate", "deploy"]);
    expect(migrateDatabase).toHaveBeenCalledOnce();
    expect(deployChecks).toHaveBeenCalledWith(
      expect.objectContaining({
        allowRemovals: false,
        projectSlug: "account",
        rootDir,
      }),
    );
    expect(outputs[0]).toMatchObject({
      command: "deploy",
      status: "deployed",
      summary: {
        created: 0,
        updated: 1,
      },
    });
  });

  it("passes --force through to allow stale check removals", async () => {
    const rootDir = await createTempProject();
    const deployChecks = vi.fn(async ({ summary }) => summary);
    const program = createSelfchecksProgram({
      deployChecks,
      migrateDatabase: async () => undefined,
      write: () => undefined,
    });

    await mkdir(path.join(rootDir, "config/checkly"), { recursive: true });
    await writeFile(
      path.join(rootDir, "config/checkly/homepage.check.ts"),
      `
        new BrowserCheck("homepage", {
          name: "Homepage",
          entrypoint: "homepage.spec.ts"
        });
      `,
    );
    program.exitOverride();
    program.configureOutput({
      writeErr: () => undefined,
      writeOut: () => undefined,
    });

    await program.parseAsync([
      "node",
      "selfchecks",
      "deploy",
      "--force",
      "--project",
      "account",
      "--root",
      rootDir,
    ]);

    expect(deployChecks).toHaveBeenCalledWith(
      expect.objectContaining({
        allowRemovals: true,
        projectSlug: "account",
        rootDir,
      }),
    );
  });

  it("uploads deployments when remote API credentials are configured", async () => {
    const rootDir = await createTempProject();
    const deployChecks = vi.fn();
    const deployRemotely = vi.fn(async () => ({
      checks: [],
      created: 1,
      projectSlug: "account",
      removed: 0,
      updated: 0,
      warnings: [],
    }));
    const migrateDatabase = vi.fn();
    const program = createSelfchecksProgram({
      deployChecks,
      deployRemotely,
      migrateDatabase,
      write: () => undefined,
    });

    await program.parseAsync([
      "node",
      "selfchecks",
      "deploy",
      "--api-url",
      "https://checks.example.test",
      "--api-token",
      "secret",
      "--force",
      "--project",
      "account",
      "--root",
      rootDir,
    ]);

    expect(deployRemotely).toHaveBeenCalledWith({
      allowRemovals: true,
      apiToken: "secret",
      apiUrl: "https://checks.example.test",
      projectSlug: "account",
      rootDir,
    });
    expect(deployChecks).not.toHaveBeenCalled();
    expect(migrateDatabase).not.toHaveBeenCalled();
  });

  it("emits normalized test selectors and environment variables", async () => {
    const rootDir = await createTempChecklyProject();

    await expect(
      parseCommand([
        "test",
        "--tags",
        " smoke,app,smoke ",
        "--tags",
        "transport,pr",
        "-e",
        "ENVIRONMENT_URL=https://example.test",
        "--reporter",
        "github",
        "--record",
        "--root",
        rootDir,
      ]),
    ).resolves.toEqual([
      {
        command: "test",
        checkKeys: [],
        checkTypes: [],
        env: [
          {
            name: "ENVIRONMENT_URL",
            value: "https://example.test",
          },
        ],
        projectSlug: "default",
        record: true,
        reporter: "github",
        rootDir,
        status: "completed",
        summary: {
          durationMs: 10,
          failed: 0,
          passed: 0,
          results: [],
          skipped: 0,
          total: 0,
        },
        tagSets: [
          ["app", "smoke"],
          ["pr", "transport"],
        ],
      },
    ]);
  });

  it("runs the test command as a recorded test session", async () => {
    const rootDir = await createTempChecklyProject();
    const runChecksLocally = vi.fn(async () => ({
      durationMs: 10,
      failed: 0,
      passed: 0,
      results: [],
      skipped: 0,
      total: 0,
    }));
    const program = createSelfchecksProgram({
      runChecksLocally,
      write: () => undefined,
    });

    program.exitOverride();
    program.configureOutput({
      writeErr: () => undefined,
      writeOut: () => undefined,
    });

    await program.parseAsync([
      "node",
      "selfchecks",
      "test",
      "--record",
      "--root",
      rootDir,
      "-e",
      "ENVIRONMENT_URL=https://example.test",
    ]);

    expect(runChecksLocally).toHaveBeenCalledWith(
      expect.objectContaining({
        env: [
          {
            name: "ENVIRONMENT_URL",
            value: "https://example.test",
          },
        ],
        record: true,
        runMode: "test",
      }),
    );
  });

  it("uploads test sessions when remote API credentials are configured", async () => {
    const rootDir = await createTempChecklyProject();
    const runChecksLocally = vi.fn();
    const runChecksRemotely = vi.fn(async () => ({
      durationMs: 10,
      failed: 0,
      passed: 1,
      results: [],
      sessionId: "session_1",
      skipped: 0,
      total: 1,
    }));
    const program = createSelfchecksProgram({
      runChecksLocally,
      runChecksRemotely,
      write: () => undefined,
    });

    program.exitOverride();
    program.configureOutput({
      writeErr: () => undefined,
      writeOut: () => undefined,
    });

    await program.parseAsync([
      "node",
      "selfchecks",
      "test",
      "--api-url",
      "https://checks.example.test",
      "--api-token",
      "api-token",
      "--type",
      "browser",
      "--root",
      rootDir,
      "--test-session-name",
      "Release 1.2.3",
      "--repository",
      "sendsay-ru/frontend/account",
      "--ref",
      "release/1.2.3",
      "--commit-sha",
      "abc123def456",
      "--pipeline-url",
      "https://gitlab.example.test/pipelines/123",
      "--job-url",
      "https://gitlab.example.test/jobs/456",
    ]);

    expect(runChecksLocally).not.toHaveBeenCalled();
    expect(runChecksRemotely).toHaveBeenCalledWith(
      expect.objectContaining({
        apiToken: "api-token",
        apiUrl: "https://checks.example.test",
        checkTypes: ["browser"],
        commitSha: "abc123def456",
        jobUrl: "https://gitlab.example.test/jobs/456",
        pipelineUrl: "https://gitlab.example.test/pipelines/123",
        ref: "release/1.2.3",
        repository: "sendsay-ru/frontend/account",
        rootDir,
        testSessionName: "Release 1.2.3",
      }),
    );
  });

  it("emits trigger command options", async () => {
    await expect(
      parseCommand([
        "trigger",
        "--reporter",
        "github",
        "--retries",
        "1",
        "-e",
        "ENVIRONMENT_URL=https://example.test",
        "--record",
        "--test-session-name",
        "Deploy v1.2.3",
      ]),
    ).resolves.toEqual([
      {
        command: "trigger",
        projectSlug: "default",
        record: true,
        reporter: "github",
        retries: 1,
        rootDir: process.cwd(),
        status: "completed",
        summary: {
          durationMs: 10,
          failed: 0,
          passed: 0,
          results: [],
          skipped: 0,
          total: 0,
        },
        testSessionName: "Deploy v1.2.3",
      },
    ]);
  });

  it("passes trigger retry overrides into the runner", async () => {
    const runChecksLocally = vi.fn(async () => ({
      durationMs: 10,
      failed: 0,
      passed: 0,
      results: [],
      skipped: 0,
      total: 0,
    }));
    const program = createSelfchecksProgram({
      runChecksLocally,
      write: () => undefined,
    });

    program.exitOverride();
    program.configureOutput({
      writeErr: () => undefined,
      writeOut: () => undefined,
    });

    await program.parseAsync(["node", "selfchecks", "trigger", "--retries", "2"]);

    expect(runChecksLocally).toHaveBeenCalledWith(
      expect.objectContaining({
        retries: 2,
        runMode: "monitoring",
      }),
    );
  });

  it("queues triggers when remote API credentials are configured", async () => {
    const runChecksLocally = vi.fn();
    const triggerRemotely = vi.fn(async () => ({
      durationMs: 10,
      failed: 0,
      passed: 1,
      results: [],
      sessionId: "session_1",
      skipped: 0,
      total: 1,
    }));
    const program = createSelfchecksProgram({
      runChecksLocally,
      triggerRemotely,
      write: () => undefined,
    });

    await program.parseAsync([
      "node",
      "selfchecks",
      "trigger",
      "--api-url",
      "https://checks.example.test",
      "--api-token",
      "secret",
      "--project",
      "account",
      "--ref",
      "stable",
      "--commit-sha",
      "abc123",
      "-e",
      "BASE_URL=https://example.test",
    ]);

    expect(triggerRemotely).toHaveBeenCalledWith(
      expect.objectContaining({
        apiToken: "secret",
        apiUrl: "https://checks.example.test",
        commitSha: "abc123",
        env: [{ name: "BASE_URL", value: "https://example.test" }],
        projectSlug: "account",
        ref: "stable",
      }),
    );
    expect(runChecksLocally).not.toHaveBeenCalled();
  });
});
