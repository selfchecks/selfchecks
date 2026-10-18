import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { consentCsrf, pendingAuthorization, OAuthError } from "@/lib/mcp-oauth";
import { oauthSessionCookie } from "@/lib/mcp-oauth-http";
import { prisma } from "@/lib/prisma";

import { ConsentView, ExpiredConsentView } from "./consent-view";

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
    return <ExpiredConsentView />;
  }
  const projects = await prisma.project.findMany({
    select: { slug: true, name: true },
    orderBy: { name: "asc" },
  });
  const csrf = consentCsrf(id, await oauthSessionCookie());
  return (
    <ConsentView
      requestId={id}
      csrf={csrf}
      clientName={pending.client.name}
      redirectOrigin={new URL(pending.redirectUri).origin}
      requestedScopes={pending.requestedScopes}
      projects={projects}
    />
  );
}
