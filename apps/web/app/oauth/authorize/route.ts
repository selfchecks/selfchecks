import { beginOAuthAuthorization } from "@/lib/mcp-oauth";
import { oauthErrorResponse, oauthHeaders } from "@/lib/mcp-oauth-http";
export async function GET(request: Request) {
  try {
    const pending = await beginOAuthAuthorization(new URL(request.url).searchParams);
    return new Response(null, {
      status: 303,
      headers: {
        ...oauthHeaders,
        Location: `/oauth/consent?request=${encodeURIComponent(pending.id)}`,
      },
    });
  } catch (error) {
    return oauthErrorResponse(error);
  }
}
