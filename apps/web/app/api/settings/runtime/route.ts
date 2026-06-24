import { NextResponse } from "next/server";

import { updateRuntimeEnvironmentSettings } from "@/lib/settings-data";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const environment = await updateRuntimeEnvironmentSettings(await request.json());

    return NextResponse.json(
      {
        environment,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to save runtime settings.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
