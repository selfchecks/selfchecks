import { enqueueCheckRun } from "@/lib/run-check";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ checkId: string }> },
) {
  const { checkId } = await context.params;
  return enqueueCheckRun(request, checkId);
}
