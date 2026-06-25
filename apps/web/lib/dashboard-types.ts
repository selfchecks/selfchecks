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

export type DashboardArtifactType =
  | "json"
  | "log"
  | "request_response"
  | "screenshot"
  | "trace"
  | "video";

export type DashboardRunArtifact = {
  downloadUrl: string;
  id: string;
  mimeType?: string;
  name: string;
  size: string;
  type: DashboardArtifactType;
  viewUrl: string;
};

export type DashboardRunPerformance = {
  errors?: {
    consoleErrors?: number;
    documentErrors?: number;
    networkErrors?: number;
    scriptErrors?: number;
  };
  timings?: {
    dclMs?: number;
    fcpMs?: number;
    lcpMs?: number;
    loadedMs?: number;
    tbtMs?: number;
    ttfbMs?: number;
  };
};

export type DashboardRunRow = {
  artifacts: DashboardRunArtifact[];
  createdAt: string;
  duration: string;
  durationMs?: number;
  errorMessage?: string;
  hasRetries: boolean;
  id: string;
  occurredAt: string;
  performance?: DashboardRunPerformance;
  runner: string;
  runState: DashboardRunState;
  status: DashboardStatus;
};

export type DashboardCheckSettings = {
  enabled: boolean;
  entrypoint?: string;
  frequency: string;
  key: string;
  request?: {
    assertions: number;
    body: boolean;
    headers: number;
    method: string;
    url: string;
  };
};

export type DashboardCheckStats = {
  averageDuration: string;
  failedRuns: string;
  p95Duration: string;
  passedRuns: string;
  totalRuns: string;
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
  runs: DashboardRunRow[];
  settings: DashboardCheckSettings;
  stats: DashboardCheckStats;
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
