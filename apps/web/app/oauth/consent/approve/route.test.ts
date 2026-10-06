// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  cookie: vi.fn(),
  approve: vi.fn(),
}));
vi.mock("next-auth", () => ({ getServerSession: mocks.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/mcp-oauth-http", async (original) => ({
  ...(await original<typeof import("@/lib/mcp-oauth-http")>()),
  oauthSessionCookie: mocks.cookie,
}));
vi.mock("@/lib/mcp-oauth", async (original) => ({
  ...(await original<typeof import("@/lib/mcp-oauth")>()),
  approveOAuthAuthorization: mocks.approve,
}));
import { consentCsrf } from "@/lib/mcp-oauth";
import { POST } from "./route";
function request(
  overrides: { csrf?: string; origin?: string; decision?: string } = {},
) {
  return new Request("https://checks.test/oauth/consent/approve", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: overrides.origin ?? "https://checks.test",
    },
    body: new URLSearchParams({
      request: "pending",
      csrf: overrides.csrf ?? consentCsrf("pending", "session-cookie"),
      decision: overrides.decision ?? "approve",
      projects: "shop",
      run: "yes",
    }),
  });
}
describe("OAuth consent boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXTAUTH_URL", "https://checks.test");
    vi.stubEnv("NEXTAUTH_SECRET", "secret");
    mocks.session.mockResolvedValue({ user: { name: "admin" } });
    mocks.cookie.mockResolvedValue("session-cookie");
    mocks.approve.mockResolvedValue("https://client.example/callback?code=opaque");
  });
  it("requires an admin session, same origin and a session-bound CSRF token before approval", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(401);
    mocks.session.mockResolvedValue({ user: { name: "admin" } });
    expect((await POST(request({ origin: "https://evil.example" }))).status).toBe(403);
    expect(
      (await POST(request({ csrf: consentCsrf("pending", "another-session") }))).status,
    ).toBe(403);
    expect(mocks.approve).not.toHaveBeenCalled();
    const approved = await POST(request());
    expect(approved.status).toBe(303);
    expect(mocks.approve).toHaveBeenCalledWith("pending", ["shop"], true, false);
    expect(approved.headers.get("location")).toBe(
      "https://client.example/callback?code=opaque",
    );
  });
  it("rejects invalid decisions and passes a deliberate denial", async () => {
    expect((await POST(request({ decision: "anything" }))).status).toBe(400);
    expect(mocks.approve).not.toHaveBeenCalled();
    expect((await POST(request({ decision: "deny" }))).status).toBe(303);
    expect(mocks.approve).toHaveBeenCalledWith("pending", ["shop"], true, true);
  });
});
