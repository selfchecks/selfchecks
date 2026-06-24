import { notFound } from "next/navigation";

import { getCheckDetailData } from "@/lib/dashboard-data";
import { getDashboardSettingsData } from "@/lib/settings-data";

import CheckDetailClient from "./check-detail-client";

export const dynamic = "force-dynamic";

type CheckDetailPageProps = {
  params: Promise<{
    checkId: string;
  }>;
};

export default async function CheckDetailPage({ params }: CheckDetailPageProps) {
  const { checkId } = await params;
  const detail = await getCheckDetailData(checkId);

  if (!detail) {
    notFound();
  }

  const settings = await getDashboardSettingsData(detail.projectSlug);

  return (
    <CheckDetailClient accountLabel={settings.basic.login || "Admin"} detail={detail} />
  );
}
