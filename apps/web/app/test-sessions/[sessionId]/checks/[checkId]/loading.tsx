import { FlaskConical } from "lucide-react";

import { TablePageSkeleton } from "@/components/table-page-skeleton";

export default function TestSessionCheckLoading() {
  return (
    <TablePageSkeleton
      activeItem="test-sessions"
      ariaLabel="Loading test session check"
      columns={["Run", "Status", "Attempt", "Duration", "Error"]}
      icon={FlaskConical}
      title="Test session check"
    />
  );
}
