import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  defaultBrowserRunTimeoutMs,
  resolveBrowserRunTimeoutConfig,
} from "./browser-run-config.js";

const tempDirs: string[] = [];

async function createTempRoot() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "selfchecks-config-"));

  tempDirs.push(directory);
  return directory;
}

describe("resolveBrowserRunTimeoutConfig", () => {
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
