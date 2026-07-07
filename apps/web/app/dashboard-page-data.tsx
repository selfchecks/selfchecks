import { getDashboardData } from "@/lib/dashboard-data";
import { getDashboardSettingsData } from "@/lib/settings-data";

import DashboardClient from "./dashboard-client";

type DashboardActiveView = "dashboard" | "settings";

export async function DashboardData({
  activeView,
}: {
  activeView: DashboardActiveView;
}) {
  const dashboard = await getDashboardData("default");
  const settings = await getDashboardSettingsData(dashboard.projectSlug);

  return (
    <DashboardClient
      initialFirewatch={dashboard.firewatch}
      initialActiveView={activeView}
      initialGroups={dashboard.groups}
      initialSettings={settings}
      initialSummary={dashboard.summary}
    />
  );
}
