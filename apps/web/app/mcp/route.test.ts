// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  listChecks: vi.fn(),
  enqueue: vi.fn(),
  findCheck: vi.fn(),
  runFindFirst: vi.fn(),
  runFindMany: vi.fn(),
}));
vi.mock("@/lib/mcp-auth", () => ({ authenticateMcp: mocks.authenticate }));
vi.mock("@/lib/mcp-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mcp-data")>()),
  listChecks: mocks.listChecks,
  findCheck: mocks.findCheck,
}));
vi.mock("@/lib/run-check", () => ({ enqueueCheckRun: mocks.enqueue }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    check: { findFirst: mocks.findCheck },
    checkRun: { findFirst: mocks.runFindFirst, findMany: mocks.runFindMany },
  },
}));
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
      expect(listed.tools.map((tool) => tool.name)).toEqual(
        expect.arrayContaining([
          "list_test_sessions",
          "get_test_session",
          "get_test_session_runs",
          "compare_runs",
          "get_saved_ai_analysis",
          "get_failure_context",
          "find_similar_failures",
          "get_check_timeline",
          "compare_periods",
          "get_execution_status",
          "get_release_readiness",
          "get_deployments",
        ]),
      );
      expect(listed.tools).toHaveLength(22);
      expect(listed.tools.map((tool) => tool.name)).not.toContain("record_deployment");
      expect(listed.tools.map((tool) => tool.name)).not.toContain(
        "trigger_check_group",
      );
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
  it("pages compact history when one stored result exceeds the MCP response budget", async () => {
    const storedResult = {
      body: JSON.stringify(Array.from({ length: 101 }, () => "x".repeat(1500))),
    };
    expect(Buffer.byteLength(JSON.stringify(storedResult))).toBeGreaterThan(128_000);
    const rows = [
      { id: "newer", status: "FAILED", testSessionId: "session", result: storedResult },
      { id: "older", status: "PASSED", result: storedResult },
    ];
    mocks.findCheck.mockResolvedValue({ id: "track", key: "track-list" });
    mocks.runFindMany.mockImplementation(async ({ select, skip, take }) =>
      rows
        .slice(skip, skip + take)
        .map(({ result, ...metadata }) =>
          select.result ? { ...metadata, result } : metadata,
        ),
    );
    const client = await connect();
    try {
      const args = { checkId: "track-list", project: "shop", limit: 1 };
      const call = (options: Record<string, unknown>) =>
        client.callTool({ name: "get_check_runs", arguments: { ...args, ...options } });
      expect((await call({})).structuredContent).toMatchObject({
        data: { truncated: true },
      });
      const first = (await call({ includeResult: false })).structuredContent;
      expect(first).toMatchObject({
        data: {
          runs: [{ id: "newer", status: "FAILED", testSessionId: "session" }],
          nextOffset: 1,
        },
      });
      expect(JSON.stringify(first)).not.toContain('"result"');
      expect(mocks.runFindMany.mock.lastCall?.[0].select).not.toHaveProperty("result");
      expect(
        (await call({ includeResult: false, offset: 1 })).structuredContent,
      ).toMatchObject({
        data: { runs: [{ id: "older", status: "PASSED" }], nextOffset: null },
      });
    } finally {
      await client.close();
    }
  });

  it("reads large API bodies in redacted pages without re-returning the result", async () => {
    const values = Array(105).fill("abc".repeat(500));
    const body = JSON.stringify({ password: "example-secret", values });
    mocks.runFindFirst.mockResolvedValue({
      id: "run",
      checkSnapshotType: "API",
      result: { body, assertions: Array(20).fill({ actual: body }) },
    });
    const client = await connect();
    try {
      const call = async (bodyOffset: number, bodyLimit: number) => {
        const response = await client.callTool({
          name: "get_run_response",
          arguments: { runId: "run", bodyOffset, bodyLimit },
        });
        return (
          response.structuredContent as {
            data: {
              body: string;
              nextBodyOffset: number | null;
              totalBodyCharacters: number;
            };
          }
        ).data;
      };
      const expected = JSON.stringify({ password: "[REDACTED]", values });
      const first = await call(0, 22);
      expect(first).toMatchObject({
        body: expected.slice(0, 22),
        nextBodyOffset: 22,
        totalBodyCharacters: expected.length,
      });
      const second = await call(first.nextBodyOffset!, 8000);
      expect(first.body + second.body).toBe(expected.slice(0, 8022));
      expect(second.nextBodyOffset).toBe(8022);
      const tail = await call(150_000, 8000);
      expect(tail).toMatchObject({
        body: expected.slice(150_000),
        nextBodyOffset: null,
      });
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
  it("exposes all 25 tools only with both write permissions", async () => {
    mocks.authenticate.mockResolvedValue({
      scopes: ["read", "run", "deploy"],
      projectSlugs: ["shop"],
    });
    const client = await connect();
    try {
      expect((await client.listTools()).tools).toHaveLength(25);
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
