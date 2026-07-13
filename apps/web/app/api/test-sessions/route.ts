import { NextResponse } from "next/server";

import { getTestSessionsData } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectSlug = url.searchParams.get("project")?.trim() || "default";

  try {
    const data = await getTestSessionsData(projectSlug, {
      page: readNumberParam(url.searchParams.get("page")),
      pageSize: readNumberParam(url.searchParams.get("pageSize")),
      project: url.searchParams.get("project") ?? undefined,
      query: url.searchParams.get("q") ?? undefined,
      sessionName: url.searchParams.get("session") ?? undefined,
    });

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      {
        error: "Unable to load test sessions.",
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

function readNumberParam(value: string | null) {
  if (!value) {
    return undefined;
  }

  const parsedValue = Number.parseInt(value, 10);

  return Number.isSafeInteger(parsedValue) ? parsedValue : undefined;
}
