import { getDashboardData } from "@/lib/dashboard-data";
import { getDashboardSettingsData } from "@/lib/settings-data";

import DashboardClient from "./dashboard-client";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const dashboard = await getDashboardData("default");
  const settings = await getDashboardSettingsData(dashboard.projectSlug);

  return (
    <DashboardClient
      initialGroups={dashboard.groups}
      initialSettings={settings}
      initialSummary={dashboard.summary}
    />
  );
}
