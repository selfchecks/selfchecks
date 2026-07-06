import {
  CheckCircle2,
  CircleAlert,
  CircleX,
  Clock3,
  FileArchive,
  FileImage,
  FileJson,
  FileText,
  Video,
  type LucideIcon,
} from "lucide-react";

import type {
  DashboardArtifactType,
  DashboardRunArtifact,
  DashboardRunState,
  DashboardStatus,
} from "@/lib/dashboard-types";
import type { TestSessionRunCountSummary } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";

export const runStateLabels: Record<DashboardRunState, string> = {
  cancelled: "Cancelled",
  failed: "Failed",
  not_run: "Not run",
  passed: "Passed",
  queued: "Queued",
  running: "Running",
  timed_out: "Timed out",
};

const artifactIcons: Record<DashboardArtifactType, LucideIcon> = {
  json: FileJson,
  log: FileText,
  request_response: FileText,
  screenshot: FileImage,
  trace: FileArchive,
  video: Video,
};

export function RunStateBadge({
  runState,
  status,
}: {
  runState: DashboardRunState;
  status: DashboardStatus;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-8 items-center gap-2 rounded-md border px-2 text-xs font-semibold",
        status === "passing" && "border-emerald-700/60 text-emerald-300",
        status === "degraded" && "border-amber-700/60 text-amber-300",
        status === "failing" && "border-red-700/60 text-red-300",
      )}
    >
      <RunStateIcon runState={runState} status={status} />
      {runStateLabels[runState]}
    </span>
  );
}

export function RunStateIcon({
  runState,
  status,
}: {
  runState: DashboardRunState;
  status: DashboardStatus;
}) {
  if (runState === "running") {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500 text-white">
        <Clock3 className="h-3.5 w-3.5" />
      </span>
    );
  }

  if (runState === "queued" || status === "degraded") {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-400 text-amber-950">
        <CircleAlert className="h-3.5 w-3.5" />
      </span>
    );
  }

  if (status === "passing") {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
        <CheckCircle2 className="h-3.5 w-3.5" />
      </span>
    );
  }

  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-500 text-white">
      <CircleX className="h-3.5 w-3.5" />
    </span>
  );
}

export function SummaryPills({ summary }: { summary: TestSessionRunCountSummary }) {
  const values = [
    { className: "text-slate-300", label: "Total", value: summary.total },
    { className: "text-emerald-300", label: "Passed", value: summary.passed },
    { className: "text-red-300", label: "Failed", value: summary.failed },
    { className: "text-blue-300", label: "Running", value: summary.running },
    { className: "text-amber-300", label: "Queued", value: summary.queued },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {values.map((item) => (
        <span
          className="inline-flex h-7 items-center gap-1 rounded border border-slate-700 px-2 text-xs text-slate-500"
          key={item.label}
        >
          {item.label}
          <span className={cn("font-semibold", item.className)}>{item.value}</span>
        </span>
      ))}
    </div>
  );
}

export function ArtifactSummary({ artifacts }: { artifacts: DashboardRunArtifact[] }) {
  if (artifacts.length === 0) {
    return <span className="text-slate-600">-</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {artifacts.slice(0, 5).map((artifact) => {
        const Icon = artifactIcons[artifact.type];

        return (
          <span
            className="inline-flex h-7 items-center gap-1 rounded border border-slate-700 px-2 text-xs text-slate-300"
            key={artifact.id}
            title={`${artifact.name} (${artifact.size})`}
          >
            <Icon className="h-3.5 w-3.5" />
            {artifact.type}
          </span>
        );
      })}
      {artifacts.length > 5 ? (
        <span className="inline-flex h-7 items-center rounded border border-slate-700 px-2 text-xs text-slate-500">
          +{artifacts.length - 5}
        </span>
      ) : null}
    </div>
  );
}
