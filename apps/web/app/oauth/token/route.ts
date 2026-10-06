import { exchangeOAuthToken } from "@/lib/mcp-oauth";
import {
  boundedOAuthBody,
  oauthErrorResponse,
  oauthHeaders,
} from "@/lib/mcp-oauth-http";
export { OPTIONS } from "@/lib/mcp-oauth-http";
export async function POST(request: Request) {
  try {
    const params = new URLSearchParams(
      await boundedOAuthBody(request, "application/x-www-form-urlencoded"),
    );
    return Response.json(
      await exchangeOAuthToken(params, request.headers.get("authorization")),
      { headers: oauthHeaders },
    );
  } catch (error) {
    return oauthErrorResponse(error);
  }
}
