import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { consentCsrf, pendingAuthorization, OAuthError } from "@/lib/mcp-oauth";
import { oauthSessionCookie } from "@/lib/mcp-oauth-http";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ request?: string }>;
}) {
  const { request: id = "" } = await searchParams;
  if (!(await getServerSession(authOptions)))
    redirect(
      `/login?callbackUrl=${encodeURIComponent(`/oauth/consent?request=${encodeURIComponent(id)}`)}`,
    );
  let pending;
  try {
    pending = await pendingAuthorization(id);
  } catch (error) {
    if (!(error instanceof OAuthError)) throw error;
    return (
      <main className="mx-auto max-w-lg p-8">
        <h1 className="text-xl font-semibold">Connection expired</h1>
        <p className="mt-4">Restart the connection from your MCP client.</p>
      </main>
    );
  }
  const projects = await prisma.project.findMany({
    select: { slug: true, name: true },
    orderBy: { name: "asc" },
  });
  const csrf = consentCsrf(id, await oauthSessionCookie());
  return (
    <main className="mx-auto max-w-lg p-8">
      <h1 className="text-xl font-semibold">Connect to Selfchecks</h1>
      <p className="mt-4">
        <strong>{pending.client.name}</strong> requests access to your checks, run
        history, logs and artifacts.
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        Client name is supplied by the application. Access will be returned to{" "}
        {new URL(pending.redirectUri).origin}.
      </p>
      <form action="/oauth/consent/approve" method="post" className="mt-6 space-y-5">
        <input type="hidden" name="request" value={id} />
        <input type="hidden" name="csrf" value={csrf} />
        <label className="block">
          Projects
          <select
            name="projects"
            multiple
            required
            defaultValue={projects.length ? [projects[0]!.slug] : ["*"]}
            className="mt-2 block w-full rounded border bg-background p-2"
            size={Math.min(projects.length + 1, 7)}
          >
            <option value="*">All projects (including future projects)</option>
            {projects.map((project) => (
              <option key={project.slug} value={project.slug}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        {pending.requestedScopes.includes("run") && (
          <label className="flex gap-2">
            <input type="checkbox" name="run" value="yes" />
            Allow manually triggering checks
          </label>
        )}
        <p className="text-sm text-muted-foreground">
          Connection expires in 30 days. You can revoke it from MCP connections below.
        </p>
        <div className="flex gap-3">
          <button
            name="decision"
            value="approve"
            className="rounded bg-primary px-4 py-2 text-primary-foreground"
          >
            Allow access
          </button>
          <button
            name="decision"
            value="deny"
            formNoValidate
            className="rounded border px-4 py-2"
          >
            Deny
          </button>
        </div>
      </form>
      <a href="/oauth/connections" className="mt-6 block underline">
        Manage MCP connections
      </a>
    </main>
  );
}
