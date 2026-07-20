import { NextResponse } from "next/server";

import { getDashboardData, getDashboardQueueData } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectSlug = url.searchParams.get("project")?.trim() || "default";
  const queueOnly = url.searchParams.get("view") === "queue";

  try {
    const dashboard = queueOnly
      ? await getDashboardQueueData(projectSlug, { onError: "throw" })
      : await getDashboardData(projectSlug, { onError: "throw" });

    return NextResponse.json(dashboard, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      {
        error: "Unable to load dashboard data.",
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
        status: 503,
      },
    );
  }
}
