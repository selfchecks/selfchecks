import { Suspense } from "react";

import { DashboardData } from "../dashboard-page-data";
import { DashboardPageSkeleton } from "../dashboard-loading";

export const dynamic = "force-dynamic";

export default function QueuePage() {
  return (
    <Suspense fallback={<DashboardPageSkeleton activeView="queue" />}>
      <DashboardData activeView="queue" />
    </Suspense>
  );
}
