import { Activity } from "lucide-react";

import { TablePageSkeleton } from "@/components/table-page-skeleton";

export default function RunDetailLoading() {
  return (
    <TablePageSkeleton
      activeItem="home"
      ariaLabel="Loading run details"
      columns={["Field", "Value"]}
      icon={Activity}
      rows={8}
      title="Run details"
    />
  );
}
