import { FlaskConical } from "lucide-react";

import { TablePageSkeleton } from "@/components/table-page-skeleton";

export default function TestSessionLoading() {
  return (
    <TablePageSkeleton
      activeItem="test-sessions"
      ariaLabel="Loading test session"
      columns={["Test", "Status", "Target", "Attempts", "Duration", "Actions"]}
      icon={FlaskConical}
      title="Test session"
    />
  );
}
