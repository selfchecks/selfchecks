import { cn } from "@/lib/utils";

const statusLabels: Record<string, string> = {
  pending: "Pending",
  ready: "Ready",
};

export function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-full border px-2 text-xs font-medium",
        status === "ready"
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border bg-muted text-muted-foreground",
      )}
    >
      {statusLabels[status] ?? status}
    </span>
  );
}
