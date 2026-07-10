import { NextResponse } from "next/server";

import { getDashboardActivityData } from "@/lib/dashboard-data";
import { getDashboardAccountLabel } from "@/lib/settings-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectSlug = url.searchParams.get("project")?.trim() || "default";

  try {
    const activity = await getDashboardActivityData(projectSlug);

    return NextResponse.json(
      {
        accountLabel: getDashboardAccountLabel(),
        ...activity,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch {
    return NextResponse.json(
      {
        error: "Unable to load sidebar status.",
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
