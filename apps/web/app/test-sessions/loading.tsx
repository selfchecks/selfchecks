import { FlaskConical } from "lucide-react";

import { TablePageSkeleton } from "@/components/table-page-skeleton";

export default function TestSessionsLoading() {
  return (
    <TablePageSkeleton
      activeItem="test-sessions"
      ariaLabel="Loading test sessions"
      columns={[
        "Session",
        "Status",
        "Project",
        "Total",
        "Passed",
        "Failed",
        "Regress",
        "Running",
        "Queued",
        "Duration",
        "URL",
      ]}
      filters={3}
      icon={FlaskConical}
      title="Test sessions"
    />
  );
}
