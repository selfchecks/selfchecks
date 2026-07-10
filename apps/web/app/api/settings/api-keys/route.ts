import { NextResponse } from "next/server";

import { createApiKey } from "@/lib/api-keys";
import { getRuntimeTimeZone } from "@/lib/runtime-config";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const created = await createApiKey(await request.json(), getRuntimeTimeZone());

    return NextResponse.json(created, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to generate API key.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
