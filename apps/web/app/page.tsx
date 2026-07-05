import { getDashboardData } from "@/lib/dashboard-data";
import { getDashboardSettingsData } from "@/lib/settings-data";

import DashboardClient from "./dashboard-client";

export const dynamic = "force-dynamic";

type DashboardPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = searchParams ? await searchParams : {};
  const initialActiveView = params.view === "settings" ? "settings" : "dashboard";
  const dashboard = await getDashboardData("default");
  const settings = await getDashboardSettingsData(dashboard.projectSlug);

  return (
    <DashboardClient
      initialActiveView={initialActiveView}
      initialGroups={dashboard.groups}
      initialSettings={settings}
      initialSummary={dashboard.summary}
    />
  );
}
