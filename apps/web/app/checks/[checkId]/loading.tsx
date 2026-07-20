import { Activity } from "lucide-react";

import { TablePageSkeleton } from "@/components/table-page-skeleton";

export default function CheckDetailLoading() {
  return (
    <TablePageSkeleton
      activeItem="home"
      ariaLabel="Loading check details"
      columns={["Run", "Status", "Duration", "Result"]}
      icon={Activity}
      title="Check details"
    />
  );
}
