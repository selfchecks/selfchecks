import { describe, expect, it, vi } from "vitest";

import { getPrismaClient, type PrismaClientCache } from "./client.js";

type FakeClient = {
  id: number;
};

describe("getPrismaClient", () => {
  it("creates and caches a client outside production", () => {
    const cache: PrismaClientCache<FakeClient> = {};
    const createClient = vi.fn(() => ({ id: 1 }));

    const firstClient = getPrismaClient({
      cache,
      createClient,
      nodeEnv: "development",
    });
    const secondClient = getPrismaClient({
      cache,
      createClient,
      nodeEnv: "development",
    });

    expect(firstClient).toBe(secondClient);
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(cache.selfchecksPrisma).toBe(firstClient);
  });

  it("does not cache a newly created client in production", () => {
    const cache: PrismaClientCache<FakeClient> = {};
    const createClient = vi
      .fn<() => FakeClient>()
      .mockReturnValueOnce({ id: 1 })
      .mockReturnValueOnce({ id: 2 });

    const firstClient = getPrismaClient({
      cache,
      createClient,
      nodeEnv: "production",
    });
    const secondClient = getPrismaClient({
      cache,
      createClient,
      nodeEnv: "production",
    });

    expect(firstClient).toEqual({ id: 1 });
    expect(secondClient).toEqual({ id: 2 });
    expect(cache.selfchecksPrisma).toBeUndefined();
  });

  it("reuses an existing cached client in production", () => {
    const cache: PrismaClientCache<FakeClient> = {
      selfchecksPrisma: { id: 1 },
    };
    const createClient = vi.fn(() => ({ id: 2 }));

    expect(
      getPrismaClient({
        cache,
        createClient,
        nodeEnv: "production",
      }),
    ).toEqual({ id: 1 });
    expect(createClient).not.toHaveBeenCalled();
  });
});
