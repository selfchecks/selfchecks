import {
  generateConfiguredCaddyfile,
  reloadCaddy,
  validateDomain,
  validateEmail,
  writeCaddyfile,
} from "./caddy";
import { prisma } from "./prisma";
import {
  hashAdminPassword,
  readRuntimeConfig,
  type SelfchecksRuntimeConfig,
  writeRuntimeConfig,
} from "./runtime-config";
import { decryptSecretValue, encryptSecretValue } from "./secret-store";

export { getRunEnvironment } from "@selfchecks/cli/environment";

export const AI_CUSTOM_ENDPOINT_VALUE = "__custom__";

export type AiEndpointOption = {
  label: string;
  value: string;
};

export const AI_ENDPOINT_OPTIONS: AiEndpointOption[] = [
  {
    label: "OpenAI",
    value: "https://api.openai.com/v1",
  },
  {
    label: "Claude",
    value: "https://api.anthropic.com/v1",
  },
  {
    label: "OpenRouter",
    value: "https://openrouter.ai/api/v1",
  },
  {
    label: "Gemini",
    value: "https://generativelanguage.googleapis.com/v1beta/openai",
  },
  {
    label: "Together AI",
    value: "https://api.together.xyz/v1",
  },
  {
    label: "Groq",
    value: "https://api.groq.com/openai/v1",
  },
  {
    label: "DeepInfra",
    value: "https://api.deepinfra.com/v1/openai",
  },
  {
    label: "xAI",
    value: "https://api.x.ai/v1",
  },
  {
    label: "Qwen (DashScope Intl)",
    value: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  },
  {
    label: "Qwen (DashScope CN)",
    value: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  },
  {
    label: "Qwen (DashScope US)",
    value: "https://dashscope-us.aliyuncs.com/compatible-mode/v1",
  },
  {
    label: "Perplexity",
    value: "https://api.perplexity.ai",
  },
  {
    label: "Fireworks",
    value: "https://api.fireworks.ai/inference/v1",
  },
  {
    label: "SambaNova",
    value: "https://api.sambanova.ai/v1",
  },
  {
    label: "Hyperbolic",
    value: "https://api.hyperbolic.xyz/v1",
  },
  {
    label: "Kimi",
    value: "https://api.moonshot.ai/v1",
  },
  {
    label: "ProxyAPI",
    value: "https://openai.api.proxyapi.ru/v1",
  },
  {
    label: "Custom",
    value: AI_CUSTOM_ENDPOINT_VALUE,
  },
];

const DEFAULT_AI_ENDPOINT = "https://api.openai.com/v1";
const DEFAULT_AI_MODEL = "gpt-5-mini";
const DEFAULT_AI_RESPONSE_LANGUAGE = "Russian";

export type BasicSettingsData = {
  domain: string;
  login: string;
  notificationEmail: string;
  publicUrl: string;
};

export type AiSettingsData = {
  apiEndpoint: string;
  apiEndpointOption: string;
  apiKeyMasked?: string;
  customEndpoint: string;
  endpointOptions: AiEndpointOption[];
  hasApiKey: boolean;
  model: string;
  responseLanguage: string;
};

export type RuntimeVariableData = {
  name: string;
  value: string;
};

export type RuntimeSecretData = {
  currentName?: string;
  hasValue: boolean;
  name: string;
  updatedAt: string;
  value?: string;
};

export type RuntimeEnvironmentSettingsData = {
  name: string;
  secrets: RuntimeSecretData[];
  variables: RuntimeVariableData[];
};

export type DashboardSettingsData = {
  ai: AiSettingsData;
  basic: BasicSettingsData;
  environment: RuntimeEnvironmentSettingsData;
  projectSlug: string;
};

export type BasicSettingsInput = {
  domain?: unknown;
  login?: unknown;
  notificationEmail?: unknown;
  password?: unknown;
  passwordConfirm?: unknown;
};

export type AiSettingsInput = {
  apiEndpointOption?: unknown;
  apiKey?: unknown;
  customEndpoint?: unknown;
  model?: unknown;
  projectSlug?: unknown;
  responseLanguage?: unknown;
};

export type RuntimeSettingsInput = {
  environmentName?: unknown;
  projectSlug?: unknown;
  secrets?: unknown;
  variables?: unknown;
};

type RuntimeSecretInput = {
  currentName?: string;
  name: string;
  value?: string;
};

const DEFAULT_ENVIRONMENT_NAME = "default";
const BINDING_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export async function getDashboardSettingsData(
  projectSlug = "default",
): Promise<DashboardSettingsData> {
  const runtimeConfig = readRuntimeConfig();

  try {
    const project = await findSettingsProject(projectSlug);

    return {
      ai: project ? await readAiSettings(project.id) : createDefaultAiSettings(),
      basic: mapBasicSettings(runtimeConfig),
      environment: project
        ? await readRuntimeEnvironmentSettings(project.id)
        : createEmptyRuntimeEnvironmentSettings(),
      projectSlug: project?.slug ?? projectSlug,
    };
  } catch (error) {
    console.warn("Unable to load settings data.", error);

    return {
      ai: createDefaultAiSettings(),
      basic: mapBasicSettings(runtimeConfig),
      environment: createEmptyRuntimeEnvironmentSettings(),
      projectSlug,
    };
  }
}

export async function updateBasicSettings(input: BasicSettingsInput) {
  const currentConfig = readRuntimeConfig();
  const login = readRequiredString(input.login, "Login");
  const password = readOptionalString(input.password);
  const passwordConfirm = readOptionalString(input.passwordConfirm);
  const domain = validateDomain(readRequiredString(input.domain, "Domain"));
  const notificationEmail = validateEmail(
    readRequiredString(input.notificationEmail, "Notification email"),
  );

  if (login.length < 3) {
    throw new Error("Login must be at least 3 characters.");
  }

  if (!currentConfig.admin && !password) {
    throw new Error("Password is required.");
  }

  if (password && password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  if (password && password !== passwordConfirm) {
    throw new Error("Password confirmation does not match.");
  }

  const now = new Date().toISOString();
  const caddyfile = generateConfiguredCaddyfile({
    caddyEmail: notificationEmail,
    domain,
  });
  const runtimeConfig: SelfchecksRuntimeConfig = {
    admin: {
      ...(currentConfig.admin ?? {
        configuredAt: now,
        ...hashAdminPassword(password ?? ""),
      }),
      login,
      ...(password ? hashAdminPassword(password) : {}),
    },
    server: {
      caddyEmail: notificationEmail,
      domain,
      publicUrl: `https://${domain}`,
    },
    setup: {
      completedAt: currentConfig.setup.completedAt ?? now,
    },
  };

  writeCaddyfile(caddyfile);
  await reloadCaddy(caddyfile);
  writeRuntimeConfig(runtimeConfig);

  return mapBasicSettings(runtimeConfig);
}

export async function updateAiSettings(input: AiSettingsInput) {
  const projectSlug = readOptionalString(input.projectSlug) || "default";
  const project = await prisma.project.upsert({
    create: {
      name: projectSlug,
      slug: projectSlug,
    },
    update: {
      name: projectSlug,
    },
    where: {
      slug: projectSlug,
    },
  });
  const apiEndpoint = resolveAiEndpoint(
    readRequiredString(input.apiEndpointOption, "AI API endpoint"),
    readOptionalString(input.customEndpoint),
  );
  const model = readRequiredString(input.model, "AI model");
  const responseLanguage = readRequiredString(
    input.responseLanguage,
    "AI response language",
  );
  const apiKey = readOptionalString(input.apiKey);
  const currentSettings = await prisma.aiSettings.findUnique({
    select: {
      apiKeyCiphertext: true,
    },
    where: {
      projectId: project.id,
    },
  });

  if (!apiKey && !currentSettings?.apiKeyCiphertext) {
    throw new Error("AI API key is required.");
  }

  await prisma.aiSettings.upsert({
    create: {
      apiEndpoint,
      apiKeyCiphertext: apiKey ? encryptSecretValue(apiKey) : undefined,
      model,
      projectId: project.id,
      responseLanguage,
    },
    update: {
      apiEndpoint,
      apiKeyCiphertext: apiKey
        ? encryptSecretValue(apiKey)
        : currentSettings?.apiKeyCiphertext,
      model,
      responseLanguage,
    },
    where: {
      projectId: project.id,
    },
  });

  return readAiSettings(project.id);
}

export async function updateRuntimeEnvironmentSettings(input: RuntimeSettingsInput) {
  const projectSlug = readOptionalString(input.projectSlug) || "default";
  const environmentName =
    readOptionalString(input.environmentName) || DEFAULT_ENVIRONMENT_NAME;
  const variables = normalizeVariables(input.variables);
  const secretInputs = normalizeSecrets(input.secrets);
  const duplicateBinding = variables.find((variable) =>
    secretInputs.some((secret) => secret.name === variable.name),
  );

  if (duplicateBinding) {
    throw new Error(`${duplicateBinding.name} cannot be both a variable and a secret.`);
  }

  const project = await prisma.project.upsert({
    create: {
      name: projectSlug,
      slug: projectSlug,
    },
    update: {
      name: projectSlug,
    },
    where: {
      slug: projectSlug,
    },
  });
  const existingSecrets = await prisma.secret.findMany({
    where: {
      projectId: project.id,
    },
  });
  const nextSecrets = normalizeSecretValues(secretInputs, existingSecrets);
  const nextSecretNames = nextSecrets.map((secret) => secret.name);

  await prisma.$transaction([
    prisma.runtimeEnvironment.upsert({
      create: {
        name: environmentName,
        projectId: project.id,
        variables: Object.fromEntries(
          variables.map((variable) => [variable.name, variable.value]),
        ),
      },
      update: {
        variables: Object.fromEntries(
          variables.map((variable) => [variable.name, variable.value]),
        ),
      },
      where: {
        projectId_name: {
          name: environmentName,
          projectId: project.id,
        },
      },
    }),
    prisma.secret.deleteMany({
      where: {
        name:
          nextSecretNames.length > 0
            ? {
                notIn: nextSecretNames,
              }
            : undefined,
        projectId: project.id,
      },
    }),
    ...nextSecrets.map((secret) =>
      prisma.secret.upsert({
        create: {
          name: secret.name,
          projectId: project.id,
          valueCiphertext: secret.valueCiphertext,
        },
        update: {
          valueCiphertext: secret.valueCiphertext,
        },
        where: {
          projectId_name: {
            name: secret.name,
            projectId: project.id,
          },
        },
      }),
    ),
  ]);

  return readRuntimeEnvironmentSettings(project.id, environmentName);
}

function mapBasicSettings(config: SelfchecksRuntimeConfig): BasicSettingsData {
  return {
    domain: config.server.domain,
    login: config.admin?.login ?? process.env.SELFCHECKS_ADMIN_LOGIN ?? "",
    notificationEmail: config.server.caddyEmail,
    publicUrl: config.server.publicUrl,
  };
}

async function findSettingsProject(projectSlug: string) {
  return (
    (await prisma.project.findUnique({
      select: {
        id: true,
        slug: true,
      },
      where: {
        slug: projectSlug,
      },
    })) ??
    (await prisma.project.findFirst({
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        slug: true,
      },
    }))
  );
}

async function readAiSettings(projectId: string): Promise<AiSettingsData> {
  const settings = await prisma.aiSettings.findUnique({
    where: {
      projectId,
    },
  });

  if (!settings) {
    return createDefaultAiSettings();
  }

  const endpointOption = getAiEndpointOption(settings.apiEndpoint);

  return {
    apiEndpoint: settings.apiEndpoint,
    apiEndpointOption: endpointOption,
    apiKeyMasked: maskSecret(settings.apiKeyCiphertext),
    customEndpoint:
      endpointOption === AI_CUSTOM_ENDPOINT_VALUE ? settings.apiEndpoint : "",
    endpointOptions: AI_ENDPOINT_OPTIONS,
    hasApiKey: Boolean(settings.apiKeyCiphertext),
    model: settings.model,
    responseLanguage: settings.responseLanguage,
  };
}

function createDefaultAiSettings(): AiSettingsData {
  return {
    apiEndpoint: DEFAULT_AI_ENDPOINT,
    apiEndpointOption: DEFAULT_AI_ENDPOINT,
    customEndpoint: "",
    endpointOptions: AI_ENDPOINT_OPTIONS,
    hasApiKey: false,
    model: DEFAULT_AI_MODEL,
    responseLanguage: DEFAULT_AI_RESPONSE_LANGUAGE,
  };
}

function getAiEndpointOption(apiEndpoint: string) {
  return AI_ENDPOINT_OPTIONS.some((option) => option.value === apiEndpoint)
    ? apiEndpoint
    : AI_CUSTOM_ENDPOINT_VALUE;
}

function resolveAiEndpoint(apiEndpointOption: string, customEndpoint: string) {
  const selectedOption = AI_ENDPOINT_OPTIONS.find(
    (option) => option.value === apiEndpointOption,
  );
  const endpoint =
    selectedOption?.value === AI_CUSTOM_ENDPOINT_VALUE
      ? customEndpoint
      : selectedOption?.value;

  if (!endpoint) {
    throw new Error("AI API endpoint is required.");
  }

  try {
    const url = new URL(endpoint);

    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error("AI API endpoint must be an HTTP URL.");
    }

    return url.toString().replace(/\/$/, "");
  } catch {
    throw new Error("AI API endpoint must be a valid URL.");
  }
}

function maskSecret(valueCiphertext: string | null) {
  if (!valueCiphertext) {
    return undefined;
  }

  try {
    const value = decryptSecretValue(valueCiphertext);
    const suffix = value.slice(-4);
    const prefixLength = Math.max(8, Math.min(12, value.length - suffix.length));

    return `${"*".repeat(prefixLength)}${suffix}`;
  } catch {
    return "********";
  }
}

async function readRuntimeEnvironmentSettings(
  projectId: string,
  environmentName = DEFAULT_ENVIRONMENT_NAME,
): Promise<RuntimeEnvironmentSettingsData> {
  const [runtimeEnvironment, secrets] = await Promise.all([
    prisma.runtimeEnvironment.findUnique({
      where: {
        projectId_name: {
          name: environmentName,
          projectId,
        },
      },
    }),
    prisma.secret.findMany({
      orderBy: {
        name: "asc",
      },
      select: {
        name: true,
        updatedAt: true,
      },
      where: {
        projectId,
      },
    }),
  ]);

  return {
    name: environmentName,
    secrets: secrets.map((secret) => ({
      currentName: secret.name,
      hasValue: true,
      name: secret.name,
      updatedAt: secret.updatedAt.toISOString(),
      value: "",
    })),
    variables: parseVariables(runtimeEnvironment?.variables),
  };
}

function createEmptyRuntimeEnvironmentSettings(): RuntimeEnvironmentSettingsData {
  return {
    name: DEFAULT_ENVIRONMENT_NAME,
    secrets: [],
    variables: [],
  };
}

function parseVariables(value: unknown): RuntimeVariableData[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  return Object.entries(value)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .map(([name, variableValue]) => ({
      name,
      value: variableValue,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function normalizeVariables(value: unknown): RuntimeVariableData[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return deduplicateBindings(
    value
      .map((item) => {
        if (!item || typeof item !== "object") {
          return null;
        }

        const record = item as Record<string, unknown>;
        const name = readOptionalString(record.name);
        const variableValue = readOptionalString(record.value);

        if (!name && !variableValue) {
          return null;
        }

        return {
          name: validateBindingName(name, "Variable name"),
          value: variableValue,
        };
      })
      .filter((item): item is RuntimeVariableData => Boolean(item)),
  );
}

function normalizeSecrets(value: unknown): RuntimeSecretInput[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const items: RuntimeSecretInput[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const record = item as Record<string, unknown>;
    const name = readOptionalString(record.name);
    const secretValue = readOptionalString(record.value);
    const currentName = readOptionalString(record.currentName);

    if (!name && !secretValue && !currentName) {
      continue;
    }

    items.push({
      currentName: currentName
        ? validateBindingName(currentName, "Current secret name")
        : undefined,
      name: validateBindingName(name, "Secret name"),
      value: secretValue || undefined,
    });
  }

  return deduplicateBindings(items);
}

function normalizeSecretValues(
  secretInputs: RuntimeSecretInput[],
  existingSecrets: Array<{ name: string; valueCiphertext: string }>,
) {
  const existingByName = new Map(
    existingSecrets.map((secret) => [secret.name, secret.valueCiphertext]),
  );

  return secretInputs.map((secret) => {
    const existingValue =
      existingByName.get(secret.name) ??
      (secret.currentName ? existingByName.get(secret.currentName) : undefined);
    const valueCiphertext = secret.value
      ? encryptSecretValue(secret.value)
      : existingValue;

    if (!valueCiphertext) {
      throw new Error(`Secret value is required for ${secret.name}.`);
    }

    return {
      name: secret.name,
      valueCiphertext,
    };
  });
}

function deduplicateBindings<T extends { name: string }>(items: T[]) {
  const seen = new Set<string>();

  for (const item of items) {
    if (seen.has(item.name)) {
      throw new Error(`${item.name} is duplicated.`);
    }

    seen.add(item.name);
  }

  return items.sort((left, right) => left.name.localeCompare(right.name));
}

function validateBindingName(value: string, label: string) {
  if (!value) {
    throw new Error(`${label} is required.`);
  }

  if (!BINDING_NAME_PATTERN.test(value)) {
    throw new Error(`${label} must be a valid environment variable name.`);
  }

  return value;
}

function readRequiredString(value: unknown, label: string) {
  const stringValue = readOptionalString(value);

  if (!stringValue) {
    throw new Error(`${label} is required.`);
  }

  return stringValue;
}

function readOptionalString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
