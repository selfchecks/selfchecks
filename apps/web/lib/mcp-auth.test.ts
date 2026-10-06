import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), update: vi.fn() }));
vi.mock("./prisma", () => ({ prisma: { apiKey: mocks } }));
import { authenticateMcp } from "./mcp-auth";
const request = () =>
  new Request("https://checks.test/mcp", {
    headers: { authorization: "Bearer sck_example" },
  });
describe("MCP authentication", () => {
  beforeEach(() => vi.clearAllMocks());
  it("rejects missing, revoked and CLI-only keys", async () => {
    expect(await authenticateMcp(new Request("https://checks.test/mcp"))).toBeNull();
    for (const key of [
      null,
      { revokedAt: new Date(), mcpScopes: ["read"] },
      { revokedAt: null, mcpScopes: [] },
    ]) {
      mocks.findUnique.mockResolvedValue(key);
      expect(await authenticateMcp(request())).toBeNull();
    }
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("returns project restrictions and records use without exposing credentials", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "key",
      revokedAt: null,
      lastUsedAt: null,
      mcpScopes: ["read"],
      mcpProjectSlugs: ["shop"],
    });
    expect(await authenticateMcp(request())).toEqual({
      scopes: ["read"],
      projectSlugs: ["shop"],
    });
    expect(mocks.findUnique.mock.calls[0]?.[0].where.tokenHash).not.toContain(
      "sck_example",
    );
    expect(mocks.update).toHaveBeenCalledOnce();
  });
});
