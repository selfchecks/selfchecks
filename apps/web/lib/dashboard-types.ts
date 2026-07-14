export type DashboardStatus = "passing" | "degraded" | "failing";
export type DashboardRunState =
  | "cancelled"
  | "failed"
  | "not_run"
  | "passed"
  | "queued"
  | "running"
  | "timed_out";
export type DashboardResultTone =
  | "active"
  | "bad"
  | "good"
  | "muted"
  | "queued"
  | "warn";

export type DashboardResultBar = {
  attempts?: Array<{
    duration: string;
    label: string;
    occurredAt: string;
    runner: string;
    runState: DashboardRunState;
    status: DashboardStatus;
    tone?: DashboardResultTone;
  }>;
  duration: string;
  hasRetries?: boolean;
  href?: string;
  occurredAt: string;
  runner: string;
  runState: DashboardRunState;
  status: DashboardStatus;
  tone?: DashboardResultTone;
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

export type DashboardAiAnalysis = {
  apiEndpoint?: string;
  content?: string;
  createdAt?: string;
  error?: string;
  model?: string;
  responseLanguage?: string;
  status: "completed" | "failed";
};

export type DashboardRunRow = {
  aiAnalysis?: DashboardAiAnalysis;
  attempt: number;
  artifacts: DashboardRunArtifact[];
  createdAt: string;
  duration: string;
  durationMs?: number;
  errorMessage?: string;
  hasRetries: boolean;
  id: string;
  maxAttempts: number;
  occurredAt: string;
  performance?: DashboardRunPerformance;
  retryGroupId?: string;
  runner: string;
  runState: DashboardRunState;
  status: DashboardStatus;
  tone?: DashboardResultTone;
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

export type DashboardFirewatchRow = {
  checkId: string;
  firstSeen: string;
  firstSeenAt: string;
  groupName: string;
  lastSeen: string;
  lastSeenAt: string;
  name: string;
  type: DashboardCheckRow["type"];
};

export type DashboardFirewatch = {
  lookbackDays: number;
  rows: DashboardFirewatchRow[];
};

export type DashboardGroupRow = {
  checks: string;
  children?: DashboardCheckRow[];
  expanded?: boolean;
  name: string;
  projectName?: string;
  projectSlug?: string;
  status: DashboardStatus;
  updated: string;
};

export type DashboardSummary = {
  degraded: number;
  failing: number;
  passing: number;
  queued: number;
  running: number;
};

export type DashboardQueueSource = "cli" | "manual" | "schedule";

export type DashboardQueueRow = {
  branch: string;
  checkHref: string;
  checkId: string;
  checkName: string;
  createdAt: string;
  createdAtLabel: string;
  groupName: string;
  projectSlug?: string;
  id: string;
  runState: Extract<DashboardRunState, "queued" | "running">;
  source: DashboardQueueSource;
  sourceLabel: string;
  type: DashboardCheckRow["type"];
};
