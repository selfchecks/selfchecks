import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticateMcp } from "@/lib/mcp-auth";
import { createMcpServer } from "@/lib/mcp-server";
import { mcpUnauthorized } from "@/lib/mcp-oauth-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_REQUEST_BYTES = 64_000;

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const configuredUrl = process.env.NEXTAUTH_URL?.trim();
  const url = new URL(request.url);
  const ownOrigin = configuredUrl
    ? new URL(configuredUrl).origin
    : ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      ? url.origin
      : undefined;
  const allowed = [
    ownOrigin,
    ...(process.env.SELFCHECKS_MCP_ALLOWED_ORIGINS?.split(",")
      .map((value) => value.trim())
      .filter(Boolean) ?? []),
  ];
  if (origin && !allowed.includes(origin))
    return Response.json({ error: "Origin is not allowed." }, { status: 403 });
  const access = await authenticateMcp(request);
  if (!access) return mcpUnauthorized();
  // Read with a bound even when Content-Length is missing or incorrect.
  const reader = request.body?.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  if (reader) {
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > MAX_REQUEST_BYTES) {
          await reader.cancel();
          return Response.json(
            { error: "MCP request exceeds 64 KB." },
            { status: 413 },
          );
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  const server = createMcpServer(access);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  try {
    await server.connect(transport);
    const response = await transport.handleRequest(
      new Request(request.url, {
        method: "POST",
        headers: request.headers,
        body: Buffer.concat(chunks),
        signal: request.signal,
      }),
    );
    response.headers.set("Cache-Control", "no-store");
    return response;
  } finally {
    await server.close();
  }
}

// This server uses stateless JSON responses and has no persistent SSE stream or session to delete.
export async function GET(request: Request) {
  if (!(await authenticateMcp(request))) return mcpUnauthorized();
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
export function DELETE(request: Request) {
  return GET(request);
}
