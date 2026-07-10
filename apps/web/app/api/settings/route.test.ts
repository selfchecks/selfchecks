import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createApiKey: vi.fn(),
  revokeApiKey: vi.fn(),
  updateAiSettings: vi.fn(),
  updateBasicSettings: vi.fn(),
  updatePerformanceSettings: vi.fn(),
  updateRuntimeEnvironmentSettings: vi.fn(),
}));

vi.mock("@/lib/api-keys", () => ({
  createApiKey: mocks.createApiKey,
  revokeApiKey: mocks.revokeApiKey,
}));

vi.mock("@/lib/runtime-config", () => ({
  getRuntimeTimeZone: () => "Europe/Moscow",
}));

vi.mock("@/lib/settings-data", () => ({
  updateAiSettings: mocks.updateAiSettings,
  updateBasicSettings: mocks.updateBasicSettings,
  updatePerformanceSettings: mocks.updatePerformanceSettings,
  updateRuntimeEnvironmentSettings: mocks.updateRuntimeEnvironmentSettings,
}));

import { POST as postAiSettings } from "./ai/route";
import { DELETE as deleteApiKey } from "./api-keys/[keyId]/route";
import { POST as postApiKey } from "./api-keys/route";
import { POST as postBasicSettings } from "./basic/route";
import { POST as postPerformanceSettings } from "./performance/route";
import { POST as postRuntimeSettings } from "./runtime/route";

function createJsonRequest(body: unknown) {
  return new Request("http://localhost/api/settings", {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });
}

describe("settings routes", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("saves basic settings with no-store response headers", async () => {
    const settings = {
      domain: "checks.example.com",
      login: "admin",
    };
    const input = {
      domain: "checks.example.com",
      login: "admin",
    };
    mocks.updateBasicSettings.mockResolvedValue(settings);

    const response = await postBasicSettings(createJsonRequest(input));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      settings,
    });
    expect(mocks.updateBasicSettings).toHaveBeenCalledWith(input);
  });

  it("returns validation errors from basic settings saves", async () => {
    mocks.updateBasicSettings.mockRejectedValue(new Error("Login is required."));

    const response = await postBasicSettings(createJsonRequest({}));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Login is required.",
    });
  });

  it("saves AI settings", async () => {
    const settings = {
      hasApiKey: true,
      model: "openai/gpt-5-mini",
    };
    const input = {
      apiKey: "sk-test",
      model: "openai/gpt-5-mini",
    };
    mocks.updateAiSettings.mockResolvedValue(settings);

    const response = await postAiSettings(createJsonRequest(input));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      settings,
    });
    expect(mocks.updateAiSettings).toHaveBeenCalledWith(input);
  });

  it("generates an API key with a no-store response", async () => {
    const created = {
      apiKey: "sck_generated",
      key: {
        id: "key_1",
        name: "GitLab CI",
        preview: "sck_gener...ated",
      },
    };
    mocks.createApiKey.mockResolvedValue(created);

    const response = await postApiKey(createJsonRequest({ name: "GitLab CI" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual(created);
    expect(mocks.createApiKey).toHaveBeenCalledWith(
      { name: "GitLab CI" },
      "Europe/Moscow",
    );
  });

  it("revokes an API key", async () => {
    mocks.revokeApiKey.mockResolvedValue(undefined);

    const response = await deleteApiKey(createJsonRequest({}), {
      params: Promise.resolve({ keyId: "key_1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      id: "key_1",
      revoked: true,
    });
    expect(mocks.revokeApiKey).toHaveBeenCalledWith("key_1");
  });

  it("falls back to a generic AI settings error for non-Error rejections", async () => {
    mocks.updateAiSettings.mockRejectedValue("boom");

    const response = await postAiSettings(createJsonRequest({}));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Unable to save AI settings.",
    });
  });

  it("saves runtime environment settings", async () => {
    const environment = {
      name: "default",
      secrets: [],
      variables: [
        {
          name: "BASE_URL",
          value: "https://example.test",
        },
      ],
    };
    const input = {
      environmentName: "default",
      variables: environment.variables,
    };
    mocks.updateRuntimeEnvironmentSettings.mockResolvedValue(environment);

    const response = await postRuntimeSettings(createJsonRequest(input));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      environment,
    });
    expect(mocks.updateRuntimeEnvironmentSettings).toHaveBeenCalledWith(input);
  });

  it("saves performance settings", async () => {
    const settings = {
      artifactRetentionDays: 14,
      historyRetentionDays: 180,
      queuedRunTimeoutMinutes: 30,
      runningRunTimeoutMinutes: 120,
      testSessionTimeoutMinutes: 30,
      workerConcurrency: 4,
    };
    const input = {
      artifactRetentionDays: 14,
      historyRetentionDays: 180,
      queuedRunTimeoutMinutes: 30,
      runningRunTimeoutMinutes: 120,
      testSessionTimeoutMinutes: 30,
      workerConcurrency: 4,
    };
    mocks.updatePerformanceSettings.mockResolvedValue(settings);

    const response = await postPerformanceSettings(createJsonRequest(input));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      settings,
    });
    expect(mocks.updatePerformanceSettings).toHaveBeenCalledWith(input);
  });

  it("returns validation errors from runtime environment saves", async () => {
    mocks.updateRuntimeEnvironmentSettings.mockRejectedValue(
      new Error("Variable name must be a valid environment variable name."),
    );

    const response = await postRuntimeSettings(createJsonRequest({}));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Variable name must be a valid environment variable name.",
    });
  });
});
