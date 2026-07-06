import { Suspense } from "react";

import { getDashboardData } from "@/lib/dashboard-data";
import { getDashboardSettingsData } from "@/lib/settings-data";

import DashboardClient from "./dashboard-client";
import { DashboardPageSkeleton } from "./dashboard-loading";

export const dynamic = "force-dynamic";

type DashboardActiveView = "dashboard" | "settings";

type DashboardPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = searchParams ? await searchParams : {};
  const initialActiveView = params.view === "settings" ? "settings" : "dashboard";

  return (
    <Suspense fallback={<DashboardPageSkeleton activeView={initialActiveView} />}>
      <DashboardData activeView={initialActiveView} />
    </Suspense>
  );
}

async function DashboardData({ activeView }: { activeView: DashboardActiveView }) {
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
