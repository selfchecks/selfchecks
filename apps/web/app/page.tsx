import { Suspense } from "react";

import { DashboardData } from "./dashboard-page-data";
import { DashboardPageSkeleton } from "./dashboard-loading";

export const dynamic = "force-dynamic";

type DashboardPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = searchParams ? await searchParams : {};
  const initialActiveView =
    params.view === "settings"
      ? "settings"
      : params.view === "queue"
        ? "queue"
        : "dashboard";

  return (
    <Suspense fallback={<DashboardPageSkeleton activeView={initialActiveView} />}>
      <DashboardData activeView={initialActiveView} />
    </Suspense>
  );
}
