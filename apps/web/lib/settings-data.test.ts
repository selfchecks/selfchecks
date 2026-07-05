import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  aiSettingsFindUnique: vi.fn(),
  aiSettingsUpsert: vi.fn(),
  projectUpsert: vi.fn(),
  storedAiSettings: undefined as
    | {
        apiEndpoint: string;
        apiKeyCiphertext?: string | null;
        model: string;
        responseLanguage: string;
      }
    | undefined,
}));

vi.mock("./prisma", () => ({
  prisma: {
    aiSettings: {
      findUnique: mocks.aiSettingsFindUnique,
      upsert: mocks.aiSettingsUpsert,
    },
    project: {
      upsert: mocks.projectUpsert,
    },
  },
}));

import { encryptSecretValue } from "./secret-store";
import { AI_CUSTOM_ENDPOINT_VALUE, updateAiSettings } from "./settings-data";

describe("settings data", () => {
  beforeEach(() => {
    vi.stubEnv("SELFCHECKS_SECRET_KEY", "settings-test-secret");
    mocks.storedAiSettings = undefined;
    mocks.projectUpsert.mockResolvedValue({
      id: "project_1",
      slug: "default",
    });
    mocks.aiSettingsFindUnique.mockImplementation((args: { select?: unknown }) => {
      if (args.select) {
        return Promise.resolve(
          mocks.storedAiSettings
            ? {
                apiKeyCiphertext: mocks.storedAiSettings.apiKeyCiphertext,
              }
            : null,
        );
      }

      return Promise.resolve(mocks.storedAiSettings ?? null);
    });
    mocks.aiSettingsUpsert.mockImplementation((args) => {
      mocks.storedAiSettings = {
        apiEndpoint: args.create.apiEndpoint,
        apiKeyCiphertext: args.create.apiKeyCiphertext,
        model: args.create.model,
        responseLanguage: args.create.responseLanguage,
        ...args.update,
      };

      return Promise.resolve(mocks.storedAiSettings);
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("saves AI settings with encrypted API key and returns masked settings", async () => {
    const settings = await updateAiSettings({
      apiEndpointOption: "https://openrouter.ai/api/v1",
      apiKey: "sk-openrouter-f7dd",
      customEndpoint: "",
      model: "openai/gpt-5-mini",
      projectSlug: "default",
      responseLanguage: "Russian",
    });

    const upsertArgs = mocks.aiSettingsUpsert.mock.calls[0]?.[0];

    expect(upsertArgs).toMatchObject({
      create: {
        apiEndpoint: "https://openrouter.ai/api/v1",
        model: "openai/gpt-5-mini",
        projectId: "project_1",
        responseLanguage: "Russian",
      },
      where: {
        projectId: "project_1",
      },
    });
    expect(upsertArgs.create.apiKeyCiphertext).toMatch(/^v1:/);
    expect(upsertArgs.create.apiKeyCiphertext).not.toBe("sk-openrouter-f7dd");
    expect(settings).toMatchObject({
      apiEndpoint: "https://openrouter.ai/api/v1",
      apiEndpointOption: "https://openrouter.ai/api/v1",
      apiKeyMasked: "************f7dd",
      hasApiKey: true,
      model: "openai/gpt-5-mini",
      responseLanguage: "Russian",
    });
  });

  it("keeps the existing API key when updating non-secret AI settings", async () => {
    const existingCiphertext = encryptSecretValue("existing-key-1234");

    mocks.storedAiSettings = {
      apiEndpoint: "https://api.openai.com/v1",
      apiKeyCiphertext: existingCiphertext,
      model: "gpt-5-mini",
      responseLanguage: "Russian",
    };

    const settings = await updateAiSettings({
      apiEndpointOption: "https://api.groq.com/openai/v1",
      apiKey: "",
      customEndpoint: "",
      model: "llama-3.3-70b-versatile",
      projectSlug: "default",
      responseLanguage: "English",
    });

    const upsertArgs = mocks.aiSettingsUpsert.mock.calls[0]?.[0];

    expect(upsertArgs.update.apiKeyCiphertext).toBe(existingCiphertext);
    expect(settings).toMatchObject({
      apiEndpoint: "https://api.groq.com/openai/v1",
      apiEndpointOption: "https://api.groq.com/openai/v1",
      apiKeyMasked: "************1234",
      model: "llama-3.3-70b-versatile",
      responseLanguage: "English",
    });
  });

  it("requires an API key the first time AI settings are saved", async () => {
    await expect(
      updateAiSettings({
        apiEndpointOption: "https://api.openai.com/v1",
        apiKey: "",
        customEndpoint: "",
        model: "gpt-5-mini",
        projectSlug: "default",
        responseLanguage: "Russian",
      }),
    ).rejects.toThrow("AI API key is required.");

    expect(mocks.aiSettingsUpsert).not.toHaveBeenCalled();
  });

  it("validates custom endpoint URLs", async () => {
    await expect(
      updateAiSettings({
        apiEndpointOption: AI_CUSTOM_ENDPOINT_VALUE,
        apiKey: "sk-custom",
        customEndpoint: "not-a-url",
        model: "custom-model",
        projectSlug: "default",
        responseLanguage: "Russian",
      }),
    ).rejects.toThrow("AI API endpoint must be a valid URL.");

    expect(mocks.aiSettingsUpsert).not.toHaveBeenCalled();
  });
});
