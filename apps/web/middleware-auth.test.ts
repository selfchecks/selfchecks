// @vitest-environment node

import { encode, getToken } from "next-auth/jwt";
import { NextRequest, type NextFetchEvent } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import middleware from "./middleware";

const secret = "selfchecks-isolated-auth-regression-secret";
const sessionCookie = "__Secure-next-auth.session-token";

function request(headers: Record<string, string> = {}) {
  return new NextRequest("https://checks.example.test/settings", { headers });
}

function runMiddleware(req: NextRequest) {
  // The options-only withAuth wrapper reads the request, not the fetch event.
  const event = {} as NextFetchEvent;
  return middleware(Object.assign(req, { nextauth: { token: null } }), event);
}

describe("middleware authentication with real NextAuth tokens", () => {
  beforeEach(() => {
    vi.stubEnv("NEXTAUTH_SECRET", secret);
    vi.stubEnv("NEXTAUTH_URL", "https://checks.example.test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(["%", "%GG", "%E0%A4%A", "%C0%AF"])(
    "rejects malformed Bearer encoding %s without throwing",
    async (value) => {
      const req = request({ authorization: `Bearer ${value}` });

      await expect(getToken({ req, secret })).resolves.toBeNull();
      await expect(getToken({ req, secret, raw: true })).resolves.toBeNull();

      const response = await runMiddleware(req);
      expect(response?.status).toBe(307);
      const location = new URL(response!.headers.get("location")!);
      expect(location.pathname).toBe("/login");
      expect(location.searchParams.get("callbackUrl")).toBe("/settings");
    },
  );

  it("rejects an invalid JWT and a token signed with a different secret", async () => {
    const token = await encode({
      secret: "different-isolated-secret",
      token: { sub: "synthetic-user" },
      maxAge: 60,
    });

    for (const value of ["not-a-jwt", token]) {
      const req = request({ authorization: `Bearer ${value}` });
      await expect(getToken({ req, secret })).resolves.toBeNull();
      expect((await runMiddleware(req))?.status).toBe(307);
    }
  });

  it.each(["Bearer", "secure cookie", "cookie before malformed Bearer"])(
    "preserves authentication using %s",
    async (source) => {
      const token = await encode({
        secret,
        token: { sub: "synthetic-user" },
        maxAge: 60,
      });
      const req = request(
        source === "Bearer"
          ? { authorization: `Bearer ${token}` }
          : {
              cookie: `${sessionCookie}=${token}`,
              ...(source === "cookie before malformed Bearer"
                ? { authorization: "Bearer %" }
                : {}),
            },
      );

      await expect(getToken({ req, secret })).resolves.toMatchObject({
        sub: "synthetic-user",
      });
      await expect(getToken({ req, secret, raw: true })).resolves.toBe(token);
      await expect(runMiddleware(req)).resolves.toBeUndefined();
    },
  );

  it("retains the signed trace artifact route exception", async () => {
    const req = new NextRequest(
      "https://checks.example.test/api/runs/run_1/artifacts/artifact_1?traceViewer=1&token=synthetic",
    );

    await expect(runMiddleware(req)).resolves.toBeUndefined();
  });
});
