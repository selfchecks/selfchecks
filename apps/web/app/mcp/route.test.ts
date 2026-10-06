// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  listChecks: vi.fn(),
  enqueue: vi.fn(),
  findCheck: vi.fn(),
}));
vi.mock("@/lib/mcp-auth", () => ({ authenticateMcp: mocks.authenticate }));
vi.mock("@/lib/mcp-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mcp-data")>()),
  listChecks: mocks.listChecks,
  findCheck: mocks.findCheck,
}));
vi.mock("@/lib/run-check", () => ({ enqueueCheckRun: mocks.enqueue }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { POST, GET } from "./route";

async function connect() {
  const client = new Client({ name: "test", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(
    new URL("https://checks.test/mcp"),
    {
      requestInit: { headers: { authorization: "Bearer test" } },
      fetch: async (input, init) => POST(new Request(input, init)),
    },
  );
  await client.connect(transport);
  return client;
}

describe("Selfchecks MCP HTTP endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticate.mockResolvedValue({ scopes: ["read"], projectSlugs: ["shop"] });
    mocks.listChecks.mockResolvedValue({ checks: [], nextOffset: null });
  });
  afterEach(() => vi.unstubAllEnvs());
  it("supports SDK initialization, discovery and validated calls across stateless requests", async () => {
    const client = await connect();
    try {
      const listed = await client.listTools();
      expect(listed.tools.map((tool) => tool.name)).toContain("compare_runs");
      expect(listed.tools.map((tool) => tool.name)).not.toContain("trigger_check");
      const response = await client.callTool({
        name: "list_checks",
        arguments: { project: "shop", limit: 5 },
      });
      expect(response.isError).not.toBe(true);
      expect(mocks.listChecks).toHaveBeenCalledWith(
        { scopes: ["read"], projectSlugs: ["shop"] },
        { project: "shop", limit: 5, offset: 0 },
      );
      const invalid = await client.callTool({
        name: "list_checks",
        arguments: { limit: 101 },
      });
      expect(invalid.isError).toBe(true);
      expect(mocks.listChecks).toHaveBeenCalledOnce();
      const forbidden = await client.callTool({
        name: "trigger_check",
        arguments: { checkId: "check" },
      });
      expect(forbidden.isError).toBe(true);
      expect(mocks.enqueue).not.toHaveBeenCalled();
    } finally {
      await client.close();
    }
  });
  it("queues runs only when run permission is present", async () => {
    mocks.authenticate.mockResolvedValue({ scopes: ["read", "run"], projectSlugs: [] });
    mocks.findCheck.mockResolvedValue({ id: "check" });
    mocks.enqueue.mockResolvedValue(
      Response.json({ runId: "run", status: "queued" }, { status: 202 }),
    );
    const client = await connect();
    try {
      const response = await client.callTool({
        name: "trigger_check",
        arguments: { checkId: "check" },
      });
      expect(response.structuredContent).toEqual({
        data: { runId: "run", status: "queued" },
      });
      expect(mocks.enqueue).toHaveBeenCalledOnce();
    } finally {
      await client.close();
    }
  });
  it("rejects unauthorized requests, foreign origins and oversized bodies", async () => {
    mocks.authenticate.mockResolvedValue(null);
    expect(
      (await POST(new Request("https://checks.test/mcp", { method: "POST" }))).status,
    ).toBe(401);
    expect(
      (
        await POST(
          new Request("https://checks.test/mcp", {
            method: "POST",
            headers: { origin: "https://evil.test" },
          }),
        )
      ).status,
    ).toBe(403);
    mocks.authenticate.mockResolvedValue({ scopes: ["read"], projectSlugs: [] });
    expect(
      (
        await POST(
          new Request("https://checks.test/mcp", {
            method: "POST",
            body: "x".repeat(64_001),
          }),
        )
      ).status,
    ).toBe(413);
    expect((await GET(new Request("https://checks.test/mcp"))).status).toBe(405);
  });
});
