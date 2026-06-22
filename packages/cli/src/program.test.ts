import { describe, expect, it } from "vitest";

import {
  type CliCommandOutput,
  createSelfchecksProgram,
  parseEnv,
  parseRetries,
} from "./program.js";

async function parseCommand(args: string[]): Promise<CliCommandOutput[]> {
  const outputs: CliCommandOutput[] = [];
  const program = createSelfchecksProgram({
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
  it("emits deploy command options", async () => {
    await expect(
      parseCommand([
        "deploy",
        "--force",
        "--dry-run",
        "--project",
        "account",
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
        status: "pending_implementation",
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
        env: [
          {
            name: "ENVIRONMENT_URL",
            value: "https://example.test",
          },
        ],
        record: true,
        reporter: "github",
        status: "pending_implementation",
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
        "--record",
        "--test-session-name",
        "Deploy v1.2.3",
      ]),
    ).resolves.toEqual([
      {
        command: "trigger",
        record: true,
        reporter: "github",
        retries: 1,
        status: "pending_implementation",
        testSessionName: "Deploy v1.2.3",
      },
    ]);
  });
});
