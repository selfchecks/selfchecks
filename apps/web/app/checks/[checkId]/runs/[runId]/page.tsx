import { notFound } from "next/navigation";

import { getRunDetailData } from "@/lib/dashboard-data";
import { getDashboardAccountLabel } from "@/lib/settings-data";

import { RunDetailView } from "./run-detail-view";

export const dynamic = "force-dynamic";

type RunDetailPageProps = {
  params: Promise<{
    checkId: string;
    runId: string;
  }>;
};

export default async function RunDetailPage({ params }: RunDetailPageProps) {
  const { checkId, runId } = await params;
  const detail = await getRunDetailData(checkId, runId);

  if (!detail) {
    notFound();
  }

  return <RunDetailView accountLabel={getDashboardAccountLabel()} detail={detail} />;
}
