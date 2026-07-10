import crypto from "node:crypto";

import { prisma } from "./prisma";

export type ApiKeyData = {
  createdAt: string;
  createdAtLabel: string;
  id: string;
  lastUsedAt?: string;
  lastUsedAtLabel?: string;
  name: string;
  preview: string;
};

export type CreatedApiKeyData = {
  apiKey: string;
  key: ApiKeyData;
};

const API_KEY_PREFIX = "sck_";
const API_KEY_RANDOM_BYTES = 32;
const LAST_USED_WRITE_INTERVAL_MS = 5 * 60_000;

export async function createApiKey(
  input: { name?: unknown },
  timeZone: string,
): Promise<CreatedApiKeyData> {
  const name = readApiKeyName(input.name);
  const apiKey = `${API_KEY_PREFIX}${crypto.randomBytes(API_KEY_RANDOM_BYTES).toString("base64url")}`;
  const key = await prisma.apiKey.create({
    data: {
      lastFour: apiKey.slice(-4),
      name,
      prefix: apiKey.slice(0, 12),
      tokenHash: hashApiKey(apiKey),
    },
  });

  return {
    apiKey,
    key: mapApiKey(key, timeZone),
  };
}

export async function listApiKeys(timeZone: string): Promise<ApiKeyData[]> {
  const keys = await prisma.apiKey.findMany({
    orderBy: {
      createdAt: "desc",
    },
    where: {
      revokedAt: null,
    },
  });

  return keys.map((key) => mapApiKey(key, timeZone));
}

export async function revokeApiKey(id: string): Promise<void> {
  const result = await prisma.apiKey.updateMany({
    data: {
      revokedAt: new Date(),
    },
    where: {
      id,
      revokedAt: null,
    },
  });

  if (result.count === 0) {
    throw new Error("API key was not found.");
  }
}

export async function verifyApiKey(apiKey: string, now = new Date()): Promise<boolean> {
  const key = await prisma.apiKey.findUnique({
    select: {
      id: true,
      lastUsedAt: true,
      revokedAt: true,
    },
    where: {
      tokenHash: hashApiKey(apiKey),
    },
  });

  if (!key || key.revokedAt) {
    return false;
  }

  if (
    !key.lastUsedAt ||
    now.getTime() - key.lastUsedAt.getTime() >= LAST_USED_WRITE_INTERVAL_MS
  ) {
    await prisma.apiKey.update({
      data: {
        lastUsedAt: now,
      },
      where: {
        id: key.id,
      },
    });
  }

  return true;
}

export function hashApiKey(apiKey: string): string {
  return crypto.createHash("sha256").update(apiKey).digest("hex");
}

function readApiKeyName(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("API key name is required.");
  }

  const name = value.trim();

  if (name.length > 80) {
    throw new Error("API key name must be 80 characters or fewer.");
  }

  return name;
}

function mapApiKey(
  key: {
    createdAt: Date;
    id: string;
    lastFour: string;
    lastUsedAt: Date | null;
    name: string;
    prefix: string;
  },
  timeZone: string,
): ApiKeyData {
  return {
    createdAt: key.createdAt.toISOString(),
    createdAtLabel: formatTimestamp(key.createdAt, timeZone),
    id: key.id,
    lastUsedAt: key.lastUsedAt?.toISOString(),
    lastUsedAtLabel: key.lastUsedAt
      ? formatTimestamp(key.lastUsedAt, timeZone)
      : undefined,
    name: key.name,
    preview: `${key.prefix}...${key.lastFour}`,
  };
}

function formatTimestamp(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "short",
    timeZone,
    year: "numeric",
  }).format(value);
}
