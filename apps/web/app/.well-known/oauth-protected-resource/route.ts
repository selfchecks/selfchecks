import { oauthHeaders, protectedResourceMetadata } from "@/lib/mcp-oauth-http";
export { OPTIONS } from "@/lib/mcp-oauth-http";
export const dynamic = "force-dynamic";
export function GET() {
  return Response.json(protectedResourceMetadata(), { headers: oauthHeaders });
}
