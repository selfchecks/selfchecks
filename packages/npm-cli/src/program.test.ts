import { describe, expect, it, vi } from "vitest";

import { createRemoteSelfchecksProgram } from "./program.js";
import { SELFCHECKS_CLI_VERSION } from "./version.js";

const successfulSummary = {
  durationMs: 100,
  failed: 0,
  passed: 1,
  results: [],
  skipped: 0,
  total: 1,
};

describe("createRemoteSelfchecksProgram", () => {
  it("reports the published package version", () => {
    const program = createRemoteSelfchecksProgram({ write: vi.fn() });

    expect(program.version()).toBe(SELFCHECKS_CLI_VERSION);
  });

  it("passes CI selectors and metadata to a remote test session", async () => {
    const runChecksRemotely = vi.fn().mockResolvedValue(successfulSummary);
    const write = vi.fn();
    const program = createRemoteSelfchecksProgram({ runChecksRemotely, write });

    await program.parseAsync(
      [
        "node",
        "selfchecks",
        "test",
        "--api-url",
        "https://checks.example.test",
        "--api-token",
        "token",
        "--project",
        "account",
        "--root",
        "config/checkly",
        "--type",
        "browser",
        "--tags",
        "app,smoke",
        "-e",
        "ENVIRONMENT_URL=https://app.example.test",
      ],
      { from: "node" },
    );

    expect(runChecksRemotely).toHaveBeenCalledWith(
      expect.objectContaining({
        apiToken: "token",
        apiUrl: "https://checks.example.test",
        checkTypes: ["browser"],
        env: [
          {
            name: "ENVIRONMENT_URL",
            value: "https://app.example.test",
          },
        ],
        projectSlug: "account",
        rootDir: "config/checkly",
        tagSets: [["app", "smoke"]],
      }),
    );
    expect(write).toHaveBeenCalledWith(
      expect.objectContaining({ command: "test", status: "completed" }),
    );
  });

  it("passes an inferred config path to the project compiler", async () => {
    const deployRemotely = vi.fn().mockResolvedValue({
      checks: [],
      created: 0,
      projectSlug: "demo",
      removed: 0,
      updated: 0,
      warnings: [],
    });
    const program = createRemoteSelfchecksProgram({
      deployRemotely,
      write: vi.fn(),
    });

    await program.parseAsync(
      [
        "node",
        "selfchecks",
        "deploy",
        "--api-url",
        "https://checks.example.test",
        "--api-token",
        "token",
        "--project",
        "demo",
        "--config",
        "monitoring/checkly.config.ts",
      ],
      { from: "node" },
    );

    expect(deployRemotely).toHaveBeenCalledWith({
      allowRemovals: false,
      apiToken: "token",
      apiUrl: "https://checks.example.test",
      configPath: "checkly.config.ts",
      projectSlug: "demo",
      rootDir: "monitoring",
    });
  });

  it("requires both remote credentials", async () => {
    const program = createRemoteSelfchecksProgram({ write: vi.fn() });

    await expect(
      program.parseAsync(["node", "selfchecks", "trigger"], { from: "node" }),
    ).rejects.toThrow(
      "SELFCHECKS_URL and SELFCHECKS_API_TOKEN are required for trigger.",
    );
  });
});
