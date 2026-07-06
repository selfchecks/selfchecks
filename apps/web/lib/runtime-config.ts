import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export type RuntimeAdminConfig = {
  configuredAt: string;
  login: string;
  passwordHash: string;
  passwordIterations: number;
  passwordSalt: string;
};

export type SelfchecksRuntimeConfig = {
  admin: RuntimeAdminConfig | null;
  preferences: {
    timeZone: string;
  };
  server: {
    caddyEmail: string;
    domain: string;
    publicUrl: string;
  };
  setup: {
    completedAt: string | null;
  };
};

export type RuntimeConfigEnv = {
  [key: string]: string | undefined;
  SELFCHECKS_CONFIG_PATH?: string;
  SELFCHECKS_SETUP_TOKEN?: string;
};

export const DEFAULT_TIME_ZONE = "Europe/Moscow";

export const DEFAULT_RUNTIME_CONFIG: SelfchecksRuntimeConfig = {
  admin: null,
  preferences: {
    timeZone: DEFAULT_TIME_ZONE,
  },
  server: {
    caddyEmail: "",
    domain: "",
    publicUrl: "",
  },
  setup: {
    completedAt: null,
  },
};

const PASSWORD_KEY_LENGTH = 64;
const PASSWORD_DIGEST = "sha512";
const DEFAULT_PASSWORD_ITERATIONS = 210_000;

export function getRuntimeConfigPath(env: RuntimeConfigEnv = process.env) {
  return env.SELFCHECKS_CONFIG_PATH;
}

export function isSetupModeEnabled(env: RuntimeConfigEnv = process.env) {
  return Boolean(env.SELFCHECKS_CONFIG_PATH || env.SELFCHECKS_SETUP_TOKEN);
}

export function readRuntimeConfig(
  env: RuntimeConfigEnv = process.env,
): SelfchecksRuntimeConfig {
  const configPath = getRuntimeConfigPath(env);

  if (!configPath || !fs.existsSync(configPath)) {
    return DEFAULT_RUNTIME_CONFIG;
  }

  const parsed = JSON.parse(
    fs.readFileSync(configPath, "utf8"),
  ) as Partial<SelfchecksRuntimeConfig>;

  return {
    admin: parsed.admin ?? null,
    preferences: {
      timeZone: normalizeTimeZone(parsed.preferences?.timeZone),
    },
    server: {
      caddyEmail: parsed.server?.caddyEmail ?? "",
      domain: parsed.server?.domain ?? "",
      publicUrl: parsed.server?.publicUrl ?? "",
    },
    setup: {
      completedAt: parsed.setup?.completedAt ?? null,
    },
  };
}

export function getRuntimeTimeZone(env: RuntimeConfigEnv = process.env) {
  return readRuntimeConfig(env).preferences.timeZone;
}

export function normalizeTimeZone(value: unknown) {
  if (typeof value !== "string" || !isValidTimeZone(value)) {
    return DEFAULT_TIME_ZONE;
  }

  return value;
}

export function isValidTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format(new Date());

    return true;
  } catch {
    return false;
  }
}

export function writeRuntimeConfig(
  config: SelfchecksRuntimeConfig,
  env: RuntimeConfigEnv = process.env,
) {
  const configPath = getRuntimeConfigPath(env);

  if (!configPath) {
    throw new Error("SELFCHECKS_CONFIG_PATH is required to write runtime config.");
  }

  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

export function isRuntimeAdminConfigured(env: RuntimeConfigEnv = process.env) {
  return Boolean(readRuntimeConfig(env).admin);
}

export function isSetupRequired(env: RuntimeConfigEnv = process.env) {
  return isSetupModeEnabled(env) && !isRuntimeAdminConfigured(env);
}

export function hashAdminPassword(
  password: string,
  options: { iterations?: number; salt?: string } = {},
) {
  const iterations = options.iterations ?? DEFAULT_PASSWORD_ITERATIONS;
  const salt = options.salt ?? crypto.randomBytes(32).toString("hex");
  const passwordHash = crypto
    .pbkdf2Sync(password, salt, iterations, PASSWORD_KEY_LENGTH, PASSWORD_DIGEST)
    .toString("hex");

  return {
    passwordHash,
    passwordIterations: iterations,
    passwordSalt: salt,
  };
}

export function verifyAdminPassword(password: string, admin: RuntimeAdminConfig) {
  const candidate = crypto.pbkdf2Sync(
    password,
    admin.passwordSalt,
    admin.passwordIterations,
    PASSWORD_KEY_LENGTH,
    PASSWORD_DIGEST,
  );
  const expected = Buffer.from(admin.passwordHash, "hex");

  return (
    expected.length === candidate.length && crypto.timingSafeEqual(candidate, expected)
  );
}
