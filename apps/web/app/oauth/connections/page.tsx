import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { consentCsrf } from "@/lib/mcp-oauth";
import { oauthSessionCookie } from "@/lib/mcp-oauth-http";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export default async function ConnectionsPage() {
  if (!(await getServerSession(authOptions)))
    redirect("/login?callbackUrl=%2Foauth%2Fconnections");
  const grants = await prisma.oAuthGrant.findMany({
    where: { revokedAt: null, expiresAt: { gt: new Date() } },
    include: { client: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const cookie = await oauthSessionCookie();
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-xl font-semibold">MCP connections</h1>
      <p className="mt-3">
        Revoking a connection immediately disables its access and refresh tokens.
      </p>
      {!grants.length && <p className="mt-6">No active connections.</p>}
      {grants.map((grant) => (
        <section key={grant.id} className="mt-5 rounded border p-4">
          <h2 className="font-semibold">{grant.client.name}</h2>
          <p className="mt-2 text-sm">
            Projects: {grant.projectSlugs.join(", ") || "All projects"}. Permissions:{" "}
            {grant.scopes.join(", ")}. Expires:{" "}
            {grant.expiresAt.toISOString().slice(0, 10)}.
          </p>
          <form action="/oauth/connections/revoke" method="post" className="mt-3">
            <input type="hidden" name="grant" value={grant.id} />
            <input
              type="hidden"
              name="csrf"
              value={consentCsrf(`revoke:${grant.id}`, cookie)}
            />
            <button className="rounded border px-3 py-2">Revoke</button>
          </form>
        </section>
      ))}
      <a href="/" className="mt-6 block underline">
        Back to dashboard
      </a>
    </main>
  );
}
