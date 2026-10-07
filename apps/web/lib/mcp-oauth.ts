import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { OAuthClientMetadataSchema } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { OAuthClient, Prisma } from "@prisma/client";
import { prisma } from "./prisma";

const ACCESS_SECONDS = 900;
const GRANT_SECONDS = 30 * 24 * 3600;
const SCOPES = ["read", "run", "deploy"];
export class OAuthError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
const fail = (code: string, message: string, status = 400): never => {
  throw new OAuthError(code, message, status);
};
export const hashOAuthToken = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const opaque = (prefix: string) => prefix + randomBytes(32).toString("base64url");
const equal = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function oauthIssuer() {
  const url = new URL(process.env.NEXTAUTH_URL || "http://localhost:3000");
  if (
    url.protocol !== "https:" &&
    !(url.protocol === "http:" && isLoopback(url.hostname))
  )
    throw new Error(
      "OAuth requires an HTTPS NEXTAUTH_URL (or loopback for development).",
    );
  if (!process.env.NEXTAUTH_URL && process.env.NODE_ENV === "production")
    throw new Error("NEXTAUTH_URL is required for OAuth.");
  return url.origin;
}
export const oauthResource = () => `${oauthIssuer()}/mcp`;
const isLoopback = (host: string) => ["localhost", "127.0.0.1", "[::1]"].includes(host);
export function safeRedirect(value: string) {
  try {
    const url = new URL(value);
    return (
      !url.hash &&
      !url.username &&
      !url.password &&
      value.length <= 2048 &&
      (url.protocol === "https:" ||
        (url.protocol === "http:" && isLoopback(url.hostname)))
    );
  } catch {
    return false;
  }
}
export function redirectMatches(registered: string, requested: string) {
  if (registered === requested) return true;
  if (!safeRedirect(requested)) return false;
  const a = new URL(registered),
    b = new URL(requested);
  // Native loopback clients choose a free local port for each connection (RFC 8252).
  return (
    isLoopback(a.hostname) &&
    a.hostname === b.hostname &&
    a.protocol === b.protocol &&
    a.pathname === b.pathname &&
    a.search === b.search
  );
}
export function parameter(params: URLSearchParams, name: string, required = false) {
  const values = params.getAll(name);
  if (values.length > 1 || (required && !values[0]) || (values[0]?.length ?? 0) > 4096)
    return fail("invalid_request", `Invalid ${name}.`);
  return values[0];
}
function parseScopes(value: string | undefined, fallback = ["read"]) {
  const scopes =
    value === undefined ? fallback : [...new Set(value.split(/\s+/).filter(Boolean))];
  if (!scopes.includes("read") || scopes.some((scope) => !SCOPES.includes(scope)))
    return fail(
      "invalid_scope",
      "Read permission is required; supported scopes are read, run and deploy.",
    );
  return scopes;
}
function validateResource(value: string | undefined) {
  if (value !== undefined && value !== oauthResource())
    fail("invalid_target", "Unknown resource.");
  return oauthResource();
}

export async function registerOAuthClient(input: unknown) {
  const parsed = OAuthClientMetadataSchema.safeParse(input);
  if (!parsed.success)
    return fail("invalid_client_metadata", "Invalid client metadata.");
  const data = parsed.data;
  const method = data.token_endpoint_auth_method ?? "client_secret_post";
  if (
    !["none", "client_secret_post", "client_secret_basic"].includes(method) ||
    !data.redirect_uris.length ||
    data.redirect_uris.length > 10 ||
    !data.redirect_uris.every(safeRedirect) ||
    data.grant_types?.some(
      (type) => !["authorization_code", "refresh_token"].includes(type),
    ) ||
    data.response_types?.some((type) => type !== "code") ||
    (data.client_name?.length ?? 0) > 200
  )
    return fail(
      "invalid_client_metadata",
      "Unsupported authentication, grant or redirect URI.",
    );
  parseScopes(data.scope);
  // Bound anonymous persistent registrations. Database-backed across replicas.
  if (
    (await prisma.oAuthClient.count({
      where: { createdAt: { gt: new Date(Date.now() - 3600_000) } },
    })) >= 100
  )
    return fail(
      "temporarily_unavailable",
      "Client registration limit reached; try later.",
      429,
    );
  const secret = method === "none" ? undefined : opaque("sco_secret_");
  const client = await prisma.oAuthClient.create({
    data: {
      name: data.client_name || "MCP client",
      redirectUris: data.redirect_uris,
      authMethod: method,
      secretHash: secret ? hashOAuthToken(secret) : null,
    },
  });
  return {
    client_id: client.id,
    client_name: client.name,
    redirect_uris: client.redirectUris,
    token_endpoint_auth_method: method,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    scope: "read run deploy",
    client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
    ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
  };
}

export async function beginOAuthAuthorization(params: URLSearchParams) {
  if (parameter(params, "response_type", true) !== "code")
    fail("unsupported_response_type", "Only authorization code is supported.");
  const clientId = parameter(params, "client_id", true)!;
  const redirectUri = parameter(params, "redirect_uri", true)!;
  const client = await prisma.oAuthClient.findUnique({ where: { id: clientId } });
  if (!client || client.revokedAt) return fail("invalid_client", "Unknown client.");
  if (!client.redirectUris.some((uri) => redirectMatches(uri, redirectUri)))
    return fail("invalid_request", "Unregistered redirect URI.");
  const challenge = parameter(params, "code_challenge", true)!;
  if (
    parameter(params, "code_challenge_method", true) !== "S256" ||
    !/^[\w-]{43}$/.test(challenge)
  )
    return fail("invalid_request", "PKCE S256 is required.");
  if (
    (await prisma.oAuthAuthorization.count({
      where: { createdAt: { gt: new Date(Date.now() - 3600_000) } },
    })) >= 1000
  )
    return fail(
      "temporarily_unavailable",
      "Authorization limit reached; try later.",
      429,
    );
  return prisma.oAuthAuthorization.create({
    data: {
      clientId,
      redirectUri,
      codeChallenge: challenge,
      requestedScopes: parseScopes(parameter(params, "scope")),
      resource: validateResource(parameter(params, "resource")),
      state: parameter(params, "state"),
      expiresAt: new Date(Date.now() + 600_000),
    },
  });
}

export async function pendingAuthorization(id: string) {
  const pending = await prisma.oAuthAuthorization.findUnique({
    where: { id },
    include: { client: true },
  });
  if (
    !pending ||
    pending.approvedAt ||
    pending.deniedAt ||
    pending.client.revokedAt ||
    pending.expiresAt.getTime() <= Date.now()
  )
    return fail("invalid_request", "Authorization request expired or already used.");
  return pending;
}
export function consentCsrf(id: string, sessionCookie: string) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret || !sessionCookie)
    throw new Error("OAuth consent requires a session and NEXTAUTH_SECRET.");
  return createHmac("sha256", secret)
    .update(JSON.stringify([id, sessionCookie]))
    .digest("hex");
}
export function validateConsentCsrf(id: string, sessionCookie: string, token: string) {
  if (!/^[a-f0-9]{64}$/.test(token) || !equal(consentCsrf(id, sessionCookie), token))
    fail("invalid_request", "Invalid consent token.", 403);
}
export async function approveOAuthAuthorization(
  id: string,
  projects: string[],
  allowRun: boolean,
  denied = false,
  allowDeploy = false,
) {
  const pending = await pendingAuthorization(id);
  const projectSlugs = [...new Set(projects)];
  const scopes =
    allowRun && pending.requestedScopes.includes("run") ? ["read", "run"] : ["read"];
  if (allowDeploy && pending.requestedScopes.includes("deploy")) scopes.push("deploy");
  if (!denied) {
    if (
      !projectSlugs.length ||
      projectSlugs.length > 200 ||
      projectSlugs.some((value) => value.length > 200)
    )
      fail("invalid_request", "Select at least one project.");
    if (projectSlugs.includes("*")) {
      if (projectSlugs.length !== 1)
        fail(
          "invalid_request",
          "All projects cannot be combined with individual projects.",
        );
    } else if (
      (await prisma.project.count({ where: { slug: { in: projectSlugs } } })) !==
      projectSlugs.length
    )
      fail("invalid_request", "Unknown project.");
  }
  const code = opaque("sco_code_");
  const result = await prisma.oAuthAuthorization.updateMany({
    where: {
      id,
      approvedAt: null,
      deniedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: denied
      ? { deniedAt: new Date() }
      : {
          approvedAt: new Date(),
          codeHash: hashOAuthToken(code),
          scopes,
          projectSlugs: projectSlugs.includes("*") ? [] : projectSlugs,
          expiresAt: new Date(Date.now() + 300_000),
        },
  });
  if (result.count !== 1)
    return fail("invalid_request", "Authorization request already used.");
  const redirect = new URL(pending.redirectUri);
  redirect.searchParams.set(denied ? "error" : "code", denied ? "access_denied" : code);
  if (pending.state !== null) redirect.searchParams.set("state", pending.state);
  redirect.searchParams.set("iss", oauthIssuer());
  return redirect.toString();
}

async function authenticateOAuthClient(
  params: URLSearchParams,
  authorization: string | null,
) {
  let id = parameter(params, "client_id"),
    secret = parameter(params, "client_secret");
  let method = secret === undefined ? "none" : "client_secret_post";
  if (authorization) {
    if (!authorization.startsWith("Basic ") || secret !== undefined)
      return fail("invalid_client", "Invalid client authentication.", 401);
    try {
      const decoded = Buffer.from(authorization.slice(6), "base64").toString();
      const colon = decoded.indexOf(":");
      if (colon < 0) throw new Error();
      const basicId = decodeURIComponent(decoded.slice(0, colon).replace(/\+/g, " "));
      secret = decodeURIComponent(decoded.slice(colon + 1).replace(/\+/g, " "));
      if (id && id !== basicId) throw new Error();
      id = basicId;
      method = "client_secret_basic";
    } catch {
      return fail("invalid_client", "Invalid client authentication.", 401);
    }
  }
  const client = id ? await prisma.oAuthClient.findUnique({ where: { id } }) : null;
  if (
    !client ||
    client.revokedAt ||
    client.authMethod !== method ||
    (method !== "none" &&
      (!secret ||
        !client.secretHash ||
        !equal(hashOAuthToken(secret), client.secretHash)))
  )
    return fail("invalid_client", "Invalid client authentication.", 401);
  return client;
}

async function issueTokens(
  tx: Prisma.TransactionClient,
  grantId: string,
  scopes: string[],
  grantExpires: Date,
) {
  const access = opaque("sco_access_"),
    refresh = opaque("sco_refresh_");
  const seconds = Math.min(
    ACCESS_SECONDS,
    Math.floor((grantExpires.getTime() - Date.now()) / 1000),
  );
  await tx.oAuthToken.createMany({
    data: [
      {
        tokenHash: hashOAuthToken(access),
        grantId,
        kind: "access",
        scopes,
        expiresAt: new Date(Date.now() + seconds * 1000),
      },
      {
        tokenHash: hashOAuthToken(refresh),
        grantId,
        kind: "refresh",
        scopes,
        expiresAt: grantExpires,
      },
    ],
  });
  return {
    access_token: access,
    token_type: "Bearer",
    expires_in: seconds,
    refresh_token: refresh,
    scope: scopes.join(" "),
  };
}
function activeClientGrant(
  client: OAuthClient,
  grant: {
    clientId: string;
    revokedAt: Date | null;
    expiresAt: Date;
    resource: string;
  },
) {
  return (
    grant.clientId === client.id &&
    !grant.revokedAt &&
    grant.expiresAt.getTime() > Date.now() &&
    grant.resource === oauthResource()
  );
}
export async function exchangeOAuthToken(
  params: URLSearchParams,
  authorization: string | null,
) {
  const client = await authenticateOAuthClient(params, authorization);
  const type = parameter(params, "grant_type", true);
  validateResource(parameter(params, "resource"));
  if (type === "authorization_code") {
    const code = parameter(params, "code", true)!;
    const verifier = parameter(params, "code_verifier", true)!;
    const redirectUri = parameter(params, "redirect_uri", true)!;
    const authorizationCode = await prisma.oAuthAuthorization.findUnique({
      where: { codeHash: hashOAuthToken(code) },
    });
    if (
      !authorizationCode ||
      !authorizationCode.approvedAt ||
      authorizationCode.deniedAt ||
      authorizationCode.codeConsumedAt ||
      authorizationCode.expiresAt.getTime() <= Date.now() ||
      authorizationCode.clientId !== client.id ||
      authorizationCode.redirectUri !== redirectUri ||
      authorizationCode.resource !== oauthResource() ||
      !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) ||
      !equal(
        createHash("sha256").update(verifier).digest("base64url"),
        authorizationCode.codeChallenge,
      )
    )
      return fail(
        "invalid_grant",
        "Invalid or expired authorization code or PKCE verifier.",
      );
    return prisma.$transaction(async (tx) => {
      const claimed = await tx.oAuthAuthorization.updateMany({
        where: {
          id: authorizationCode.id,
          codeConsumedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { codeConsumedAt: new Date() },
      });
      if (claimed.count !== 1)
        return fail("invalid_grant", "Authorization code already used.");
      const grant = await tx.oAuthGrant.create({
        data: {
          clientId: client.id,
          scopes: authorizationCode.scopes,
          projectSlugs: authorizationCode.projectSlugs,
          resource: authorizationCode.resource,
          expiresAt: new Date(Date.now() + GRANT_SECONDS * 1000),
        },
      });
      return issueTokens(tx, grant.id, grant.scopes, grant.expiresAt);
    });
  }
  if (type === "refresh_token") {
    const tokenHash = hashOAuthToken(parameter(params, "refresh_token", true)!);
    const token = await prisma.oAuthToken.findUnique({
      where: { tokenHash },
      include: { grant: true },
    });
    if (
      !token ||
      token.kind !== "refresh" ||
      token.expiresAt.getTime() <= Date.now() ||
      !activeClientGrant(client, token.grant)
    )
      return fail("invalid_grant", "Invalid or expired refresh token.");
    const scopes = parseScopes(parameter(params, "scope"), token.scopes);
    if (scopes.some((scope) => !token.scopes.includes(scope)))
      return fail("invalid_scope", "Scopes cannot be expanded.");
    const result = await prisma.$transaction(async (tx) => {
      const claimed = await tx.oAuthToken.updateMany({
        where: { tokenHash, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      if (claimed.count !== 1) {
        // Commit revocation before reporting replay; throwing in this transaction would undo it.
        await tx.oAuthGrant.update({
          where: { id: token.grantId },
          data: { revokedAt: new Date() },
        });
        return null;
      }
      return issueTokens(tx, token.grantId, scopes, token.grant.expiresAt);
    });
    if (!result)
      return fail("invalid_grant", "Refresh token reused; connection revoked.");
    return result;
  }
  return fail("unsupported_grant_type", "Unsupported grant type.");
}
export async function revokeOAuthToken(
  params: URLSearchParams,
  authorization: string | null,
) {
  const client = await authenticateOAuthClient(params, authorization);
  const token = await prisma.oAuthToken.findUnique({
    where: { tokenHash: hashOAuthToken(parameter(params, "token", true)!) },
    include: { grant: true },
  });
  if (token?.grant.clientId === client.id)
    await prisma.oAuthGrant.update({
      where: { id: token.grantId },
      data: { revokedAt: new Date() },
    });
}
export async function authenticateOAuthAccess(token: string) {
  const record = await prisma.oAuthToken.findUnique({
    where: { tokenHash: hashOAuthToken(token) },
    include: { grant: { include: { client: true } } },
  });
  if (
    !record ||
    record.kind !== "access" ||
    record.expiresAt.getTime() <= Date.now() ||
    record.grant.client.revokedAt ||
    !activeClientGrant(record.grant.client, record.grant) ||
    !record.scopes.includes("read")
  )
    return null;
  return { scopes: record.scopes, projectSlugs: record.grant.projectSlugs };
}
