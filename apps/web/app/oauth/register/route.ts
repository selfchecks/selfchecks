import { registerOAuthClient, OAuthError } from "@/lib/mcp-oauth";
import {
  boundedOAuthBody,
  oauthErrorResponse,
  oauthHeaders,
} from "@/lib/mcp-oauth-http";
export { OPTIONS } from "@/lib/mcp-oauth-http";
export async function POST(request: Request) {
  try {
    const body = await boundedOAuthBody(request, "application/json");
    let input: unknown;
    try {
      input = JSON.parse(body);
    } catch {
      throw new OAuthError("invalid_client_metadata", "Invalid JSON.");
    }
    return Response.json(await registerOAuthClient(input), {
      status: 201,
      headers: oauthHeaders,
    });
  } catch (error) {
    return oauthErrorResponse(error);
  }
}
