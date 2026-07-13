import crypto from "node:crypto";

import { prisma } from "@selfchecks/db";

export type EnvVar = {
  name: string;
  value: string;
};

export type SecretStoreEnv = {
  [key: string]: string | undefined;
  NEXTAUTH_SECRET?: string;
  NODE_ENV?: string;
  SELFCHECKS_SECRET_KEY?: string;
};

const DEFAULT_ENVIRONMENT_NAME = "default";
const GLOBAL_SETTINGS_PROJECT_SLUG = "default";
const CIPHER_PREFIX = "v1";
const CIPHER_ALGORITHM = "aes-256-gcm";

export async function getRunEnvironment(_projectSlug?: string): Promise<EnvVar[]> {
  const project = await prisma.project.findUnique({
    select: { id: true },
    where: { slug: GLOBAL_SETTINGS_PROJECT_SLUG },
  });

  if (!project) {
    return [];
  }

  const [runtimeEnvironment, secrets] = await Promise.all([
    prisma.runtimeEnvironment.findUnique({
      where: {
        projectId_name: {
          name: DEFAULT_ENVIRONMENT_NAME,
          projectId: project.id,
        },
      },
    }),
    prisma.secret.findMany({
      orderBy: {
        name: "asc",
      },
      where: {
        projectId: project.id,
      },
    }),
  ]);

  return [
    ...parseVariables(runtimeEnvironment?.variables),
    ...secrets.map((secret) => ({
      name: secret.name,
      value: decryptSecretValue(secret.valueCiphertext),
    })),
  ];
}

function parseVariables(value: unknown): EnvVar[] {
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

function decryptSecretValue(
  valueCiphertext: string,
  env: SecretStoreEnv = process.env,
) {
  if (!valueCiphertext.startsWith(`${CIPHER_PREFIX}:`)) {
    return valueCiphertext;
  }

  const [, ivValue, authTagValue, ciphertextValue] = valueCiphertext.split(":");

  if (!ivValue || !authTagValue || !ciphertextValue) {
    throw new Error("Stored secret value is malformed.");
  }

  const decipher = crypto.createDecipheriv(
    CIPHER_ALGORITHM,
    getSecretKey(env),
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(authTagValue, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function getSecretKey(env: SecretStoreEnv) {
  return crypto.createHash("sha256").update(getSecretSeed(env)).digest();
}

function getSecretSeed(env: SecretStoreEnv) {
  const seed = env.SELFCHECKS_SECRET_KEY || env.NEXTAUTH_SECRET;

  if (!seed && env.NODE_ENV === "production") {
    throw new Error("NEXTAUTH_SECRET or SELFCHECKS_SECRET_KEY is required.");
  }

  return seed || "selfchecks-development-secret";
}
