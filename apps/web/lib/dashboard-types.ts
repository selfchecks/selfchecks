export type DashboardStatus = "passing" | "degraded" | "failing";
export type DashboardRunState =
  | "cancelled"
  | "failed"
  | "not_run"
  | "passed"
  | "queued"
  | "running"
  | "timed_out";

export type DashboardResultBar = {
  duration: string;
  occurredAt: string;
  runner: string;
  runState: DashboardRunState;
  status: DashboardStatus;
  tone?: "active" | "good" | "warn";
  value: number;
};

export type DashboardCheckRow = {
  avg: string;
  ava: string;
  bars: DashboardResultBar[];
  delta: string;
  hasTrace?: boolean;
  id: string;
  name: string;
  p95: string;
  runState: DashboardRunState;
  status: DashboardStatus;
  tags: string[];
  time: string;
  type: "api" | "browser";
};

export type DashboardGroupRow = {
  checks: string;
  children?: DashboardCheckRow[];
  expanded?: boolean;
  name: string;
  status: DashboardStatus;
  updated: string;
};

export type DashboardSummary = {
  degraded: number;
  failing: number;
  passing: number;
};
