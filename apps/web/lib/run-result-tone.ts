import type {
  DashboardResultTone,
  DashboardRunState,
  DashboardStatus,
} from "./dashboard-types";

export function getRunResultTone({
  runState,
  status,
}: {
  runState: DashboardRunState;
  status: DashboardStatus;
}): DashboardResultTone {
  if (runState === "running") {
    return "active";
  }

  if (runState === "queued") {
    return "queued";
  }

  if (runState === "cancelled") {
    return "muted";
  }

  if (status === "passing") {
    return "good";
  }

  if (status === "failing") {
    return "bad";
  }

  return "warn";
}

export function getRunResultToneClassName(tone: DashboardResultTone | undefined) {
  if (tone === "active") {
    return "bg-blue-400";
  }

  if (tone === "bad") {
    return "bg-red-500";
  }

  if (tone === "muted") {
    return "bg-slate-500";
  }

  if (tone === "queued") {
    return "bg-yellow-400";
  }

  if (tone === "warn") {
    return "bg-orange-400";
  }

  return "bg-emerald-400";
}
