import { getDashboardData } from "@/lib/dashboard-data";

import DashboardClient from "./dashboard-client";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const dashboard = await getDashboardData("default");

  return (
    <DashboardClient
      initialGroups={dashboard.groups}
      initialSummary={dashboard.summary}
    />
  );
}
