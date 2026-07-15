import { Suspense } from "react";

import { DashboardData } from "./dashboard-page-data";
import { DashboardPageSkeleton } from "./dashboard-loading";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardPageSkeleton activeView="dashboard" />}>
      <DashboardData activeView="dashboard" />
    </Suspense>
  );
}
