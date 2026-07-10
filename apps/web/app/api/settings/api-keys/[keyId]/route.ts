import { NextResponse } from "next/server";

import { revokeApiKey } from "@/lib/api-keys";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    keyId: string;
  }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { keyId } = await context.params;
    await revokeApiKey(keyId);

    return NextResponse.json(
      {
        id: keyId,
        revoked: true,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to revoke API key.";

    return NextResponse.json(
      { error: message },
      { status: message === "API key was not found." ? 404 : 400 },
    );
  }
}
