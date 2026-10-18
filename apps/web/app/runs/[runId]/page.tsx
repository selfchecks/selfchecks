import { notFound } from "next/navigation";

import { RunDetailView } from "@/app/checks/[checkId]/runs/[runId]/run-detail-view";
import { getRunDetailData } from "@/lib/dashboard-data";
import { getDashboardAccountLabel } from "@/lib/settings-data";

export const dynamic = "force-dynamic";

export default async function RunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const detail = await getRunDetailData(undefined, runId);

  if (!detail) {
    notFound();
  }

  return <RunDetailView accountLabel={getDashboardAccountLabel()} detail={detail} />;
}
