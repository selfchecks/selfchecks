import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  aiSettingsFindUnique: vi.fn(),
  aiSettingsUpsert: vi.fn(),
  performanceSettingsFindUnique: vi.fn(),
  performanceSettingsUpsert: vi.fn(),
  projectUpsert: vi.fn(),
  runtimeEnvironmentFindUnique: vi.fn(),
  runtimeEnvironmentUpsert: vi.fn(),
  secretDeleteMany: vi.fn(),
  secretFindMany: vi.fn(),
  secretUpsert: vi.fn(),
  transaction: vi.fn(),
  storedAiSettings: undefined as
    | {
        apiEndpoint: string;
        apiKeyCiphertext?: string | null;
        model: string;
        responseLanguage: string;
      }
    | undefined,
  storedPerformanceSettings: undefined as
    | {
        artifactRetentionDays: number;
        historyRetentionDays: number;
        queuedRunTimeoutMinutes: number;
        runningRunTimeoutMinutes: number;
        testSessionTimeoutMinutes: number;
        workerConcurrency: number;
      }
    | undefined,
  storedRuntimeVariables: {} as Record<string, string>,
  storedSecrets: [] as Array<{
    name: string;
    updatedAt: Date;
    valueCiphertext: string;
  }>,
}));

vi.mock("./prisma", () => ({
  prisma: {
    aiSettings: {
      findUnique: mocks.aiSettingsFindUnique,
      upsert: mocks.aiSettingsUpsert,
    },
    performanceSettings: {
      findUnique: mocks.performanceSettingsFindUnique,
      upsert: mocks.performanceSettingsUpsert,
    },
    project: {
      upsert: mocks.projectUpsert,
    },
    runtimeEnvironment: {
      findUnique: mocks.runtimeEnvironmentFindUnique,
      upsert: mocks.runtimeEnvironmentUpsert,
    },
    secret: {
      deleteMany: mocks.secretDeleteMany,
      findMany: mocks.secretFindMany,
      upsert: mocks.secretUpsert,
    },
    $transaction: mocks.transaction,
  },
}));

import { encryptSecretValue } from "./secret-store";
import {
  AI_CUSTOM_ENDPOINT_VALUE,
  updateAiSettings,
  updatePerformanceSettings,
  updateRuntimeEnvironmentSettings,
} from "./settings-data";

describe("settings data", () => {
  beforeEach(() => {
    vi.stubEnv("SELFCHECKS_SECRET_KEY", "settings-test-secret");
    mocks.storedAiSettings = undefined;
    mocks.storedPerformanceSettings = undefined;
    mocks.storedRuntimeVariables = {};
    mocks.storedSecrets = [];
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
    mocks.performanceSettingsFindUnique.mockImplementation(() =>
      Promise.resolve(mocks.storedPerformanceSettings ?? null),
    );
    mocks.performanceSettingsUpsert.mockImplementation((args) => {
      mocks.storedPerformanceSettings = {
        artifactRetentionDays: args.create.artifactRetentionDays,
        historyRetentionDays: args.create.historyRetentionDays,
        queuedRunTimeoutMinutes: args.create.queuedRunTimeoutMinutes,
        runningRunTimeoutMinutes: args.create.runningRunTimeoutMinutes,
        testSessionTimeoutMinutes: args.create.testSessionTimeoutMinutes,
        workerConcurrency: args.create.workerConcurrency,
        ...args.update,
      };

      return Promise.resolve(mocks.storedPerformanceSettings);
    });
    mocks.runtimeEnvironmentFindUnique.mockImplementation(() =>
      Promise.resolve({
        variables: mocks.storedRuntimeVariables,
      }),
    );
    mocks.runtimeEnvironmentUpsert.mockImplementation((args) => {
      mocks.storedRuntimeVariables = args.update.variables ?? args.create.variables;

      return Promise.resolve({
        name: args.create.name,
        variables: mocks.storedRuntimeVariables,
      });
    });
    mocks.secretFindMany.mockImplementation(() =>
      Promise.resolve([...mocks.storedSecrets]),
    );
    mocks.secretDeleteMany.mockImplementation((args) => {
      const keepNames = args.where.name?.notIn;

      mocks.storedSecrets = Array.isArray(keepNames)
        ? mocks.storedSecrets.filter((secret) => keepNames.includes(secret.name))
        : [];

      return Promise.resolve({
        count: 0,
      });
    });
    mocks.secretUpsert.mockImplementation((args) => {
      const name = args.where.projectId_name.name;
      const existingIndex = mocks.storedSecrets.findIndex(
        (secret) => secret.name === name,
      );
      const nextSecret = {
        name,
        updatedAt: new Date("2026-06-24T10:00:00.000Z"),
        valueCiphertext: args.update.valueCiphertext ?? args.create.valueCiphertext,
      };

      if (existingIndex === -1) {
        mocks.storedSecrets.push(nextSecret);
      } else {
        mocks.storedSecrets[existingIndex] = nextSecret;
      }

      return Promise.resolve(nextSecret);
    });
    mocks.transaction.mockImplementation((operations) => Promise.all(operations));
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

  it("saves performance settings", async () => {
    const settings = await updatePerformanceSettings({
      artifactRetentionDays: 21,
      historyRetentionDays: 240,
      projectSlug: "default",
      queuedRunTimeoutMinutes: 45,
      runningRunTimeoutMinutes: 150,
      testSessionTimeoutMinutes: 45,
      workerConcurrency: 8,
    });

    expect(mocks.performanceSettingsUpsert).toHaveBeenCalledWith({
      create: {
        artifactRetentionDays: 21,
        historyRetentionDays: 240,
        projectId: "project_1",
        queuedRunTimeoutMinutes: 45,
        runningRunTimeoutMinutes: 150,
        testSessionTimeoutMinutes: 45,
        workerConcurrency: 8,
      },
      update: {
        artifactRetentionDays: 21,
        historyRetentionDays: 240,
        queuedRunTimeoutMinutes: 45,
        runningRunTimeoutMinutes: 150,
        testSessionTimeoutMinutes: 45,
        workerConcurrency: 8,
      },
      where: {
        projectId: "project_1",
      },
    });
    expect(settings).toEqual({
      artifactRetentionDays: 21,
      historyRetentionDays: 240,
      queuedRunTimeoutMinutes: 45,
      runningRunTimeoutMinutes: 150,
      testSessionTimeoutMinutes: 45,
      workerConcurrency: 8,
    });
  });

  it("rejects performance settings outside supported limits", async () => {
    await expect(
      updatePerformanceSettings({
        artifactRetentionDays: 1,
        historyRetentionDays: 180,
        projectSlug: "default",
        queuedRunTimeoutMinutes: 30,
        runningRunTimeoutMinutes: 120,
        testSessionTimeoutMinutes: 30,
        workerConcurrency: 2,
      }),
    ).rejects.toThrow("Test artifact retention must be between 2 and 60.");

    await expect(
      updatePerformanceSettings({
        artifactRetentionDays: 14,
        historyRetentionDays: 180,
        projectSlug: "default",
        queuedRunTimeoutMinutes: 30,
        runningRunTimeoutMinutes: 120,
        testSessionTimeoutMinutes: 61,
        workerConcurrency: 2,
      }),
    ).rejects.toThrow("Maximum test session duration must be between 10 and 60.");

    await expect(
      updatePerformanceSettings({
        artifactRetentionDays: 14,
        historyRetentionDays: 180,
        projectSlug: "default",
        queuedRunTimeoutMinutes: 121,
        runningRunTimeoutMinutes: 120,
        testSessionTimeoutMinutes: 30,
        workerConcurrency: 2,
      }),
    ).rejects.toThrow("Queued run timeout must be between 10 and 120.");

    await expect(
      updatePerformanceSettings({
        artifactRetentionDays: 14,
        historyRetentionDays: 180,
        projectSlug: "default",
        queuedRunTimeoutMinutes: 30,
        runningRunTimeoutMinutes: 241,
        testSessionTimeoutMinutes: 30,
        workerConcurrency: 2,
      }),
    ).rejects.toThrow("Running run timeout must be between 10 and 240.");

    expect(mocks.performanceSettingsUpsert).not.toHaveBeenCalled();
  });

  it("returns masked runtime secret values after saving secrets", async () => {
    const settings = await updateRuntimeEnvironmentSettings({
      environmentName: "default",
      projectSlug: "default",
      secrets: [
        {
          name: "API_TOKEN",
          value: "super-secret-cdef",
        },
      ],
      variables: [],
    });

    const upsertArgs = mocks.secretUpsert.mock.calls[0]?.[0];

    expect(upsertArgs.create.valueCiphertext).toMatch(/^v1:/);
    expect(upsertArgs.create.valueCiphertext).not.toBe("super-secret-cdef");
    expect(settings.secrets).toEqual([
      {
        currentName: "API_TOKEN",
        hasValue: true,
        name: "API_TOKEN",
        updatedAt: "2026-06-24T10:00:00.000Z",
        value: "",
        valueMasked: "************cdef",
      },
    ]);
  });
});
