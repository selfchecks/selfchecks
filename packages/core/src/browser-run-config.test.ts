import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  defaultBrowserRunTimeoutMs,
  resolveBrowserTraceModeConfig,
  resolveBrowserTraceModeForAttempt,
  resolveBrowserRunTimeoutConfig,
} from "./browser-run-config.js";

const tempDirs: string[] = [];

async function createTempRoot() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "selfchecks-config-"));

  tempDirs.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((directory) =>
      rm(directory, {
        force: true,
        recursive: true,
      }),
    ),
  );
});

describe("resolveBrowserRunTimeoutConfig", () => {
  it("uses the 10 minute selfchecks default when configs are absent", async () => {
    const rootDir = await createTempRoot();

    await expect(resolveBrowserRunTimeoutConfig(rootDir)).resolves.toMatchObject({
      source: "selfchecks default",
      timeoutMs: defaultBrowserRunTimeoutMs,
    });
  });

  it("reads globalTimeout from playwright config without executing it", async () => {
    const rootDir = await createTempRoot();

    await writeFile(
      path.join(rootDir, "playwright.config.ts"),
      `
        import { defineConfig } from '@playwright/test';

        const config = {
          timeout: 300_000,
          globalTimeout: 12 * 60 * 1000,
        };

        export default defineConfig(config);
      `,
    );

    await expect(resolveBrowserRunTimeoutConfig(rootDir)).resolves.toMatchObject({
      configPath: path.join(rootDir, "playwright.config.ts"),
      configuredTestTimeoutMs: 300_000,
      source: "playwright.globalTimeout",
      timeoutMs: 720_000,
    });
  });

  it("falls back to checkly playwrightConfig globalTimeout", async () => {
    const rootDir = await createTempRoot();

    await writeFile(
      path.join(rootDir, "checkly.config.ts"),
      `
        import { defineConfig } from 'checkly';

        const RUN_TIMEOUT = 900_000;
        const config = defineConfig({
          checks: {
            playwrightConfig: {
              globalTimeout: RUN_TIMEOUT,
              timeout: 300_000,
            },
          },
        });

        export default config;
      `,
    );

    await expect(resolveBrowserRunTimeoutConfig(rootDir)).resolves.toMatchObject({
      configPath: path.join(rootDir, "checkly.config.ts"),
      configuredTestTimeoutMs: 300_000,
      source: "checkly.checks.playwrightConfig.globalTimeout",
      timeoutMs: 900_000,
    });
  });

  it("keeps the 10 minute run default when only a shorter per-test timeout exists", async () => {
    const rootDir = await createTempRoot();

    await writeFile(
      path.join(rootDir, "playwright.config.ts"),
      `
        export default {
          timeout: 5 * 60 * 1000,
        };
      `,
    );

    await expect(resolveBrowserRunTimeoutConfig(rootDir)).resolves.toMatchObject({
      configuredTestTimeoutMs: 300_000,
      source: "selfchecks default",
      timeoutMs: defaultBrowserRunTimeoutMs,
    });
  });

  it("does not kill runs sooner than a larger configured per-test timeout", async () => {
    const rootDir = await createTempRoot();

    await writeFile(
      path.join(rootDir, "playwright.config.ts"),
      `
        export default {
          timeout: 15 * 60 * 1000,
        };
      `,
    );

    await expect(resolveBrowserRunTimeoutConfig(rootDir)).resolves.toMatchObject({
      configuredTestTimeoutMs: 900_000,
      source: "playwright.timeout (minimum run timeout)",
      timeoutMs: 900_000,
    });
  });
});

describe("resolveBrowserTraceModeConfig", () => {
  it("reads a string trace mode from playwright config", async () => {
    const rootDir = await createTempRoot();

    await writeFile(
      path.join(rootDir, "playwright.config.ts"),
      `
        import { defineConfig } from '@playwright/test';

        export default defineConfig({
          use: {
            trace: 'on-first-retry',
          },
        });
      `,
    );

    await expect(resolveBrowserTraceModeConfig(rootDir)).resolves.toEqual({
      configPath: path.join(rootDir, "playwright.config.ts"),
      mode: "on-first-retry",
      source: "playwright.use.trace",
    });
  });

  it("reads an object trace mode and follows top-level constants", async () => {
    const rootDir = await createTempRoot();

    await writeFile(
      path.join(rootDir, "playwright.config.ts"),
      `
        const TRACE_MODE = 'on-all-retries';
        const config = {
          use: {
            trace: {
              mode: TRACE_MODE,
              screenshots: false,
            },
          },
        };

        export default config;
      `,
    );

    await expect(resolveBrowserTraceModeConfig(rootDir)).resolves.toMatchObject({
      mode: "on-all-retries",
      source: "playwright.use.trace.mode",
    });
  });

  it("falls back to checkly playwrightConfig trace mode", async () => {
    const rootDir = await createTempRoot();

    await writeFile(
      path.join(rootDir, "checkly.config.ts"),
      `
        export default {
          checks: {
            playwrightConfig: {
              use: {
                trace: 'retain-on-failure',
              },
            },
          },
        };
      `,
    );

    await expect(resolveBrowserTraceModeConfig(rootDir)).resolves.toMatchObject({
      mode: "retain-on-failure",
      source: "checkly.checks.playwrightConfig.use.trace",
    });
  });
});

describe("resolveBrowserTraceModeForAttempt", () => {
  it.each([
    ["off", 1, 3, "off"],
    ["off", 2, 3, "off"],
    ["on", 1, 3, "on"],
    ["on", 2, 3, "on"],
    ["retain-on-failure", 1, 3, "retain-on-failure"],
    ["retain-on-failure", 2, 3, "retain-on-failure"],
    ["on-first-retry", 1, 1, "off"],
    ["on-first-retry", 1, 2, "off"],
    ["on-first-retry", 2, 2, "on"],
    ["on-first-retry", 1, 3, "off"],
    ["on-first-retry", 2, 3, "off"],
    ["on-first-retry", 3, 3, "on"],
    ["on-all-retries", 1, 3, "off"],
    ["on-all-retries", 2, 3, "on"],
    ["on-all-retries", 3, 3, "on"],
    ["retain-on-first-failure", 1, 3, "retain-on-failure"],
    ["retain-on-first-failure", 2, 3, "off"],
  ] as const)(
    "maps %s on attempt %i of %i to %s",
    (mode, attempt, maxAttempts, expected) => {
      expect(resolveBrowserTraceModeForAttempt(mode, attempt, maxAttempts)).toBe(
        expected,
      );
    },
  );
});
