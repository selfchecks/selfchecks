import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  apiKeyCreate: vi.fn(),
  apiKeyFindMany: vi.fn(),
  apiKeyFindUnique: vi.fn(),
  apiKeyUpdate: vi.fn(),
  apiKeyUpdateMany: vi.fn(),
}));

vi.mock("./prisma", () => ({
  prisma: {
    apiKey: {
      create: mocks.apiKeyCreate,
      findMany: mocks.apiKeyFindMany,
      findUnique: mocks.apiKeyFindUnique,
      update: mocks.apiKeyUpdate,
      updateMany: mocks.apiKeyUpdateMany,
    },
  },
}));

import {
  createApiKey,
  hashApiKey,
  listApiKeys,
  revokeApiKey,
  verifyApiKey,
} from "./api-keys";

describe("API keys", () => {
  beforeEach(() => {
    mocks.apiKeyCreate.mockImplementation(async (args) => ({
      ...args.data,
      createdAt: new Date("2026-07-10T08:00:00.000Z"),
      id: "key_1",
      lastUsedAt: null,
    }));
    mocks.apiKeyFindMany.mockResolvedValue([]);
    mocks.apiKeyUpdateMany.mockResolvedValue({ count: 1 });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns a generated secret once and stores only its hash and preview", async () => {
    const created = await createApiKey({ name: " GitLab CI " }, "Europe/Moscow");

    expect(created.apiKey).toMatch(/^sck_[A-Za-z0-9_-]{43}$/);
    expect(created.key).toMatchObject({
      id: "key_1",
      name: "GitLab CI",
    });
    expect(mocks.apiKeyCreate).toHaveBeenCalledWith({
      data: {
        lastFour: created.apiKey.slice(-4),
        name: "GitLab CI",
        prefix: created.apiKey.slice(0, 12),
        tokenHash: hashApiKey(created.apiKey),
      },
    });
    expect(JSON.stringify(mocks.apiKeyCreate.mock.calls[0]?.[0])).not.toContain(
      created.apiKey,
    );
  });

  it("lists only active key metadata", async () => {
    mocks.apiKeyFindMany.mockResolvedValue([
      {
        createdAt: new Date("2026-07-10T08:00:00.000Z"),
        id: "key_1",
        lastFour: "cdef",
        lastUsedAt: null,
        name: "GitLab CI",
        prefix: "sck_example1",
      },
    ]);

    await expect(listApiKeys("Europe/Moscow")).resolves.toEqual([
      expect.objectContaining({
        id: "key_1",
        name: "GitLab CI",
        preview: "sck_example1...cdef",
      }),
    ]);
    expect(mocks.apiKeyFindMany).toHaveBeenCalledWith({
      orderBy: { createdAt: "desc" },
      where: { revokedAt: null },
    });
  });

  it("authenticates active keys and throttles last-used writes", async () => {
    const now = new Date("2026-07-10T10:00:00.000Z");
    mocks.apiKeyFindUnique.mockResolvedValue({
      id: "key_1",
      lastUsedAt: new Date("2026-07-10T09:59:00.000Z"),
      revokedAt: null,
    });

    await expect(verifyApiKey("sck_secret", now)).resolves.toBe(true);
    expect(mocks.apiKeyFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tokenHash: hashApiKey("sck_secret") },
      }),
    );
    expect(mocks.apiKeyUpdate).not.toHaveBeenCalled();
  });

  it("rejects revoked keys and revokes active keys", async () => {
    mocks.apiKeyFindUnique.mockResolvedValue({
      id: "key_1",
      lastUsedAt: null,
      revokedAt: new Date(),
    });

    await expect(verifyApiKey("sck_revoked")).resolves.toBe(false);
    await expect(revokeApiKey("key_1")).resolves.toBeUndefined();
    expect(mocks.apiKeyUpdateMany).toHaveBeenCalledWith({
      data: {
        revokedAt: expect.any(Date),
      },
      where: {
        id: "key_1",
        revokedAt: null,
      },
    });
  });
});
