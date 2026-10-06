import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  oauthIssuer,
  OAuthError,
  parameter,
  validateConsentCsrf,
} from "@/lib/mcp-oauth";
import {
  boundedOAuthBody,
  oauthErrorResponse,
  oauthSessionCookie,
} from "@/lib/mcp-oauth-http";
import { prisma } from "@/lib/prisma";
export async function POST(request: Request) {
  try {
    if (!(await getServerSession(authOptions)))
      throw new OAuthError("access_denied", "Sign in first.", 401);
    if (request.headers.get("origin") !== oauthIssuer())
      throw new OAuthError("access_denied", "Invalid origin.", 403);
    const form = new URLSearchParams(
      await boundedOAuthBody(request, "application/x-www-form-urlencoded"),
    );
    const id = parameter(form, "grant", true)!;
    validateConsentCsrf(
      `revoke:${id}`,
      await oauthSessionCookie(),
      parameter(form, "csrf", true)!,
    );
    await prisma.oAuthGrant.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return new Response(null, {
      status: 303,
      headers: { Location: "/oauth/connections", "Cache-Control": "no-store" },
    });
  } catch (error) {
    return oauthErrorResponse(error);
  }
}
