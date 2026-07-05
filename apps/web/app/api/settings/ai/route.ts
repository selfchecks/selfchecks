import { NextResponse } from "next/server";

import { updateAiSettings } from "@/lib/settings-data";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const settings = await updateAiSettings(await request.json());

    return NextResponse.json(
      {
        settings,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to save AI settings.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
