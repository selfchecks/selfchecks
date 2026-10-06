// @vitest-environment node
import { createHash } from "node:crypto";
import {
  auth,
  type OAuthClientProvider,
} from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationMixed,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  const tables: Record<string, Row[]> = {};
  const matches = (row: Row, where: Row): boolean =>
    Object.entries(where).every(([key, value]) => {
      if (value && typeof value === "object" && !(value instanceof Date)) {
        const filter = value as { gt?: Date; in?: unknown[] };
        if (filter.gt) return (row[key] as Date) > filter.gt;
        if (filter.in) return filter.in.includes(row[key]);
      }
      return row[key] === value;
    });
  const decorate = (name: string, row: Row) => {
    if (name === "oAuthAuthorization" || name === "oAuthGrant")
      return {
        ...row,
        client: tables.oAuthClient!.find((client) => client.id === row.clientId),
      };
    if (name === "oAuthToken") {
      const grant = tables.oAuthGrant!.find((grant) => grant.id === row.grantId)!;
      return {
        ...row,
        grant: {
          ...grant,
          client: tables.oAuthClient!.find((client) => client.id === grant.clientId),
        },
      };
    }
    return { ...row };
  };
  const model = (name: string) => {
    tables[name] = [];
    const create = ({ data }: { data: Row }) => {
      const row = {
        id: `${name}-${tables[name]!.length}`,
        createdAt: new Date(),
        revokedAt: null,
        approvedAt: null,
        deniedAt: null,
        codeConsumedAt: null,
        consumedAt: null,
        state: null,
        ...data,
      };
      tables[name]!.push(row);
      return decorate(name, row);
    };
    return {
      create: vi.fn(create),
      createMany: vi.fn(({ data }: { data: Row[] }) => {
        data.forEach((row) => create({ data: row }));
        return { count: data.length };
      }),
      count: vi.fn(
        ({ where }: { where: Row }) =>
          tables[name]!.filter((row) => matches(row, where)).length,
      ),
      findUnique: vi.fn(({ where }: { where: Row }) => {
        const row = tables[name]!.find((row) => matches(row, where));
        return row ? decorate(name, row) : null;
      }),
      updateMany: vi.fn(({ where, data }: { where: Row; data: Row }) => {
        const rows = tables[name]!.filter((row) => matches(row, where));
        rows.forEach((row) => Object.assign(row, data));
        return { count: rows.length };
      }),
      update: vi.fn(({ where, data }: { where: Row; data: Row }) => {
        const row = tables[name]!.find((row) => matches(row, where))!;
        Object.assign(row, data);
        return decorate(name, row);
      }),
    };
  };
  const client = {
    oAuthClient: model("oAuthClient"),
    oAuthAuthorization: model("oAuthAuthorization"),
    oAuthGrant: model("oAuthGrant"),
    oAuthToken: model("oAuthToken"),
    project: model("project"),
  };
  return {
    tables,
    client,
    transaction: vi.fn(async (callback: (tx: typeof client) => unknown) =>
      callback(client),
    ),
  };
});
vi.mock("./prisma", () => ({ prisma: { ...db.client, $transaction: db.transaction } }));
import {
  approveOAuthAuthorization,
  authenticateOAuthAccess,
  beginOAuthAuthorization,
  consentCsrf,
  exchangeOAuthToken,
  hashOAuthToken,
  parameter,
  redirectMatches,
  registerOAuthClient,
  revokeOAuthToken,
  safeRedirect,
  validateConsentCsrf,
} from "./mcp-oauth";
import {
  authorizationServerMetadata,
  protectedResourceMetadata,
  boundedOAuthBody,
} from "./mcp-oauth-http";
import { POST as registerRoute } from "../app/oauth/register/route";
import { POST as tokenRoute } from "../app/oauth/token/route";
import { GET as resourceRoute } from "../app/.well-known/oauth-protected-resource/route";
import { GET as serverRoute } from "../app/.well-known/oauth-authorization-server/route";

const verifier = "v".repeat(43);
const challenge = createHash("sha256").update(verifier).digest("base64url");
const callback = "https://client.example/callback";
async function authorize(
  options: {
    method?: string;
    run?: boolean;
    allowRun?: boolean;
    denied?: boolean;
  } = {},
) {
  const client = await registerOAuthClient({
    client_name: "Test MCP",
    redirect_uris: [callback],
    token_endpoint_auth_method: options.method ?? "none",
  });
  const pending = await beginOAuthAuthorization(
    new URLSearchParams({
      response_type: "code",
      client_id: client.client_id,
      redirect_uri: callback,
      code_challenge: challenge,
      code_challenge_method: "S256",
      resource: "https://checks.test/mcp",
      scope: options.run ? "read run" : "read",
      state: "state & expected",
    }),
  );
  const location = await approveOAuthAuthorization(
    pending.id,
    ["shop"],
    options.allowRun ?? false,
    options.denied ?? false,
  );
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: client.client_id,
    code: new URL(location).searchParams.get("code") ?? "denied",
    redirect_uri: callback,
    code_verifier: verifier,
    resource: "https://checks.test/mcp",
  });
  return { client, params, location, pending };
}
function refresh(clientId: string, token: string, scope?: string) {
  return new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    refresh_token: token,
    ...(scope ? { scope } : {}),
  });
}
describe("MCP OAuth lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXTAUTH_URL", "https://checks.test");
    vi.stubEnv("NEXTAUTH_SECRET", "test-secret");
    Object.values(db.tables).forEach((rows) => {
      rows.length = 0;
    });
    db.tables.project!.push({ slug: "shop" });
  });
  it("discovers canonical endpoints and performs consent, PKCE exchange, refresh and revocation", async () => {
    expect(protectedResourceMetadata()).toMatchObject({
      resource: "https://checks.test/mcp",
      authorization_servers: ["https://checks.test"],
    });
    expect(authorizationServerMetadata()).toMatchObject({
      registration_endpoint: "https://checks.test/oauth/register",
      code_challenge_methods_supported: ["S256"],
    });
    const { client, params, location } = await authorize({ run: true });
    expect(new URL(location).searchParams.get("state")).toBe("state & expected");
    expect(new URL(location).searchParams.get("iss")).toBe("https://checks.test");
    const tokens = await exchangeOAuthToken(params, null);
    expect(tokens).toMatchObject({
      token_type: "Bearer",
      expires_in: 900,
      scope: "read",
    });
    expect(await authenticateOAuthAccess(tokens.access_token)).toEqual({
      scopes: ["read"],
      projectSlugs: ["shop"],
    });
    expect(JSON.stringify(db.tables)).not.toContain(tokens.access_token);
    expect(JSON.stringify(db.tables)).not.toContain(tokens.refresh_token);
    const rotated = await exchangeOAuthToken(
      refresh(client.client_id, tokens.refresh_token),
      null,
    );
    expect(rotated.refresh_token).not.toBe(tokens.refresh_token);
    await revokeOAuthToken(
      new URLSearchParams({ client_id: client.client_id, token: rotated.access_token }),
      null,
    );
    expect(await authenticateOAuthAccess(tokens.access_token)).toBeNull();
    expect(await authenticateOAuthAccess(rotated.access_token)).toBeNull();
    await expect(
      exchangeOAuthToken(refresh(client.client_id, rotated.refresh_token), null),
    ).rejects.toMatchObject({ code: "invalid_grant" });
  });
  it("does not consume a code for a wrong verifier, redirect, client or audience; rejects code reuse", async () => {
    const { params } = await authorize();
    for (const [key, value] of [
      ["code_verifier", "w".repeat(43)],
      ["redirect_uri", "https://evil.example"],
      ["resource", "https://evil.example/mcp"],
    ]) {
      const invalid = new URLSearchParams(params);
      invalid.set(key!, value!);
      await expect(exchangeOAuthToken(invalid, null)).rejects.toMatchObject({
        code: key === "resource" ? "invalid_target" : "invalid_grant",
      });
    }
    const other = await registerOAuthClient({
      redirect_uris: [callback],
      token_endpoint_auth_method: "none",
    });
    const wrongClient = new URLSearchParams(params);
    wrongClient.set("client_id", other.client_id);
    await expect(exchangeOAuthToken(wrongClient, null)).rejects.toMatchObject({
      code: "invalid_grant",
    });
    await exchangeOAuthToken(params, null);
    await expect(exchangeOAuthToken(params, null)).rejects.toMatchObject({
      code: "invalid_grant",
    });
    expect(db.tables.oAuthGrant).toHaveLength(1);
  });
  it("allows run only after explicit consent, narrows scopes and revokes the whole grant on refresh replay", async () => {
    const { client, params } = await authorize({ run: true, allowRun: true });
    const original = await exchangeOAuthToken(params, null);
    expect(await authenticateOAuthAccess(original.access_token)).toMatchObject({
      scopes: ["read", "run"],
    });
    const narrowed = await exchangeOAuthToken(
      refresh(client.client_id, original.refresh_token, "read"),
      null,
    );
    await expect(
      exchangeOAuthToken(
        refresh(client.client_id, narrowed.refresh_token, "read run"),
        null,
      ),
    ).rejects.toMatchObject({ code: "invalid_scope" });
    await expect(
      exchangeOAuthToken(refresh(client.client_id, original.refresh_token), null),
    ).rejects.toMatchObject({ code: "invalid_grant" });
    expect(await authenticateOAuthAccess(narrowed.access_token)).toBeNull();
    expect(db.tables.oAuthGrant![0]!.revokedAt).toBeInstanceOf(Date);
  });
  it.each(["client_secret_post", "client_secret_basic"])(
    "authenticates %s clients and stores only a secret hash",
    async (method) => {
      const { client, params } = await authorize({ method });
      expect(JSON.stringify(db.tables)).not.toContain(client.client_secret);
      await expect(exchangeOAuthToken(params, null)).rejects.toMatchObject({
        code: "invalid_client",
      });
      const header =
        method === "client_secret_basic"
          ? `Basic ${Buffer.from(`${client.client_id}:${client.client_secret}`).toString("base64")}`
          : null;
      if (method === "client_secret_post")
        params.set("client_secret", client.client_secret!);
      expect((await exchangeOAuthToken(params, header)).access_token).toMatch(
        /^sco_access_/,
      );
    },
  );
  it("rejects expired tokens and codes, denied and repeated consent, and unknown projects", async () => {
    const denied = await authorize({ denied: true });
    expect(new URL(denied.location).searchParams.get("error")).toBe("access_denied");
    await expect(
      approveOAuthAuthorization(denied.pending.id, ["shop"], false),
    ).rejects.toMatchObject({ code: "invalid_request" });
    const expired = await authorize();
    db.tables.oAuthAuthorization!.find(
      (row) => row.id === expired.pending.id,
    )!.expiresAt = new Date(0);
    await expect(exchangeOAuthToken(expired.params, null)).rejects.toMatchObject({
      code: "invalid_grant",
    });
    const valid = await authorize();
    const tokens = await exchangeOAuthToken(valid.params, null);
    db.tables.oAuthToken!.find(
      (row) => row.tokenHash === hashOAuthToken(tokens.access_token),
    )!.expiresAt = new Date(0);
    expect(await authenticateOAuthAccess(tokens.access_token)).toBeNull();
    await expect(
      approveOAuthAuthorization(valid.pending.id, ["unknown"], false),
    ).rejects.toMatchObject({ code: "invalid_request" });
  });
  it("enforces safe registered redirects, S256, supported scopes, unique parameters and body limits", async () => {
    for (const uri of [
      "http://client.example/callback",
      "javascript:alert(1)",
      "https://a:b@client.example",
      `${callback}#fragment`,
    ]) {
      expect(safeRedirect(uri)).toBe(false);
      await expect(
        registerOAuthClient({
          redirect_uris: [uri],
          token_endpoint_auth_method: "none",
        }),
      ).rejects.toMatchObject({ code: "invalid_client_metadata" });
    }
    expect(
      redirectMatches(
        "http://127.0.0.1:1234/callback",
        "http://127.0.0.1:5432/callback",
      ),
    ).toBe(true);
    expect(
      redirectMatches(
        "https://client.example/callback",
        "https://client.example:444/callback",
      ),
    ).toBe(false);
    const { client } = await authorize();
    const base = {
      response_type: "code",
      client_id: client.client_id,
      redirect_uri: callback,
      code_challenge: challenge,
      code_challenge_method: "S256",
    };
    const invalidParams: Record<string, string>[] = [
      { redirect_uri: "https://evil.example" },
      { code_challenge_method: "plain" },
      { scope: "read admin" },
      { resource: "https://evil.example" },
    ];
    for (const extra of invalidParams)
      await expect(
        beginOAuthAuthorization(new URLSearchParams({ ...base, ...extra })),
      ).rejects.toBeInstanceOf(Error);
    expect(() =>
      parameter(new URLSearchParams("client_id=a&client_id=b"), "client_id"),
    ).toThrow();
    await expect(
      boundedOAuthBody(
        new Request("https://checks.test/oauth/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: "x".repeat(16385),
        }),
        "application/x-www-form-urlencoded",
      ),
    ).rejects.toMatchObject({ status: 413 });
  });
  it("binds consent to both the request and logged-in browser session", () => {
    const csrf = consentCsrf("request", "session-one");
    expect(() => validateConsentCsrf("request", "session-one", csrf)).not.toThrow();
    expect(() => validateConsentCsrf("request-other", "session-one", csrf)).toThrow();
    expect(() => validateConsentCsrf("request", "session-two", csrf)).toThrow();
  });
  it("works with real MCP SDK discovery, registration, PKCE and token exchange", async () => {
    let info: OAuthClientInformationMixed | undefined;
    let tokens: OAuthTokens | undefined;
    let codeVerifier = "";
    let authorizationUrl: URL | undefined;
    const provider: OAuthClientProvider = {
      redirectUrl: callback,
      clientMetadata: {
        redirect_uris: [callback],
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        scope: "read run",
      },
      clientInformation: () => info,
      saveClientInformation: (value) => {
        info = value;
      },
      tokens: () => tokens,
      saveTokens: (value) => {
        tokens = value;
      },
      codeVerifier: () => codeVerifier,
      saveCodeVerifier: (value) => {
        codeVerifier = value;
      },
      redirectToAuthorization: (value) => {
        authorizationUrl = value;
      },
    };
    const fetchMock: typeof fetch = async (input, init) => {
      const request = new Request(input, init);
      switch (new URL(request.url).pathname) {
        case "/.well-known/oauth-protected-resource/mcp":
          return resourceRoute();
        case "/.well-known/oauth-authorization-server":
          return serverRoute();
        case "/oauth/register":
          return registerRoute(request);
        case "/oauth/token":
          return tokenRoute(request);
        default:
          return new Response(null, { status: 404 });
      }
    };
    const options = {
      serverUrl: "https://checks.test/mcp",
      resourceMetadataUrl: new URL(
        "https://checks.test/.well-known/oauth-protected-resource/mcp",
      ),
      fetchFn: fetchMock,
    };
    expect(await auth(provider, options)).toBe("REDIRECT");
    expect(info?.client_id).toBeTruthy();
    // Simulate consent in an isolated test database; no real browser, account or login involved.
    const pending = await beginOAuthAuthorization(authorizationUrl!.searchParams);
    const location = await approveOAuthAuthorization(pending.id, ["shop"], true);
    const code = new URL(location).searchParams.get("code")!;
    expect(await auth(provider, { ...options, authorizationCode: code })).toBe(
      "AUTHORIZED",
    );
    expect(await authenticateOAuthAccess(tokens!.access_token)).toEqual({
      scopes: ["read", "run"],
      projectSlugs: ["shop"],
    });
    const first = tokens!.refresh_token;
    expect(await auth(provider, options)).toBe("AUTHORIZED");
    expect(tokens!.refresh_token).not.toBe(first);
  });
});
