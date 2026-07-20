import { getDashboardData, getDashboardQueueData } from "@/lib/dashboard-data";
import type { DashboardSummary } from "@/lib/dashboard-types";
import {
  getDashboardAccountLabel,
  getDashboardSettingsData,
} from "@/lib/settings-data";

import DashboardClient from "./dashboard-client";

type DashboardActiveView = "dashboard" | "queue" | "settings";

export async function DashboardData({
  activeView,
}: {
  activeView: DashboardActiveView;
}) {
  if (activeView === "settings") {
    const settings = await getDashboardSettingsData("default");

    return (
      <DashboardClient
        initialActiveView={activeView}
        initialGroups={[]}
        initialQueue={[]}
        initialSettings={settings}
        initialSummary={createEmptySummary()}
      />
    );
  }

  if (activeView === "queue") {
    const queueData = await getDashboardQueueData("default");

    return (
      <DashboardClient
        initialAccountLabel={getDashboardAccountLabel()}
        initialActiveView={activeView}
        initialGroups={[]}
        initialQueue={queueData.queue}
        initialSummary={queueData.summary}
      />
    );
  }

  const dashboard = await getDashboardData("default");

  return (
    <DashboardClient
      initialAccountLabel={getDashboardAccountLabel()}
      initialFirewatch={dashboard.firewatch}
      initialActiveView={activeView}
      initialGroups={dashboard.groups}
      initialQueue={dashboard.queue}
      initialSummary={dashboard.summary}
    />
  );
}

function createEmptySummary(): DashboardSummary {
  return {
    degraded: 0,
    failing: 0,
    passing: 0,
    queued: 0,
    running: 0,
  };
}
