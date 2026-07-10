import { Suspense } from "react";

import { DashboardData } from "../dashboard-page-data";
import { DashboardPageSkeleton } from "../dashboard-loading";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <Suspense fallback={<DashboardPageSkeleton activeView="settings" />}>
      <DashboardData activeView="settings" />
    </Suspense>
  );
}
