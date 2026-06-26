import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { authOptions, authorizeAdminCredentials, hasAdminEnvCredentials } from "./auth";
import { hashAdminPassword, writeRuntimeConfig } from "./runtime-config";

describe("authorizeAdminCredentials", () => {
  const env = {
    SELFCHECKS_ADMIN_LOGIN: "admin",
    SELFCHECKS_ADMIN_PASSWORD: "secret",
  };

  it("returns the admin user for matching credentials", () => {
    expect(
      authorizeAdminCredentials(
        {
          login: "admin",
          password: "secret",
        },
        env,
      ),
    ).toEqual({
      id: "admin",
      name: "admin",
    });
  });

  it("rejects invalid credentials", () => {
    expect(
      authorizeAdminCredentials(
        {
          login: "admin",
          password: "wrong",
        },
        env,
      ),
    ).toBeNull();
  });

  it("rejects credentials when admin env is not configured", () => {
    expect(
      authorizeAdminCredentials(
        {
          login: "admin",
          password: "secret",
        },
        {},
      ),
    ).toBeNull();
  });

  it("authenticates against runtime admin config before env fallback", () => {
    const configPath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "selfchecks-auth-")),
      "config.json",
    );
    const env = {
      SELFCHECKS_ADMIN_LOGIN: "env-admin",
      SELFCHECKS_ADMIN_PASSWORD: "env-secret",
      SELFCHECKS_CONFIG_PATH: configPath,
    };
    writeRuntimeConfig(
      {
        admin: {
          configuredAt: "2026-06-23T00:00:00.000Z",
          login: "runtime-admin",
          ...hashAdminPassword("runtime-secret", {
            iterations: 1,
            salt: "fixed-salt",
          }),
        },
        server: {
          caddyEmail: "ops@example.com",
          domain: "checks.example.com",
          publicUrl: "https://checks.example.com",
        },
        setup: {
          completedAt: "2026-06-23T00:00:00.000Z",
        },
      },
      env,
    );

    expect(
      authorizeAdminCredentials(
        {
          login: "runtime-admin",
          password: "runtime-secret",
        },
        env,
      ),
    ).toEqual({
      id: "admin",
      name: "runtime-admin",
    });
    expect(
      authorizeAdminCredentials(
        {
          login: "env-admin",
          password: "env-secret",
        },
        env,
      ),
    ).toBeNull();
  });
});

describe("hasAdminEnvCredentials", () => {
  it("requires both admin login and password", () => {
    expect(
      hasAdminEnvCredentials({
        SELFCHECKS_ADMIN_LOGIN: "admin",
        SELFCHECKS_ADMIN_PASSWORD: "secret",
      }),
    ).toBe(true);
    expect(
      hasAdminEnvCredentials({
        SELFCHECKS_ADMIN_LOGIN: "admin",
      }),
    ).toBe(false);
    expect(
      hasAdminEnvCredentials({
        SELFCHECKS_ADMIN_PASSWORD: "secret",
      }),
    ).toBe(false);
  });
});

describe("authOptions", () => {
  it("uses the custom login page and JWT sessions", () => {
    expect(authOptions.pages?.signIn).toBe("/login");
    expect(authOptions.session?.strategy).toBe("jwt");
  });
});
