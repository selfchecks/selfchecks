import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

function createRuntimePaths() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "selfchecks-setup-"));

  return {
    caddyPath: path.join(directory, "Caddyfile"),
    configPath: path.join(directory, "selfchecks.config.json"),
  };
}

function createSetupRequest(fields: Record<string, string>) {
  const formData = new FormData();

  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value);
  }

  return new Request("http://localhost/api/setup", {
    body: formData,
    method: "POST",
  });
}

describe("setup route", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("writes runtime config and Caddyfile for first launch", async () => {
    const { caddyPath, configPath } = createRuntimePaths();
    vi.stubEnv("SELFCHECKS_CONFIG_PATH", configPath);
    vi.stubEnv("SELFCHECKS_CADDY_CONFIG_PATH", caddyPath);
    vi.stubEnv("SELFCHECKS_SETUP_TOKEN", "setup-token");
    vi.stubEnv("SELFCHECKS_SKIP_CADDY_RELOAD", "1");

    const response = await POST(
      createSetupRequest({
        caddyEmail: "ops@example.com",
        domain: "checks.example.com",
        login: "admin",
        password: "secret123",
        passwordConfirm: "secret123",
        setupToken: "setup-token",
      }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://checks.example.com/login?setup=complete",
    );

    const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
      admin: { login: string; passwordHash: string };
      preferences: { timeZone: string };
      server: { domain: string; publicUrl: string };
    };
    expect(config.admin.login).toBe("admin");
    expect(config.admin.passwordHash).not.toBe("secret123");
    expect(config.preferences.timeZone).toBe("Europe/Moscow");
    expect(config.server).toMatchObject({
      domain: "checks.example.com",
      publicUrl: "https://checks.example.com",
    });
    expect(fs.readFileSync(caddyPath, "utf8")).toContain("checks.example.com {");
  });

  it("rejects invalid setup token", async () => {
    const { caddyPath, configPath } = createRuntimePaths();
    vi.stubEnv("SELFCHECKS_CONFIG_PATH", configPath);
    vi.stubEnv("SELFCHECKS_CADDY_CONFIG_PATH", caddyPath);
    vi.stubEnv("SELFCHECKS_SETUP_TOKEN", "setup-token");

    const response = await POST(
      createSetupRequest({
        caddyEmail: "ops@example.com",
        domain: "checks.example.com",
        login: "admin",
        password: "secret123",
        passwordConfirm: "secret123",
        setupToken: "wrong-token",
      }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain(
      "/setup?error=Invalid+setup+token",
    );
    expect(fs.existsSync(configPath)).toBe(false);
  });
  it("does not replace an environment administrator", async () => {
    const { configPath } = createRuntimePaths();
    vi.stubEnv("SELFCHECKS_CONFIG_PATH", configPath);
    vi.stubEnv("SELFCHECKS_ADMIN_LOGIN", "existing");
    vi.stubEnv("SELFCHECKS_ADMIN_PASSWORD", "existing-secret");
    const response = await POST(createSetupRequest({}));
    expect(response.headers.get("location")).toBe("http://localhost/login");
    expect(fs.existsSync(configPath)).toBe(false);
  });
  it("fails closed without a setup token", async () => {
    const { configPath } = createRuntimePaths();
    vi.stubEnv("SELFCHECKS_CONFIG_PATH", configPath);
    vi.stubEnv("SELFCHECKS_SETUP_TOKEN", "");
    const response = await POST(createSetupRequest({}));
    expect(response.headers.get("location")).toContain("Setup+token+is+not+configured");
    expect(fs.existsSync(configPath)).toBe(false);
  });
  it("does not overwrite configuration while another setup owns the lock", async () => {
    const { configPath } = createRuntimePaths();
    vi.stubEnv("SELFCHECKS_CONFIG_PATH", configPath);
    vi.stubEnv("SELFCHECKS_SETUP_TOKEN", "setup-token");
    fs.writeFileSync(`${configPath}.setup.lock`, "other setup");
    const response = await POST(
      createSetupRequest({
        setupToken: "setup-token",
        login: "admin",
        password: "secret123",
        passwordConfirm: "secret123",
        domain: "checks.example.com",
        caddyEmail: "ops@example.com",
      }),
    );
    expect(response.status).toBe(303);
    expect(fs.existsSync(configPath)).toBe(false);
    expect(fs.readFileSync(`${configPath}.setup.lock`, "utf8")).toBe("other setup");
  });
});
