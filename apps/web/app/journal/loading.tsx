import { History } from "lucide-react";

import { TablePageSkeleton } from "@/components/table-page-skeleton";

export default function JournalLoading() {
  return (
    <TablePageSkeleton
      activeItem="journal"
      ariaLabel="Loading journal"
      columns={[
        "Run",
        "Status",
        "Check",
        "Project",
        "Type",
        "Schedule",
        "Duration",
        "Actions",
      ]}
      filters={6}
      icon={History}
      title="Journal"
    />
  );
}
