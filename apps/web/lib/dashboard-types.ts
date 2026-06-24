export type DashboardStatus = "passing" | "degraded" | "failing";

export type DashboardCheckRow = {
  avg: string;
  ava: string;
  bars: Array<{ tone?: "good" | "warn"; value: number }>;
  delta: string;
  hasTrace?: boolean;
  name: string;
  p95: string;
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
