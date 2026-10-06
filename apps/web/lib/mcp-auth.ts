import { hashApiKey } from "./api-keys";
import { prisma } from "./prisma";
import { authenticateOAuthAccess } from "./mcp-oauth";

export type McpAccess = { scopes: string[]; projectSlugs: string[] };

export async function authenticateMcp(request: Request): Promise<McpAccess | null> {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;
  if (token.startsWith("sco_access_")) return authenticateOAuthAccess(token);
  const key = await prisma.apiKey.findUnique({
    where: { tokenHash: hashApiKey(token) },
    select: {
      id: true,
      revokedAt: true,
      lastUsedAt: true,
      mcpScopes: true,
      mcpProjectSlugs: true,
    },
  });
  if (!key || key.revokedAt || !key.mcpScopes.includes("read")) return null;
  if (!key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() >= 300_000) {
    await prisma.apiKey.update({
      where: { id: key.id },
      data: { lastUsedAt: new Date() },
    });
  }
  return { scopes: key.mcpScopes, projectSlugs: key.mcpProjectSlugs };
}
