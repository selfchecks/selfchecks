import type {
  DashboardCheckRow,
  DashboardGroupRow,
  DashboardRunState,
  DashboardStatus,
  DashboardSummary,
} from "./dashboard-types";
import { prisma } from "./prisma";

type DashboardData = {
  groups: DashboardGroupRow[];
  projectSlug: string;
  summary: DashboardSummary;
};

type CheckWithRuns = Awaited<ReturnType<typeof fetchChecks>>[number];

export async function getDashboardData(projectSlug: string): Promise<DashboardData> {
  try {
    const project =
      (await prisma.project.findUnique({
        select: {
          id: true,
          slug: true,
        },
        where: {
          slug: projectSlug,
        },
      })) ??
      (await prisma.project.findFirst({
        orderBy: {
          createdAt: "desc",
        },
        select: {
          id: true,
          slug: true,
        },
      }));

    if (!project) {
      return createEmptyDashboard(projectSlug);
    }

    const checks = await fetchChecks(project.id);
    const groups = buildGroups(checks);

    return {
      groups,
      projectSlug: project.slug,
      summary: summarizeGroups(groups),
    };
  } catch (error) {
    console.warn("Unable to load dashboard data.", error);
    return createEmptyDashboard(projectSlug);
  }
}

async function fetchChecks(projectId: string) {
  return prisma.check.findMany({
    include: {
      group: true,
      runs: {
        orderBy: {
          createdAt: "desc",
        },
        take: 24,
      },
    },
    orderBy: [
      {
        group: {
          name: "asc",
        },
      },
      {
        name: "asc",
      },
    ],
    where: {
      enabled: true,
      projectId,
    },
  });
}

function buildGroups(checks: CheckWithRuns[]): DashboardGroupRow[] {
  const grouped = new Map<string, CheckWithRuns[]>();

  for (const check of checks) {
    const groupName = check.group?.name ?? "Ungrouped";
    grouped.set(groupName, [...(grouped.get(groupName) ?? []), check]);
  }

  return [...grouped.entries()].map(([name, groupChecks], index) => {
    const children = groupChecks.map(mapCheck);

    return {
      checks: `${children.length} checks`,
      children,
      expanded: index === 0,
      name,
      status: summarizeStatus(children.map((check) => check.status)),
      updated: formatLatestUpdate(groupChecks),
    };
  });
}

function mapCheck(check: CheckWithRuns): DashboardCheckRow {
  const latestRun = check.runs[0];
  const durations = check.runs
    .map((run) => run.durationMs)
    .filter((duration): duration is number => typeof duration === "number");

  return {
    avg: formatDuration(average(durations)),
    ava: formatAvailability(check.runs),
    bars: buildBars(check.runs),
    delta: latestRun ? "24 h" : "-",
    hasTrace: Boolean(check.runs.some((run) => run.logsPath)),
    id: check.id,
    name: check.name,
    p95: formatDuration(percentile(durations, 0.95)),
    runState: mapRunState(latestRun?.status),
    status: mapRunStatus(latestRun?.status),
    tags: check.tags,
    time: formatRunAge(latestRun),
    type: check.type.toLowerCase() as DashboardCheckRow["type"],
  };
}

function summarizeGroups(groups: DashboardGroupRow[]): DashboardSummary {
  return groups
    .flatMap((group) => group.children ?? [])
    .reduce<DashboardSummary>(
      (summary, check) => ({
        ...summary,
        [check.status]: summary[check.status] + 1,
      }),
      {
        degraded: 0,
        failing: 0,
        passing: 0,
      },
    );
}

function summarizeStatus(statuses: DashboardStatus[]): DashboardStatus {
  if (statuses.includes("failing")) {
    return "failing";
  }

  if (statuses.includes("degraded")) {
    return "degraded";
  }

  return "passing";
}

function mapRunStatus(status: string | undefined): DashboardStatus {
  if (status === "PASSED") {
    return "passing";
  }

  if (status === "FAILED" || status === "TIMED_OUT" || status === "CANCELLED") {
    return "failing";
  }

  return "degraded";
}

function mapRunState(status: string | undefined): DashboardRunState {
  if (status === "QUEUED") {
    return "queued";
  }

  if (status === "RUNNING") {
    return "running";
  }

  if (status === "PASSED") {
    return "passed";
  }

  if (status === "FAILED") {
    return "failed";
  }

  if (status === "TIMED_OUT") {
    return "timed_out";
  }

  if (status === "CANCELLED") {
    return "cancelled";
  }

  return "not_run";
}

function buildBars(runs: CheckWithRuns["runs"]): DashboardCheckRow["bars"] {
  if (runs.length === 0) {
    return Array.from({ length: 12 }, () => ({
      duration: "-",
      occurredAt: "No recorded run",
      runner: "Local runner",
      runState: "not_run" as const,
      status: "degraded" as const,
      tone: "warn" as const,
      value: 12,
    }));
  }

  return [...runs].reverse().map((run) => ({
    duration: formatDuration(run.durationMs ?? undefined),
    occurredAt: formatBarTimestamp(run),
    runner: "Local runner",
    runState: mapRunState(run.status),
    status: mapRunStatus(run.status),
    tone:
      run.status === "RUNNING" ? "active" : run.status === "PASSED" ? "good" : "warn",
    value: Math.max(8, Math.min(44, Math.round((run.durationMs ?? 500) / 40))),
  }));
}

function average(values: number[]): number | undefined {
  if (values.length === 0) {
    return undefined;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values: number[], ratio: number): number | undefined {
  if (values.length === 0) {
    return undefined;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1);

  return sorted[index];
}

function formatAvailability(runs: CheckWithRuns["runs"]): string {
  if (runs.length === 0) {
    return "-";
  }

  const passed = runs.filter((run) => run.status === "PASSED").length;

  return `${Math.round((passed / runs.length) * 100)}%`;
}

function formatDuration(value: number | undefined): string {
  if (typeof value !== "number") {
    return "-";
  }

  if (value >= 1000) {
    return `${(value / 1000).toFixed(2)} s`;
  }

  return `${Math.round(value)} ms`;
}

function formatRunAge(run: CheckWithRuns["runs"][number] | undefined): string {
  if (!run) {
    return "not run yet";
  }

  if (run.status === "QUEUED") {
    return "queued";
  }

  if (run.status === "RUNNING") {
    return "running";
  }

  return formatRelative(run.createdAt);
}

function formatBarTimestamp(run: CheckWithRuns["runs"][number]): string {
  if (run.status === "QUEUED") {
    return "Queued";
  }

  if (run.status === "RUNNING") {
    return "Running";
  }

  return formatRunTimestamp(run.createdAt);
}

function formatRunTimestamp(date: Date): string {
  const month = date.toLocaleString("en", { month: "short" });
  const day = date.toLocaleString("en", { day: "2-digit" });
  const hour = date.toLocaleString("en", {
    hour: "2-digit",
    hour12: false,
  });
  const minute = date.toLocaleString("en", { minute: "2-digit" });

  return `${month} ${day} ${hour}:${minute} (${formatTimezoneOffset(date)})`;
}

function formatTimezoneOffset(date: Date): string {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteMinutes = Math.abs(offsetMinutes);
  const hours = Math.trunc(absoluteMinutes / 60);
  const minutes = absoluteMinutes % 60;

  if (minutes === 0) {
    return `UTC${sign}${hours}`;
  }

  return `UTC${sign}${hours}:${String(minutes).padStart(2, "0")}`;
}

function formatLatestUpdate(checks: CheckWithRuns[]): string {
  const dates = checks
    .map((check) => check.runs[0]?.createdAt)
    .filter((date): date is Date => date instanceof Date);

  if (dates.length === 0) {
    return "not run yet";
  }

  return formatRelative(new Date(Math.max(...dates.map((date) => date.getTime()))));
}

function formatRelative(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.max(0, Math.round(diffMs / 60000));

  if (minutes < 1) {
    return "less than a minute ago";
  }

  if (minutes < 60) {
    return `${minutes} minutes ago`;
  }

  const hours = Math.round(minutes / 60);

  if (hours < 24) {
    return `about ${hours} hours ago`;
  }

  return `at ${date.toLocaleString("en", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  })}`;
}

function createEmptyDashboard(projectSlug: string): DashboardData {
  return {
    groups: [],
    projectSlug,
    summary: {
      degraded: 0,
      failing: 0,
      passing: 0,
    },
  };
}
