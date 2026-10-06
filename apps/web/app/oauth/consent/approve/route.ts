import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  approveOAuthAuthorization,
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
export async function POST(request: Request) {
  try {
    if (!(await getServerSession(authOptions)))
      throw new OAuthError("access_denied", "Sign in first.", 401);
    if (request.headers.get("origin") !== oauthIssuer())
      throw new OAuthError("access_denied", "Invalid origin.", 403);
    const form = new URLSearchParams(
      await boundedOAuthBody(request, "application/x-www-form-urlencoded"),
    );
    const id = parameter(form, "request", true)!;
    validateConsentCsrf(id, await oauthSessionCookie(), parameter(form, "csrf", true)!);
    const decision = parameter(form, "decision", true);
    if (!["approve", "deny"].includes(decision!))
      throw new OAuthError("invalid_request", "Invalid decision.");
    const location = await approveOAuthAuthorization(
      id,
      form.getAll("projects"),
      parameter(form, "run") === "yes",
      decision === "deny",
    );
    return new Response(null, {
      status: 303,
      headers: {
        Location: location,
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (error) {
    return oauthErrorResponse(error);
  }
}
