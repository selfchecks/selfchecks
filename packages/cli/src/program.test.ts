import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  type CliCommandOutput,
  createSelfchecksProgram,
  parseEnv,
  parseRetries,
} from "./program.js";

const tempDirs: string[] = [];

async function createTempProject(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "selfchecks-cli-"));
  tempDirs.push(dir);
  return dir;
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

  it("emits normalized test selectors and environment variables", async () => {
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
      ]),
    ).resolves.toEqual([
      {
        command: "test",
        checkKeys: [],
        env: [
          {
            name: "ENVIRONMENT_URL",
            value: "https://example.test",
          },
        ],
        projectSlug: "default",
        record: true,
        reporter: "github",
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
        tagSets: [
          ["app", "smoke"],
          ["pr", "transport"],
        ],
      },
    ]);
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
});
