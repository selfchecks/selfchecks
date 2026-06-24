import { NextResponse } from "next/server";

import { getDashboardData } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectSlug = url.searchParams.get("project")?.trim() || "default";
  const dashboard = await getDashboardData(projectSlug);

  return NextResponse.json(dashboard, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
