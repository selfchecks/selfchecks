import { notFound } from "next/navigation";

import { getCheckDetailShellData } from "@/lib/dashboard-data";
import { getDashboardAccountLabel } from "@/lib/settings-data";

import CheckDetailClient from "./check-detail-client";

export const dynamic = "force-dynamic";

type CheckDetailPageProps = {
  params: Promise<{
    checkId: string;
  }>;
};

export default async function CheckDetailPage({ params }: CheckDetailPageProps) {
  const { checkId } = await params;
  const detail = await getCheckDetailShellData(checkId);

  if (!detail) {
    notFound();
  }

  return (
    <CheckDetailClient accountLabel={getDashboardAccountLabel()} detail={detail} />
  );
}
