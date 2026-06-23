import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  hashAdminPassword,
  isSetupRequired,
  readRuntimeConfig,
  verifyAdminPassword,
  writeRuntimeConfig,
  type SelfchecksRuntimeConfig,
} from "./runtime-config";

function createTempConfigPath() {
  return path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "selfchecks-config-")),
    "config.json",
  );
}

describe("runtime config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the default config when no runtime file is configured", () => {
    expect(readRuntimeConfig().admin).toBeNull();
    expect(isSetupRequired()).toBe(false);
  });

  it("writes and reads runtime config", () => {
    const configPath = createTempConfigPath();
    vi.stubEnv("SELFCHECKS_CONFIG_PATH", configPath);
    const password = hashAdminPassword("secret-value", {
      iterations: 1,
      salt: "fixed-salt",
    });
    const config: SelfchecksRuntimeConfig = {
      admin: {
        configuredAt: "2026-06-23T00:00:00.000Z",
        login: "admin",
        ...password,
      },
      server: {
        caddyEmail: "ops@example.com",
        domain: "checks.example.com",
        publicUrl: "https://checks.example.com",
      },
      setup: {
        completedAt: "2026-06-23T00:00:00.000Z",
      },
    };

    writeRuntimeConfig(config);

    expect(readRuntimeConfig()).toEqual(config);
    expect(isSetupRequired()).toBe(false);
  });

  it("verifies hashed admin passwords", () => {
    const password = hashAdminPassword("secret-value", {
      iterations: 1,
      salt: "fixed-salt",
    });
    const admin = {
      configuredAt: "2026-06-23T00:00:00.000Z",
      login: "admin",
      ...password,
    };

    expect(verifyAdminPassword("secret-value", admin)).toBe(true);
    expect(verifyAdminPassword("wrong-value", admin)).toBe(false);
  });

  it("requires setup when setup mode is enabled without admin config", () => {
    vi.stubEnv("SELFCHECKS_CONFIG_PATH", createTempConfigPath());

    expect(isSetupRequired()).toBe(true);
  });
});
