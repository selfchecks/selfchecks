import { NextResponse } from "next/server";

import { getCheckDetailData } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CheckDetailRouteContext = {
  params: Promise<{
    checkId: string;
  }>;
};

export async function GET(_request: Request, context: CheckDetailRouteContext) {
  const { checkId } = await context.params;
  const detail = await getCheckDetailData(checkId);

  if (!detail) {
    return NextResponse.json({ error: "Check was not found." }, { status: 404 });
  }

  return NextResponse.json(detail, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
