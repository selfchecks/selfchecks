import crypto from "node:crypto";

export type SecretStoreEnv = {
  [key: string]: string | undefined;
  NEXTAUTH_SECRET?: string;
  NODE_ENV?: string;
  SELFCHECKS_SECRET_KEY?: string;
};

const CIPHER_PREFIX = "v1";
const CIPHER_ALGORITHM = "aes-256-gcm";

function getSecretSeed(env: SecretStoreEnv = process.env) {
  const seed = env.SELFCHECKS_SECRET_KEY || env.NEXTAUTH_SECRET;

  if (!seed && env.NODE_ENV === "production") {
    throw new Error("NEXTAUTH_SECRET or SELFCHECKS_SECRET_KEY is required.");
  }

  return seed || "selfchecks-development-secret";
}

function getSecretKey(env: SecretStoreEnv = process.env) {
  return crypto.createHash("sha256").update(getSecretSeed(env)).digest();
}

export function encryptSecretValue(value: string, env: SecretStoreEnv = process.env) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(CIPHER_ALGORITHM, getSecretKey(env), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    CIPHER_PREFIX,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function decryptSecretValue(
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
