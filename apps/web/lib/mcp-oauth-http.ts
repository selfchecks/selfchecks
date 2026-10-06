import { cookies } from "next/headers";
import { OAuthError, oauthIssuer, oauthResource } from "./mcp-oauth";

export const oauthHeaders = {
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
};
export function oauthErrorResponse(error: unknown) {
  if (!(error instanceof OAuthError)) {
    console.error(
      "OAuth request failed",
      error instanceof Error ? error.name : "Unknown error",
    );
    return Response.json(
      { error: "server_error" },
      { status: 500, headers: oauthHeaders },
    );
  }
  return Response.json(
    { error: error.code, error_description: error.message },
    {
      status: error.status,
      headers: {
        ...oauthHeaders,
        ...(error.status === 401
          ? { "WWW-Authenticate": 'Basic realm="selfchecks-oauth"' }
          : {}),
        ...(error.status === 429 ? { "Retry-After": "3600" } : {}),
      },
    },
  );
}
export async function boundedOAuthBody(request: Request, contentType: string) {
  if (request.headers.get("content-type")?.split(";")[0]?.trim() !== contentType)
    throw new OAuthError("invalid_request", `Expected ${contentType}.`, 415);
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 16384) {
          await reader.cancel();
          throw new OAuthError("invalid_request", "Request exceeds 16 KB.", 413);
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  return Buffer.concat(chunks).toString("utf8");
}
export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      ...oauthHeaders,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
export function protectedResourceMetadata() {
  return {
    resource: oauthResource(),
    authorization_servers: [oauthIssuer()],
    scopes_supported: ["read", "run"],
    bearer_methods_supported: ["header"],
    resource_name: "Selfchecks MCP",
  };
}
export function authorizationServerMetadata() {
  const issuer = oauthIssuer();
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    registration_endpoint: `${issuer}/oauth/register`,
    revocation_endpoint: `${issuer}/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    scopes_supported: ["read", "run"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: [
      "none",
      "client_secret_post",
      "client_secret_basic",
    ],
    revocation_endpoint_auth_methods_supported: [
      "none",
      "client_secret_post",
      "client_secret_basic",
    ],
    authorization_response_iss_parameter_supported: true,
  };
}
export async function oauthSessionCookie() {
  const jar = await cookies();
  return jar
    .getAll()
    .filter(({ name }) =>
      /^(?:__Secure-)?next-auth\.session-token(?:\.\d+)?$/.test(name),
    )
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ name, value }) => `${name}=${value}`)
    .join(";");
}
export function mcpUnauthorized() {
  return Response.json(
    { error: "OAuth or an API key with MCP read permission is required." },
    {
      status: 401,
      headers: {
        "Cache-Control": "no-store",
        "WWW-Authenticate": `Bearer realm="selfchecks-mcp", resource_metadata="${oauthIssuer()}/.well-known/oauth-protected-resource/mcp", scope="read"`,
      },
    },
  );
}
