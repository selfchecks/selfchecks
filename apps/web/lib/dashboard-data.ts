import path from "node:path";
import { readFile } from "node:fs/promises";

import type { Prisma } from "@prisma/client";
import {
  defaultDegradedResponseTimeMs,
  summarizeTerminalRunStatuses,
} from "@selfchecks/core";

import type {
  DashboardAiAnalysis,
  DashboardCheckRow,
  DashboardFirewatch,
  DashboardFirewatchRow,
  DashboardGroupRow,
  DashboardQueueRow,
  DashboardQueueSource,
  DashboardRunArtifact,
  DashboardRunPerformance,
  DashboardRunRow,
  DashboardRunState,
  DashboardResultTone,
  DashboardStatus,
  DashboardSummary,
} from "./dashboard-types";
import { getArtifactFileName } from "./artifact-names";
import { prisma } from "./prisma";
import { getRunResultTone } from "./run-result-tone";
import { getRuntimeTimeZone } from "./runtime-config";
import { getTestSessionSourceBranch } from "./test-session-source";

const FIREWATCH_LOOKBACK_DAYS = 7;
const MAX_LOG_PREVIEW_CHARS = 12_000;
const DASHBOARD_RESULT_BAR_COUNT = 24;
const MAX_RESULT_BAR_HEIGHT = 44;
const MIN_RESULT_BAR_HEIGHT = 8;
const activeSessionStatuses = ["QUEUED", "RUNNING"];
const TEST_SESSION_FINALIZATION_GRACE_MS = 60_000;

type DashboardData = {
  firewatch: DashboardFirewatch;
  groups: DashboardGroupRow[];
  projectSlug: string;
  queue: DashboardQueueRow[];
  revision: string;
  summary: DashboardSummary;
};
type DashboardDataOptions = {
  onError?: "empty" | "throw";
};

export type DashboardActivityData = {
  projectSlug: string;
  queued: number;
  revision: string;
  running: number;
};

export type DashboardQueueData = {
  projectSlug: string;
  queue: DashboardQueueRow[];
  summary: DashboardSummary;
};

export type TestSessionRunCountSummary = {
  failed: number;
  passed: number;
  queued: number;
  regress: number;
  running: number;
  total: number;
};

export type TestSessionRow = {
  commitSha?: string;
  createdAt: string;
  createdAtLabel: string;
  duration: string;
  href: string;
  id: string;
  jobUrl?: string;
  name?: string;
  pipelineUrl?: string;
  projectSlug?: string;
  ref?: string;
  repository?: string;
  runState: DashboardRunState;
  source?: string;
  status: DashboardStatus;
  summary: TestSessionRunCountSummary;
  targetUrl?: string;
  tone?: DashboardResultTone;
  workspacePath?: string;
};

export type TestSessionsData = {
  filters: {
    page: number;
    pageSize: number;
    project?: string;
    query: string;
    sessionName: string;
  };
  pagination: {
    from: number;
    hasNext: boolean;
    hasPrevious: boolean;
    page: number;
    pageSize: number;
    to: number;
    total: number;
    totalPages: number;
  };
  projectSlug: string;
  projects?: ProjectFilterOption[];
  sessions: TestSessionRow[];
};

export type TestSessionsDataOptions = {
  page?: number;
  pageSize?: number;
  project?: string;
  query?: string;
  sessionName?: string;
};

export type TestSessionCheckRow = {
  aiAnalysis?: DashboardAiAnalysis;
  checkHref: string;
  checkId: string;
  checkKey: string;
  checkName: string;
  checkType: DashboardCheckRow["type"];
  duration: string;
  groupName: string;
  latestRunHref: string;
  latestRunOccurredAt: string;
  projectSlug: string;
  isRegress: boolean;
  runCount: number;
  runState: DashboardRunState;
  status: DashboardStatus;
  target: string;
  tone?: DashboardResultTone;
};

export type TestSessionDetailData = {
  projectSlug: string;
  session: TestSessionRow & {
    checks: TestSessionCheckRow[];
  };
};

export type TestSessionCheckDetailData = {
  check: {
    id: string;
    key: string;
    name: string;
    tags: string[];
    target: string;
    type: DashboardCheckRow["type"];
  };
  groupName: string;
  projectSlug: string;
  runs: Array<
    DashboardRunRow & {
      runHref: string;
    }
  >;
  session: TestSessionRow;
};

export type JournalRangeFilter = "24h" | "7d" | "30d" | "all";
export type JournalRunStatusFilter =
  | "all"
  | "cancelled"
  | "failed"
  | "passed"
  | "queued"
  | "running"
  | "timed_out";
export type JournalRunTypeFilter = "all" | DashboardCheckRow["type"];

export type JournalDataOptions = {
  page?: number;
  pageSize?: number;
  project?: string;
  query?: string;
  range?: JournalRangeFilter;
  status?: JournalRunStatusFilter;
  type?: JournalRunTypeFilter;
};

export type JournalRunRow = DashboardRunRow & {
  checkHref: string;
  checkId: string;
  checkKey: string;
  checkName: string;
  checkTags: string[];
  checkType: DashboardCheckRow["type"];
  createdAtLabel: string;
  groupName: string;
  projectSlug?: string;
  runHref: string;
  schedule: string;
  sessionName?: string;
};

export type JournalData = {
  filters: {
    page: number;
    pageSize: number;
    project?: string;
    query: string;
    range: JournalRangeFilter;
    status: JournalRunStatusFilter;
    type: JournalRunTypeFilter;
  };
  pagination: {
    from: number;
    hasNext: boolean;
    hasPrevious: boolean;
    page: number;
    pageSize: number;
    to: number;
    total: number;
    totalPages: number;
  };
  projectSlug: string;
  projects?: ProjectFilterOption[];
  runs: JournalRunRow[];
};

export type StatusLogRow = {
  checkHref: string;
  checkId: string;
  checkKey: string;
  checkName: string;
  checkType: DashboardCheckRow["type"];
  createdAt: string;
  createdAtLabel: string;
  fromStatus: DashboardStatus;
  groupName: string;
  id: string;
  projectSlug: string;
  runHref: string;
  toStatus: DashboardStatus;
};

export type StatusLogsDataOptions = {
  page?: number;
  pageSize?: number;
};

export type StatusLogsData = {
  logs: StatusLogRow[];
  pagination: {
    from: number;
    hasNext: boolean;
    hasPrevious: boolean;
    page: number;
    pageSize: number;
    to: number;
    total: number;
    totalPages: number;
  };
  projectSlug: string;
};

export type ProjectFilterOption = {
  name: string;
  slug: string;
};

export type CheckDetailData = {
  check: DashboardCheckRow;
  groupName: string;
  projectSlug: string;
  updated: string;
};

export type RunDetailData = {
  check: {
    id: string;
    name: string;
    settings: DashboardCheckRow["settings"];
    tags: string[];
    type: DashboardCheckRow["type"];
  };
  groupName: string;
  projectSlug: string;
  run: DashboardRunRow & {
    aiAnalysis?: {
      apiEndpoint?: string;
      content?: string;
      createdAt?: string;
      error?: string;
      model?: string;
      responseLanguage?: string;
      status: "completed" | "failed";
    };
    attemptNumber: number;
    attempts: Array<{
      createdAtLabel: string;
      duration: string;
      href: string;
      id: string;
      isCurrent: boolean;
      label: string;
      runState: DashboardRunState;
      status: DashboardStatus;
      tone?: DashboardResultTone;
    }>;
    createdAtLabel: string;
    failedAttempts: number;
    finishedAt: string;
    jobLog?: string;
    maxAttempts: number;
    request?: {
      assertions: Array<{
        actual: string;
        comparison: string;
        passed?: boolean;
        source: string;
        target: string;
      }>;
      body?: string;
      headers: Array<{
        name: string;
        value: string;
      }>;
      method: string;
      queryParams: Array<{
        name: string;
        value: string;
      }>;
      url: string;
    };
    response?: {
      body?: string;
      headers: Array<{
        name: string;
        value: string;
      }>;
      status?: string;
      statusText?: string;
      url?: string;
    };
    resultFields: Array<{
      label: string;
      value: string;
    }>;
    resultJson: string;
    startedAt: string;
  };
};

type CheckRunWhere = NonNullable<
  NonNullable<Parameters<typeof prisma.checkRun.findMany>[0]>["where"]
>;
type MappableRun = {
  artifacts: Array<{
    id: string;
    mimeType: string | null;
    path: string;
    sizeBytes: number | null;
    type: string;
  }>;
  createdAt: Date;
  durationMs: number | null;
  errorMessage: string | null;
  finishedAt?: Date | null;
  hasTrace?: boolean;
  checkId?: string | null;
  checkSnapshotDegradedResponseTime?: number | null;
  checkSnapshotEntrypoint?: string | null;
  checkSnapshotGroupName?: string | null;
  checkSnapshotKey?: string | null;
  checkSnapshotName?: string | null;
  checkSnapshotProjectSlug?: string | null;
  checkSnapshotRequest?: unknown;
  checkSnapshotTags?: string[];
  checkSnapshotType?: string | null;
  commitSha?: string | null;
  id: string;
  gitRef?: string | null;
  logsPath: string | null;
  attempt?: number | null;
  maxAttempts?: number | null;
  result: unknown;
  retryGroupId?: string | null;
  runSource?: string | null;
  startedAt?: Date | null;
  status: string;
};
type CheckWithRuns = {
  degradedResponseTime: number | null;
  enabled: boolean;
  entrypoint: string | null;
  firstFailingAt?: Date | null;
  frequencyMinutes: number | null;
  group: {
    name: string;
  } | null;
  id: string;
  key: string;
  name: string;
  project?: {
    name?: string;
    slug: string;
  };
  request: unknown;
  runs: MappableRun[];
  tags: string[];
  type: string;
};
type DashboardRunRecord = MappableRun & {
  checkId: string;
  firstFailingAt: Date | null;
  hasTrace: boolean;
};
type TestSessionRunWithCheck = MappableRun & {
  check: {
    degradedResponseTime: number | null;
    enabled: boolean;
    entrypoint: string | null;
    frequencyMinutes?: number | null;
    group: {
      name: string;
    } | null;
    id: string;
    key: string;
    name: string;
    project?: {
      slug: string;
    };
    request: unknown;
    tags: string[];
    type: string;
  } | null;
  checkId: string | null;
};
type TestSessionWithRuns = {
  commitSha: string | null;
  createdAt: Date;
  id: string;
  jobUrl: string | null;
  name: string | null;
  pipelineUrl: string | null;
  project: {
    slug: string;
  };
  ref: string | null;
  repository: string | null;
  runs: TestSessionRunWithCheck[];
  source: string | null;
  status: string;
  targetUrl: string | null;
  workspacePath: string | null;
};
type DashboardBaselineCheck = {
  key: string;
  project: {
    slug: string;
  };
  runs: Array<{
    status: string;
  }>;
};
type RunCheckSnapshot = {
  degradedResponseTime: number | null;
  entrypoint: string | null;
  groupName: string;
  id: string;
  key: string;
  name: string;
  projectSlug: string;
  request: unknown;
  tags: string[];
  type: string;
};
type JournalRunWithCheck = MappableRun & {
  check: {
    degradedResponseTime: number | null;
    frequencyMinutes: number | null;
    group: {
      name: string;
    } | null;
    id: string;
    key: string;
    name: string;
    project?: {
      slug: string;
    };
    tags: string[];
    type: string;
  };
  testSession: {
    name: string | null;
  } | null;
};
type ActiveQueueRunWithCheck = MappableRun & {
  check: {
    enabled: boolean;
    entrypoint: string | null;
    group: {
      name: string;
    } | null;
    id: string;
    key: string;
    name: string;
    project: {
      slug: string;
    };
    request: unknown;
    tags: string[];
    type: string;
  } | null;
  checkId: string | null;
  testSession: {
    id: string;
    kind: "TEST" | "TRIGGER";
    ref: string | null;
    source: string | null;
  } | null;
  testSessionId: string | null;
  project: {
    slug: string;
  };
};
type StatusLogQueryRow = {
  checkId: string | null;
  checkKey: string | null;
  checkName: string | null;
  checkType: string | null;
  createdAt: Date | null;
  fromStatus: DashboardStatus | null;
  groupName: string | null;
  id: string | null;
  page: number;
  projectSlug: string | null;
  toStatus: DashboardStatus | null;
  total: number;
  totalPages: number;
};

const JOURNAL_DEFAULT_PAGE_SIZE = 20;
const JOURNAL_MAX_PAGE_SIZE = 100;
const STATUS_LOGS_DEFAULT_PAGE_SIZE = 20;
const STATUS_LOGS_MAX_PAGE_SIZE = 100;
const TEST_SESSIONS_DEFAULT_PAGE_SIZE = 20;
const TEST_SESSIONS_MAX_PAGE_SIZE = 100;
const DASHBOARD_ACTIVE_RUN_STATUSES = ["QUEUED", "RUNNING"] as const;

export async function getDashboardData(
  _projectSlug = "default",
  options: DashboardDataOptions = {},
): Promise<DashboardData> {
  const timeZone = getRuntimeTimeZone();

  try {
    const [checks, queue, latestTerminalRun] = await Promise.all([
      fetchChecks(),
      fetchActiveQueue(timeZone),
      fetchLatestTerminalRevisionRun(),
    ]);
    const groups = buildGroups(checks, timeZone);

    return {
      firewatch: buildFirewatch(checks, timeZone),
      groups,
      projectSlug: "default",
      queue,
      revision: formatDashboardRevision(
        queue.map((run) => ({
          id: run.id,
          status: run.runState.toUpperCase(),
        })),
        latestTerminalRun,
      ),
      summary: applyQueueCounts(summarizeGroups(groups), queue),
    };
  } catch (error) {
    console.warn("Unable to load dashboard data.", error);

    if (options.onError === "throw") {
      throw error;
    }

    return createEmptyDashboard("default");
  }
}

export async function getDashboardActivityData(
  _projectSlug = "default",
): Promise<DashboardActivityData> {
  const [runs, latestTerminalRun] = await Promise.all([
    prisma.checkRun.findMany({
      orderBy: {
        id: "asc",
      },
      select: {
        id: true,
        status: true,
        testSession: {
          select: {
            kind: true,
          },
        },
      },
      where: {
        status: {
          in: [...DASHBOARD_ACTIVE_RUN_STATUSES],
        },
      },
    }),
    fetchLatestTerminalRevisionRun(),
  ]);
  const dashboardRuns = runs.filter((run) => run.testSession?.kind !== "TEST");

  return {
    projectSlug: "default",
    queued: runs.filter((run) => run.status === "QUEUED").length,
    revision: formatDashboardRevision(dashboardRuns, latestTerminalRun),
    running: runs.filter((run) => run.status === "RUNNING").length,
  };
}

export async function getDashboardQueueData(
  _projectSlug = "default",
  options: DashboardDataOptions = {},
): Promise<DashboardQueueData> {
  const timeZone = getRuntimeTimeZone();

  try {
    const queue = await fetchActiveQueue(timeZone, { includeTestSessions: true });

    return {
      projectSlug: "default",
      queue,
      summary: applyQueueCounts(createEmptyDashboard("default").summary, queue),
    };
  } catch (error) {
    console.warn("Unable to load dashboard queue data.", error);

    if (options.onError === "throw") {
      throw error;
    }

    const dashboard = createEmptyDashboard("default");

    return {
      projectSlug: dashboard.projectSlug,
      queue: dashboard.queue,
      summary: dashboard.summary,
    };
  }
}

export async function getCheckDetailShellData(
  checkId: string,
): Promise<CheckDetailData | undefined> {
  const timeZone = getRuntimeTimeZone();

  try {
    const check = await prisma.check.findFirst({
      select: {
        degradedResponseTime: true,
        enabled: true,
        entrypoint: true,
        frequencyMinutes: true,
        group: {
          select: {
            name: true,
          },
        },
        id: true,
        key: true,
        name: true,
        project: {
          select: {
            slug: true,
          },
        },
        request: true,
        runs: {
          orderBy: {
            createdAt: "desc",
          },
          where: buildDashboardVisibleRunWhere(),
          select: {
            artifacts: {
              orderBy: {
                createdAt: "desc",
              },
              select: {
                id: true,
                mimeType: true,
                path: true,
                sizeBytes: true,
                type: true,
              },
            },
            checkSnapshotDegradedResponseTime: true,
            checkSnapshotType: true,
            createdAt: true,
            durationMs: true,
            errorMessage: true,
            id: true,
            logsPath: true,
            attempt: true,
            maxAttempts: true,
            retryGroupId: true,
            status: true,
          },
          take: 1,
        },
        tags: true,
        type: true,
      },
      where: {
        enabled: true,
        id: checkId,
      },
    });

    if (!check) {
      return undefined;
    }

    const shellCheck: CheckWithRuns = {
      degradedResponseTime: check.degradedResponseTime,
      enabled: check.enabled,
      entrypoint: check.entrypoint,
      frequencyMinutes: check.frequencyMinutes,
      group: check.group,
      id: check.id,
      key: check.key,
      name: check.name,
      request: check.request,
      runs: check.runs.map((run) => ({
        ...run,
        result: null,
      })),
      tags: check.tags,
      type: check.type,
    };

    return {
      check: mapCheck(shellCheck, timeZone, "latest"),
      groupName: check.group?.name ?? "Ungrouped",
      projectSlug: check.project.slug,
      updated: formatLatestUpdate([shellCheck], timeZone),
    };
  } catch (error) {
    console.warn("Unable to load check detail shell data.", error);
    return undefined;
  }
}

export async function getCheckDetailData(
  checkId: string,
): Promise<CheckDetailData | undefined> {
  const timeZone = getRuntimeTimeZone();

  try {
    const check = await prisma.check.findFirst({
      include: {
        group: true,
        project: {
          select: {
            slug: true,
          },
        },
        runs: {
          include: {
            artifacts: {
              orderBy: {
                createdAt: "desc",
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
          where: buildDashboardVisibleRunWhere(),
          take: 50,
        },
      },
      where: {
        enabled: true,
        id: checkId,
      },
    });

    if (!check) {
      return undefined;
    }

    return {
      check: mapCheck(check, timeZone, "all"),
      groupName: check.group?.name ?? "Ungrouped",
      projectSlug: check.project.slug,
      updated: formatLatestUpdate([check], timeZone),
    };
  } catch (error) {
    console.warn("Unable to load check detail data.", error);
    return undefined;
  }
}

export async function getRunDetailData(
  checkId: string,
  runId: string,
): Promise<RunDetailData | undefined> {
  const timeZone = getRuntimeTimeZone();

  try {
    const run = await prisma.checkRun.findFirst({
      include: {
        artifacts: {
          orderBy: {
            createdAt: "desc",
          },
        },
        check: {
          include: {
            group: true,
            project: {
              select: {
                slug: true,
              },
            },
          },
        },
      },
      where: {
        id: runId,
        OR: [
          {
            check: {
              enabled: true,
              id: checkId,
            },
          },
          {
            checkSnapshotKey: checkId,
          },
          {
            id: checkId,
          },
        ],
      },
    });

    if (!run) {
      return undefined;
    }

    const check = getRunCheckSnapshot(run as TestSessionRunWithCheck);
    const request = formatRunRequest(check.request, run.result);
    const [attemptRuns, jobLog] = await Promise.all([
      fetchRunAttempts(run as MappableRun),
      readRunLogPreview(run.logsPath),
    ]);
    const attempts = attemptRuns.map((attemptRun) =>
      mapAttemptNavigationRun(attemptRun, check, run.id, timeZone),
    );
    const maxAttempts = Math.max(getRunMaxAttempts(run), attempts.length);

    return {
      check: {
        id: check.id,
        name: check.name,
        settings: {
          enabled: run.check?.enabled ?? false,
          entrypoint: check.entrypoint ?? undefined,
          frequency:
            typeof run.check?.frequencyMinutes === "number"
              ? `${run.check.frequencyMinutes} min`
              : "manual",
          key: check.key,
          request: formatRequestSettings(check.request),
        },
        tags: check.tags,
        type: check.type.toLowerCase() as DashboardCheckRow["type"],
      },
      groupName: check.groupName,
      projectSlug: check.projectSlug,
      run: {
        ...mapRun(run, timeZone, check),
        attemptNumber: getRunAttempt(run),
        attempts,
        aiAnalysis: formatAiAnalysis(run.result),
        createdAtLabel: formatRunTimestamp(run.createdAt, timeZone),
        failedAttempts: attempts.filter((attempt) => attempt.status === "failing")
          .length,
        finishedAt: run.finishedAt ? formatRunTimestamp(run.finishedAt, timeZone) : "-",
        jobLog,
        maxAttempts,
        request,
        response: formatRunResponse(run.result),
        resultFields: formatResultFields(run.result),
        resultJson: formatResultJson(run.result),
        startedAt: run.startedAt ? formatRunTimestamp(run.startedAt, timeZone) : "-",
      },
    };
  } catch (error) {
    console.warn("Unable to load run detail data.", error);
    return undefined;
  }
}

export async function getJournalData(
  _projectSlug: string,
  options: JournalDataOptions = {},
): Promise<JournalData> {
  const filters = normalizeJournalFilters(options);
  const timeZone = getRuntimeTimeZone();

  try {
    const projects = await listProjectFilterOptions();
    const selectedProject = projects.find(
      (project) => project.slug === filters.project,
    );
    const where = buildJournalWhere(
      filters.project === "all" ? undefined : (selectedProject?.slug ?? "__missing__"),
      filters,
    );
    const total = await prisma.checkRun.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));
    const page = Math.min(filters.page, totalPages);
    const skip = (page - 1) * filters.pageSize;
    const runs = await prisma.checkRun.findMany({
      include: {
        artifacts: {
          orderBy: {
            createdAt: "desc",
          },
        },
        check: {
          include: {
            group: true,
            project: {
              select: {
                slug: true,
              },
            },
          },
        },
        testSession: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: filters.pageSize,
      where,
    });

    const journalRuns = runs.filter(hasJournalCheck);

    return {
      filters: {
        ...filters,
        page,
      },
      pagination: {
        from: total === 0 ? 0 : skip + 1,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
        page,
        pageSize: filters.pageSize,
        to: skip + journalRuns.length,
        total,
        totalPages,
      },
      projectSlug: "all",
      projects,
      runs: journalRuns.map((run) => mapJournalRun(run, timeZone)),
    };
  } catch (error) {
    console.warn("Unable to load journal data.", error);
    return createEmptyJournal(filters, []);
  }
}

export async function getStatusLogsData(
  _projectSlug: string,
  options: StatusLogsDataOptions = {},
): Promise<StatusLogsData> {
  const pageSize = clampInteger(
    options.pageSize,
    STATUS_LOGS_DEFAULT_PAGE_SIZE,
    1,
    STATUS_LOGS_MAX_PAGE_SIZE,
  );
  const requestedPage = clampInteger(options.page, 1, 1, Number.MAX_SAFE_INTEGER);
  const timeZone = getRuntimeTimeZone();

  try {
    const rows = await prisma.$queryRaw<StatusLogQueryRow[]>`
      WITH params AS (
        SELECT
          ${pageSize}::int AS "pageSize",
          ${requestedPage}::int AS "requestedPage",
          ${defaultDegradedResponseTimeMs}::int AS "defaultDegradedResponseTime"
      ),
      status_history AS MATERIALIZED (
        SELECT
          run."id",
          run."checkId",
          run."createdAt",
          CASE
            WHEN
              run."status" = 'PASSED'::"CheckRunStatus"
              AND COALESCE(run."checkSnapshotType", check_row."type") = 'API'::"CheckType"
              AND run."durationMs" IS NOT NULL
              AND run."durationMs" > COALESCE(
                run."checkSnapshotDegradedResponseTime",
                check_row."degradedResponseTime",
                params."defaultDegradedResponseTime"
              )
              THEN 'degraded'
            WHEN run."status" = 'PASSED'::"CheckRunStatus" THEN 'passing'
            ELSE 'failing'
          END AS "toStatus"
        FROM "CheckRun" AS run
        INNER JOIN "Check" AS check_row
          ON check_row."id" = run."checkId" AND check_row."enabled" = true
        LEFT JOIN "TestSession" AS session ON session."id" = run."testSessionId"
        CROSS JOIN params
        WHERE
          run."status" NOT IN (
            'QUEUED'::"CheckRunStatus",
            'RUNNING'::"CheckRunStatus"
          )
          AND (
            run."testSessionId" IS NULL
            OR session."kind" <> 'TEST'::"TestSessionKind"
          )
      ),
      status_changes AS MATERIALIZED (
        SELECT
          status_history.*,
          LAG("toStatus") OVER (
            PARTITION BY "checkId"
            ORDER BY "createdAt" ASC, "id" ASC
          ) AS "fromStatus"
        FROM status_history
      ),
      transitions AS MATERIALIZED (
        SELECT *
        FROM status_changes
        WHERE "fromStatus" IS NOT NULL AND "fromStatus" <> "toStatus"
      ),
      page_info AS (
        SELECT
          COUNT(*)::int AS "total",
          GREATEST(
            1,
            CEIL(COUNT(*)::numeric / params."pageSize")::int
          ) AS "totalPages",
          LEAST(
            params."requestedPage",
            GREATEST(
              1,
              CEIL(COUNT(*)::numeric / params."pageSize")::int
            )
          ) AS "page",
          params."pageSize"
        FROM transitions
        CROSS JOIN params
        GROUP BY params."pageSize", params."requestedPage"
      ),
      page_rows AS (
        SELECT transitions.*
        FROM transitions
        ORDER BY "createdAt" DESC, "id" DESC
        LIMIT (SELECT "pageSize" FROM page_info)
        OFFSET (
          SELECT ("page" - 1) * "pageSize"
          FROM page_info
        )
      )
      SELECT
        page_info."total",
        page_info."totalPages",
        page_info."page",
        page_rows."id",
        page_rows."checkId",
        page_rows."createdAt",
        page_rows."fromStatus",
        page_rows."toStatus",
        check_row."key" AS "checkKey",
        check_row."name" AS "checkName",
        check_row."type"::text AS "checkType",
        project."slug" AS "projectSlug",
        COALESCE(group_row."name", 'Ungrouped') AS "groupName"
      FROM page_info
      LEFT JOIN page_rows ON true
      LEFT JOIN "Check" AS check_row ON check_row."id" = page_rows."checkId"
      LEFT JOIN "Project" AS project ON project."id" = check_row."projectId"
      LEFT JOIN "CheckGroup" AS group_row ON group_row."id" = check_row."groupId"
      ORDER BY
        page_rows."createdAt" DESC NULLS LAST,
        page_rows."id" DESC NULLS LAST
    `;
    const metadata = rows[0];
    const total = metadata?.total ?? 0;
    const totalPages = metadata?.totalPages ?? 1;
    const page = metadata?.page ?? Math.min(requestedPage, totalPages);
    const skip = (page - 1) * pageSize;
    const pageLogs = rows.flatMap((row): StatusLogRow[] => {
      if (
        !row.id ||
        !row.checkId ||
        !row.checkKey ||
        !row.checkName ||
        !row.checkType ||
        !row.createdAt ||
        !row.fromStatus ||
        !row.groupName ||
        !row.projectSlug ||
        !row.toStatus
      ) {
        return [];
      }

      return [
        {
          checkHref: `/checks/${encodeURIComponent(row.checkId)}`,
          checkId: row.checkId,
          checkKey: row.checkKey,
          checkName: row.checkName,
          checkType: row.checkType.toLowerCase() as DashboardCheckRow["type"],
          createdAt: row.createdAt.toISOString(),
          createdAtLabel: formatRunTimestamp(row.createdAt, timeZone),
          fromStatus: row.fromStatus,
          groupName: row.groupName,
          id: row.id,
          projectSlug: row.projectSlug,
          runHref: `/checks/${encodeURIComponent(
            row.checkId,
          )}/runs/${encodeURIComponent(row.id)}`,
          toStatus: row.toStatus,
        },
      ];
    });

    return {
      logs: pageLogs,
      pagination: {
        from: total === 0 ? 0 : skip + 1,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
        page,
        pageSize,
        to: skip + pageLogs.length,
        total,
        totalPages,
      },
      projectSlug: "all",
    };
  } catch (error) {
    console.warn("Unable to load status logs.", error);
    return createEmptyStatusLogs(requestedPage, pageSize);
  }
}

export async function getTestSessionsData(
  _projectSlug: string,
  options: TestSessionsDataOptions = {},
): Promise<TestSessionsData> {
  const filters = normalizeTestSessionsFilters(options);
  const timeZone = getRuntimeTimeZone();

  try {
    const projects = await listProjectFilterOptions();
    const selectedProject = projects.find(
      (project) => project.slug === filters.project,
    );
    const where = buildTestSessionsWhere(
      filters.project === "all" ? undefined : (selectedProject?.slug ?? "__missing__"),
      filters,
    );
    const total = await prisma.testSession.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));
    const page = Math.min(filters.page, totalPages);
    const skip = (page - 1) * filters.pageSize;

    const sessions = await prisma.testSession.findMany({
      include: {
        project: {
          select: {
            slug: true,
          },
        },
        runs: {
          include: {
            artifacts: {
              orderBy: {
                createdAt: "desc",
              },
            },
            check: {
              include: {
                group: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: filters.pageSize,
      where,
    });
    const typedSessions = sessions as TestSessionWithRuns[];
    const dashboardStatuses = await loadLatestDashboardStatuses(typedSessions);

    return {
      filters: {
        ...filters,
        page,
      },
      pagination: {
        from: total === 0 ? 0 : skip + 1,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
        page,
        pageSize: filters.pageSize,
        to: skip + sessions.length,
        total,
        totalPages,
      },
      projectSlug: "all",
      projects,
      sessions: typedSessions.map((session) =>
        mapTestSession(session, timeZone, dashboardStatuses),
      ),
    };
  } catch (error) {
    console.warn("Unable to load test sessions data.", error);

    return {
      filters,
      pagination: {
        from: 0,
        hasNext: false,
        hasPrevious: false,
        page: filters.page,
        pageSize: filters.pageSize,
        to: 0,
        total: 0,
        totalPages: 1,
      },
      projectSlug: "all",
      projects: [],
      sessions: [],
    };
  }
}

export async function getTestSessionData(
  sessionId: string,
): Promise<TestSessionDetailData | undefined> {
  const timeZone = getRuntimeTimeZone();

  try {
    const session = await prisma.testSession.findFirst({
      include: {
        project: {
          select: {
            slug: true,
          },
        },
        runs: {
          include: {
            artifacts: {
              orderBy: {
                createdAt: "desc",
              },
            },
            check: {
              include: {
                group: true,
                project: {
                  select: {
                    slug: true,
                  },
                },
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        },
      },
      where: {
        id: sessionId,
        kind: "TEST",
      },
    });

    if (!session) {
      return undefined;
    }

    const typedSession = session as TestSessionWithRuns;
    const dashboardStatuses = await loadLatestDashboardStatuses([typedSession]);
    const mappedSession = mapTestSession(typedSession, timeZone, dashboardStatuses);
    const runs = session.runs as TestSessionRunWithCheck[];
    return {
      projectSlug:
        session.project?.slug ??
        (runs[0] ? getRunCheckSnapshot(runs[0]).projectSlug : "default"),
      session: {
        ...mappedSession,
        checks: mapTestSessionChecks(runs, session.id, timeZone, dashboardStatuses),
      },
    };
  } catch (error) {
    console.warn("Unable to load test session data.", error);
    return undefined;
  }
}

export async function getTestSessionCheckData(
  sessionId: string,
  checkId: string,
): Promise<TestSessionCheckDetailData | undefined> {
  const timeZone = getRuntimeTimeZone();

  try {
    const session = await prisma.testSession.findFirst({
      include: {
        project: {
          select: {
            slug: true,
          },
        },
        runs: {
          include: {
            artifacts: {
              orderBy: {
                createdAt: "desc",
              },
            },
            check: {
              include: {
                group: true,
                project: {
                  select: {
                    slug: true,
                  },
                },
              },
            },
          },
          orderBy: [
            {
              attempt: "asc",
            },
            {
              createdAt: "asc",
            },
          ],
          where: {
            OR: [
              {
                checkId,
              },
              {
                checkSnapshotKey: checkId,
              },
              {
                id: checkId,
              },
            ],
          },
        },
      },
      where: {
        id: sessionId,
        kind: "TEST",
        runs: {
          some: {
            OR: [
              {
                checkId,
              },
              {
                checkSnapshotKey: checkId,
              },
              {
                id: checkId,
              },
            ],
          },
        },
      },
    });

    const runs = (session?.runs ?? []) as TestSessionRunWithCheck[];
    const firstRun = runs[0];

    if (!session || !firstRun) {
      return undefined;
    }

    const check = getRunCheckSnapshot(firstRun);

    const typedSession = session as TestSessionWithRuns;
    const dashboardStatuses = await loadLatestDashboardStatuses([typedSession]);

    return {
      check: {
        id: check.id,
        key: check.key,
        name: check.name,
        tags: check.tags,
        target: formatTestRunTarget(firstRun),
        type: check.type.toLowerCase() as DashboardCheckRow["type"],
      },
      groupName: check.groupName,
      projectSlug: check.projectSlug,
      runs: runs.map((run) => ({
        ...mapRun(run, timeZone),
        runHref: buildRunHref(getRunCheckSnapshot(run).id, run.id),
      })),
      session: mapTestSession(typedSession, timeZone, dashboardStatuses),
    };
  } catch (error) {
    console.warn("Unable to load test session check data.", error);
    return undefined;
  }
}

function normalizeJournalFilters(options: JournalDataOptions): JournalData["filters"] {
  const pageSize = clampInteger(
    options.pageSize,
    JOURNAL_DEFAULT_PAGE_SIZE,
    1,
    JOURNAL_MAX_PAGE_SIZE,
  );

  return {
    page: clampInteger(options.page, 1, 1, Number.MAX_SAFE_INTEGER),
    pageSize,
    project: options.project?.trim() || "all",
    query: options.query?.trim() ?? "",
    range: normalizeJournalRange(options.range),
    status: normalizeJournalStatus(options.status),
    type: normalizeJournalType(options.type),
  };
}

function normalizeTestSessionsFilters(
  options: TestSessionsDataOptions,
): TestSessionsData["filters"] {
  const pageSize = clampInteger(
    options.pageSize,
    TEST_SESSIONS_DEFAULT_PAGE_SIZE,
    1,
    TEST_SESSIONS_MAX_PAGE_SIZE,
  );

  return {
    page: clampInteger(options.page, 1, 1, Number.MAX_SAFE_INTEGER),
    pageSize,
    project: options.project?.trim() || "all",
    query: options.query?.trim() ?? "",
    sessionName: options.sessionName?.trim() ?? "",
  };
}

function normalizeJournalRange(
  value: JournalRangeFilter | undefined,
): JournalRangeFilter {
  return value === "24h" || value === "7d" || value === "30d" || value === "all"
    ? value
    : "7d";
}

function normalizeJournalStatus(
  value: JournalRunStatusFilter | undefined,
): JournalRunStatusFilter {
  return value === "queued" ||
    value === "running" ||
    value === "passed" ||
    value === "failed" ||
    value === "timed_out" ||
    value === "cancelled" ||
    value === "all"
    ? value
    : "all";
}

function normalizeJournalType(
  value: JournalRunTypeFilter | undefined,
): JournalRunTypeFilter {
  return value === "api" || value === "browser" || value === "all" ? value : "all";
}

function clampInteger(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
) {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, value));
}

function buildJournalWhere(
  projectSlug: string | undefined,
  filters: JournalData["filters"],
): CheckRunWhere {
  const where: CheckRunWhere = {
    AND: [buildDashboardVisibleRunWhere()],
    ...(projectSlug ? { project: { slug: projectSlug } } : {}),
    check: {
      enabled: true,
      ...(filters.type === "all"
        ? {}
        : { type: filters.type.toUpperCase() as "API" | "BROWSER" }),
    },
  };
  const status = mapJournalStatusFilter(filters.status);
  const cutoff = getJournalRangeCutoff(filters.range);
  const query = filters.query.trim();

  if (status) {
    where.status = status;
  }

  if (cutoff) {
    where.createdAt = {
      gte: cutoff,
    };
  }

  if (query) {
    where.OR = [
      {
        id: {
          contains: query,
          mode: "insensitive",
        },
      },
      {
        errorMessage: {
          contains: query,
          mode: "insensitive",
        },
      },
      {
        check: {
          key: {
            contains: query,
            mode: "insensitive",
          },
        },
      },
      {
        check: {
          name: {
            contains: query,
            mode: "insensitive",
          },
        },
      },
      {
        check: {
          tags: {
            has: query,
          },
        },
      },
    ];
  }

  return where;
}

function buildTestSessionsWhere(
  projectSlug: string | undefined,
  filters: TestSessionsData["filters"],
): Prisma.TestSessionWhereInput {
  const where: Prisma.TestSessionWhereInput = {
    kind: "TEST",
    ...(projectSlug ? { project: { slug: projectSlug } } : {}),
  };
  const query = filters.query.trim();
  const sessionName = filters.sessionName.trim();
  const conditions: Prisma.TestSessionWhereInput[] = [];

  if (sessionName) {
    conditions.push({
      name: {
        equals: sessionName,
        mode: "insensitive",
      },
    });
  }

  if (query) {
    conditions.push({
      OR: [
        {
          id: {
            contains: query,
            mode: "insensitive",
          },
        },
        {
          name: {
            contains: query,
            mode: "insensitive",
          },
        },
        {
          source: {
            contains: query,
            mode: "insensitive",
          },
        },
        {
          targetUrl: {
            contains: query,
            mode: "insensitive",
          },
        },
        {
          runs: {
            some: {
              OR: buildTestSessionRunSearchFilters(query),
            },
          },
        },
      ],
    });
  }

  if (conditions.length > 0) {
    where.AND = conditions;
  }

  return where;
}

function buildTestSessionRunSearchFilters(query: string): Prisma.CheckRunWhereInput[] {
  const containsQuery = {
    contains: query,
    mode: "insensitive" as const,
  };

  return [
    {
      id: containsQuery,
    },
    {
      errorMessage: containsQuery,
    },
    {
      check: {
        key: containsQuery,
      },
    },
    {
      check: {
        name: containsQuery,
      },
    },
    {
      check: {
        tags: {
          has: query,
        },
      },
    },
    {
      checkSnapshotKey: containsQuery,
    },
    {
      checkSnapshotName: containsQuery,
    },
    {
      checkSnapshotGroupName: containsQuery,
    },
    {
      checkSnapshotEntrypoint: containsQuery,
    },
    {
      checkSnapshotProjectSlug: containsQuery,
    },
    {
      checkSnapshotTags: {
        has: query,
      },
    },
  ];
}

function mapJournalStatusFilter(
  status: JournalRunStatusFilter,
): "CANCELLED" | "FAILED" | "PASSED" | "QUEUED" | "RUNNING" | "TIMED_OUT" | undefined {
  if (status === "all") {
    return undefined;
  }

  return status.toUpperCase() as
    | "CANCELLED"
    | "FAILED"
    | "PASSED"
    | "QUEUED"
    | "RUNNING"
    | "TIMED_OUT";
}

function getJournalRangeCutoff(range: JournalRangeFilter): Date | undefined {
  if (range === "all") {
    return undefined;
  }

  const days = range === "24h" ? 1 : range === "7d" ? 7 : 30;

  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

async function listProjectFilterOptions(): Promise<ProjectFilterOption[]> {
  return prisma.project.findMany({
    orderBy: {
      name: "asc",
    },
    select: {
      name: true,
      slug: true,
    },
  });
}

function buildDashboardVisibleRunWhere(): Prisma.CheckRunWhereInput {
  return {
    OR: [
      {
        testSessionId: null,
      },
      {
        testSession: {
          is: {
            kind: {
              not: "TEST",
            },
          },
        },
      },
    ],
  };
}

function mapTestSession(
  session: TestSessionWithRuns,
  timeZone: string,
  dashboardStatuses: Map<string, string>,
): TestSessionRow {
  const runs = session.runs;
  const latestRuns = getLatestRunsByCheck(runs);
  const summary = summarizeTestSessionRuns(latestRuns, dashboardStatuses);
  const status = resolveTestSessionStatus(session.status, latestRuns);
  const dashboardStatus =
    status === "PASSED"
      ? summarizeStatus(latestRuns.map((run) => getRunDashboardStatus(run)))
      : mapRunStatus(status);

  return {
    ...(session.commitSha ? { commitSha: session.commitSha } : {}),
    createdAt: session.createdAt.toISOString(),
    createdAtLabel: formatRunTimestamp(session.createdAt, timeZone),
    duration: formatTestSessionDuration(runs),
    href: `/test-sessions/${encodeURIComponent(session.id)}`,
    id: session.id,
    ...(session.jobUrl ? { jobUrl: session.jobUrl } : {}),
    name: session.name ?? undefined,
    ...(session.pipelineUrl ? { pipelineUrl: session.pipelineUrl } : {}),
    projectSlug:
      session.project?.slug ??
      (runs[0] ? getRunCheckSnapshot(runs[0]).projectSlug : "default"),
    ...(session.ref ? { ref: session.ref } : {}),
    ...(session.repository ? { repository: session.repository } : {}),
    runState: mapRunState(status),
    source: session.source ?? undefined,
    status: dashboardStatus,
    summary,
    targetUrl: session.targetUrl ?? undefined,
    tone: mapRunTone(status, dashboardStatus),
    workspacePath: session.workspacePath ?? undefined,
  };
}

function resolveTestSessionStatus(
  status: string,
  runs: TestSessionRunWithCheck[],
): string {
  const terminalStatus = summarizeTerminalRunStatuses(runs.map((run) => run.status));

  if (!activeSessionStatuses.includes(status) || !terminalStatus) {
    return status;
  }

  const finishedBefore = Date.now() - TEST_SESSION_FINALIZATION_GRACE_MS;

  return runs.every(
    (run) => run.finishedAt && run.finishedAt.getTime() < finishedBefore,
  )
    ? terminalStatus
    : status;
}

function mapTestSessionChecks(
  runs: TestSessionRunWithCheck[],
  sessionId: string,
  timeZone: string,
  dashboardStatuses: Map<string, string>,
): TestSessionCheckRow[] {
  const runsByCheck = new Map<string, TestSessionRunWithCheck[]>();

  for (const run of runs) {
    const check = getRunCheckSnapshot(run);

    const identity = getTestIdentity(check.projectSlug, check.key);

    runsByCheck.set(identity, [...(runsByCheck.get(identity) ?? []), run]);
  }

  return [...runsByCheck.values()]
    .map((checkRuns) => {
      const latestRun = getLatestRun(checkRuns);
      const check = getRunCheckSnapshot(latestRun);
      const isRegress = isRegression(
        latestRun,
        check.projectSlug,
        check.key,
        dashboardStatuses,
      );

      return {
        aiAnalysis: formatAiAnalysis(latestRun.result),
        checkHref: `/test-sessions/${encodeURIComponent(
          sessionId,
        )}/checks/${encodeURIComponent(check.id)}`,
        checkId: check.id,
        checkKey: check.key,
        checkName: check.name,
        checkType: check.type.toLowerCase() as DashboardCheckRow["type"],
        duration: formatDuration(latestRun.durationMs ?? undefined),
        groupName: check.groupName,
        isRegress,
        latestRunHref: buildRunHref(check.id, latestRun.id),
        latestRunOccurredAt: formatBarTimestamp(latestRun, timeZone),
        projectSlug: check.projectSlug,
        runCount: checkRuns.length,
        runState: mapRunState(latestRun.status),
        status: getRunDashboardStatus(latestRun),
        target: formatTestRunTarget(latestRun),
        tone: mapRunTone(latestRun.status, getRunDashboardStatus(latestRun)),
      };
    })
    .sort((left, right) => {
      if (left.status !== right.status) {
        return statusSortRank(left.runState) - statusSortRank(right.runState);
      }

      return left.checkName.localeCompare(right.checkName);
    });
}

function getRunCheckSnapshot(
  run: TestSessionRunWithCheck | MappableRun,
): RunCheckSnapshot {
  if ("check" in run && run.check) {
    return {
      degradedResponseTime: run.check.degradedResponseTime,
      entrypoint: run.check.entrypoint,
      groupName: run.check.group?.name ?? "Ungrouped",
      id: run.check.id,
      key: run.check.key,
      name: run.check.name,
      projectSlug: run.check.project?.slug ?? "default",
      request: run.check.request,
      tags: run.check.tags,
      type: run.check.type,
    };
  }

  return {
    degradedResponseTime: run.checkSnapshotDegradedResponseTime ?? null,
    entrypoint: run.checkSnapshotEntrypoint ?? null,
    groupName: run.checkSnapshotGroupName ?? "Ungrouped",
    id: run.checkSnapshotKey ?? run.checkId ?? run.id,
    key: run.checkSnapshotKey ?? run.checkId ?? run.id,
    name: run.checkSnapshotName ?? run.checkSnapshotKey ?? "Unknown check",
    projectSlug: run.checkSnapshotProjectSlug ?? "default",
    request: run.checkSnapshotRequest,
    tags: run.checkSnapshotTags ?? [],
    type: run.checkSnapshotType ?? "BROWSER",
  };
}

function buildRunHref(checkId: string, runId: string): string {
  return `/checks/${encodeURIComponent(checkId)}/runs/${encodeURIComponent(runId)}`;
}

function getLatestRunsByCheck(
  runs: TestSessionRunWithCheck[],
): TestSessionRunWithCheck[] {
  const runsByCheck = new Map<string, TestSessionRunWithCheck>();

  for (const run of runs) {
    const check = getRunCheckSnapshot(run);
    const identity = getTestIdentity(check.projectSlug, check.key);
    const current = runsByCheck.get(identity);

    if (!current || run.createdAt > current.createdAt) {
      runsByCheck.set(identity, run);
    }
  }

  return [...runsByCheck.values()];
}

function getLatestRun(runs: TestSessionRunWithCheck[]): TestSessionRunWithCheck {
  return runs.reduce((latestRun, run) =>
    run.createdAt > latestRun.createdAt ? run : latestRun,
  );
}

async function loadLatestDashboardStatuses(
  sessions: TestSessionWithRuns[],
): Promise<Map<string, string>> {
  const identities = new Map<string, { key: string; projectSlug: string }>();

  for (const session of sessions) {
    for (const run of getLatestRunsByCheck(session.runs)) {
      if (run.status !== "FAILED") {
        continue;
      }

      const check = getRunCheckSnapshot(run);
      const { key, projectSlug } = check;
      identities.set(getTestIdentity(projectSlug, key), { key, projectSlug });
    }
  }

  if (identities.size === 0) {
    return new Map();
  }

  const checks = (await prisma.check.findMany({
    select: {
      key: true,
      project: {
        select: {
          slug: true,
        },
      },
      runs: {
        orderBy: {
          createdAt: "desc",
        },
        select: {
          status: true,
        },
        take: 1,
        where: buildDashboardVisibleRunWhere(),
      },
    },
    where: {
      enabled: true,
      OR: [...identities.values()].map(({ key, projectSlug }) => ({
        key,
        project: {
          slug: projectSlug,
        },
      })),
    },
  })) as DashboardBaselineCheck[];

  return new Map(
    checks.flatMap((check) => {
      const latestRun = check.runs[0];

      return latestRun
        ? [[getTestIdentity(check.project.slug, check.key), latestRun.status] as const]
        : [];
    }),
  );
}

function getTestIdentity(projectSlug: string, checkKey: string): string {
  return `${projectSlug}\u0000${checkKey}`;
}

function isRegression(
  run: TestSessionRunWithCheck,
  projectSlug: string,
  checkKey: string,
  dashboardStatuses: Map<string, string>,
): boolean {
  return (
    run.status === "FAILED" &&
    dashboardStatuses.get(getTestIdentity(projectSlug, checkKey)) === "PASSED"
  );
}

function summarizeTestSessionRuns(
  runs: TestSessionRunWithCheck[],
  dashboardStatuses: Map<string, string>,
): TestSessionRunCountSummary {
  return runs.reduce<TestSessionRunCountSummary>(
    (summary, run) => {
      const runState = mapRunState(run.status);
      const status = getRunDashboardStatus(run);
      const check = getRunCheckSnapshot(run);
      const isRegress = isRegression(
        run,
        check.projectSlug,
        check.key,
        dashboardStatuses,
      );

      return {
        failed: summary.failed + (status === "failing" ? 1 : 0),
        passed: summary.passed + (runState === "passed" ? 1 : 0),
        queued: summary.queued + (runState === "queued" ? 1 : 0),
        regress: summary.regress + (isRegress ? 1 : 0),
        running: summary.running + (runState === "running" ? 1 : 0),
        total: summary.total + 1,
      };
    },
    {
      failed: 0,
      passed: 0,
      queued: 0,
      regress: 0,
      running: 0,
      total: 0,
    },
  );
}

function formatTestSessionDuration(runs: TestSessionRunWithCheck[]): string {
  const durationMs = runs
    .map((run) => run.durationMs)
    .filter((duration): duration is number => typeof duration === "number")
    .reduce((sum, duration) => sum + duration, 0);

  return durationMs > 0 ? formatLongDuration(durationMs) : "-";
}

function formatLongDuration(value: number): string {
  if (value < 60_000) {
    return formatDuration(value);
  }

  const totalSeconds = Math.round(value / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
  }

  return seconds > 0 ? `${minutes} min ${seconds} s` : `${minutes} min`;
}

function formatTestRunTarget(run: TestSessionRunWithCheck): string {
  const resultUrl = asRecord(run.result).url;

  if (typeof resultUrl === "string" && resultUrl.length > 0) {
    return resultUrl;
  }

  const check = getRunCheckSnapshot(run);
  const request = formatRequestSettings(check.request);

  if (request) {
    return `${request.method} ${request.url}`;
  }

  return check.entrypoint ?? "-";
}

function statusSortRank(runState: DashboardRunState): number {
  if (runState === "failed" || runState === "timed_out") {
    return 0;
  }

  if (runState === "running" || runState === "queued") {
    return 1;
  }

  if (runState === "cancelled") {
    return 2;
  }

  if (runState === "passed") {
    return 3;
  }

  return 4;
}

function hasJournalCheck<T extends { check: unknown | null }>(
  run: T,
): run is T & { check: NonNullable<T["check"]> } {
  return Boolean(run.check);
}

function mapJournalRun(run: JournalRunWithCheck, timeZone: string): JournalRunRow {
  return {
    ...mapRun(run, timeZone, run.check),
    checkHref: `/checks/${encodeURIComponent(run.check.id)}`,
    checkId: run.check.id,
    checkKey: run.check.key,
    checkName: run.check.name,
    checkTags: run.check.tags,
    checkType: run.check.type.toLowerCase() as DashboardCheckRow["type"],
    createdAtLabel: formatRunTimestamp(run.createdAt, timeZone),
    groupName: run.check.group?.name ?? "Ungrouped",
    projectSlug: run.check.project?.slug ?? run.checkSnapshotProjectSlug ?? "default",
    runHref: `/checks/${encodeURIComponent(run.check.id)}/runs/${encodeURIComponent(
      run.id,
    )}`,
    schedule:
      typeof run.check.frequencyMinutes === "number"
        ? `${run.check.frequencyMinutes} min`
        : "manual",
    sessionName: run.testSession?.name ?? undefined,
  };
}

function formatDashboardRevision(
  activeRuns: Array<{ id: string; status: string }>,
  latestTerminalRun?: { finishedAt: Date | null; id: string; status: string } | null,
): string {
  return [
    latestTerminalRun
      ? `terminal:${latestTerminalRun.id}:${latestTerminalRun.status}:${
          latestTerminalRun.finishedAt?.toISOString() ?? ""
        }`
      : "terminal:",
    ...activeRuns
      .map((run) => `active:${run.id}:${run.status}`)
      .sort((left, right) => left.localeCompare(right)),
  ].join("|");
}

async function fetchLatestTerminalRevisionRun() {
  return prisma.checkRun.findFirst({
    orderBy: [{ finishedAt: "desc" }, { id: "desc" }],
    select: {
      finishedAt: true,
      id: true,
      status: true,
    },
    where: {
      AND: [
        buildDashboardVisibleRunWhere(),
        {
          check: {
            is: {
              enabled: true,
            },
          },
        },
        {
          finishedAt: {
            not: null,
          },
          status: {
            notIn: [...DASHBOARD_ACTIVE_RUN_STATUSES],
          },
        },
      ],
    },
  });
}

async function fetchChecks() {
  const [checkRows, runRows] = await Promise.all([
    prisma.check.findMany({
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
      select: {
        degradedResponseTime: true,
        enabled: true,
        entrypoint: true,
        frequencyMinutes: true,
        group: {
          select: {
            name: true,
          },
        },
        id: true,
        key: true,
        name: true,
        project: {
          select: {
            name: true,
            slug: true,
          },
        },
        request: true,
        tags: true,
        type: true,
      },
      where: {
        enabled: true,
      },
    }),
    fetchDashboardRuns(),
  ]);
  const checks = checkRows as Array<
    Omit<CheckWithRuns, "firstFailingAt" | "runs"> & {
      runs?: MappableRun[];
    }
  >;
  const runsByCheck = new Map<string, DashboardRunRecord[]>();
  const firstFailingByCheck = new Map<string, Date | null>();

  for (const run of runRows) {
    runsByCheck.set(run.checkId, [...(runsByCheck.get(run.checkId) ?? []), run]);

    if (!firstFailingByCheck.has(run.checkId)) {
      firstFailingByCheck.set(run.checkId, run.firstFailingAt);
    }
  }

  return checks.map<CheckWithRuns>((check) => ({
    ...check,
    firstFailingAt: check.runs
      ? undefined
      : (firstFailingByCheck.get(check.id) ?? null),
    runs: check.runs ?? runsByCheck.get(check.id) ?? [],
  }));
}

async function fetchDashboardRuns(): Promise<DashboardRunRecord[]> {
  const runs = await prisma.$queryRaw<DashboardRunRecord[]>`
    WITH visible_runs AS (
      SELECT
        run."id",
        run."checkId",
        run."status"::text AS "status",
        run."attempt",
        run."maxAttempts",
        run."retryGroupId",
        run."createdAt",
        run."durationMs",
        CASE
          WHEN session."commitSha" IS NOT NULL OR session."ref" IS NOT NULL
            THEN session."commitSha"
          ELSE deployment."gitSha"
        END AS "commitSha",
        CASE
          WHEN session."commitSha" IS NOT NULL OR session."ref" IS NOT NULL
            THEN session."ref"
          ELSE deployment."gitRef"
        END AS "gitRef",
        run."checkSnapshotDegradedResponseTime",
        run."checkSnapshotType"::text AS "checkSnapshotType",
        COALESCE(NULLIF(run."retryGroupId", ''), run."id") AS "logicalRunId",
        ROW_NUMBER() OVER (
          PARTITION BY run."checkId"
          ORDER BY run."createdAt" DESC, run."id" DESC
        ) AS "runRank",
        run."result" -> 'aiAnalysis' AS "aiAnalysis",
        run."logsPath" IS NOT NULL AS "hasLog"
      FROM "CheckRun" AS run
      INNER JOIN "Check" AS check_row
        ON check_row."id" = run."checkId" AND check_row."enabled" = true
      LEFT JOIN "TestSession" AS session
        ON session."id" = run."testSessionId"
      LEFT JOIN LATERAL (
        SELECT deployed."gitRef", deployed."gitSha"
        FROM "Deployment" AS deployed
        WHERE
          deployed."projectId" = run."projectId"
          AND deployed."createdAt" <= run."createdAt"
        ORDER BY deployed."createdAt" DESC, deployed."id" DESC
        LIMIT 1
      ) AS deployment ON true
      WHERE
        run."testSessionId" IS NULL
        OR (session."id" IS NOT NULL AND session."kind" <> 'TEST'::"TestSessionKind")
    ),
    ranked_groups AS (
      SELECT
        "checkId",
        "logicalRunId",
        ROW_NUMBER() OVER (
          PARTITION BY "checkId"
          ORDER BY MAX("createdAt") DESC, "logicalRunId" DESC
        ) AS "groupRank"
      FROM visible_runs
      GROUP BY "checkId", "logicalRunId"
    ),
    streak_candidates AS (
      SELECT
        "id",
        "checkId",
        "createdAt",
        "status",
        COUNT(*) FILTER (
          WHERE "status" NOT IN ('FAILED', 'TIMED_OUT', 'CANCELLED')
        ) OVER (
          PARTITION BY "checkId"
          ORDER BY "createdAt" DESC, "id" DESC
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS "nonFailingSeen"
      FROM visible_runs
    ),
    firewatch AS (
      SELECT "checkId", MIN("createdAt") AS "firstFailingAt"
      FROM streak_candidates
      WHERE
        "nonFailingSeen" = 0
        AND "status" IN ('FAILED', 'TIMED_OUT', 'CANCELLED')
      GROUP BY "checkId"
      HAVING MIN("createdAt") >= NOW() - ${FIREWATCH_LOOKBACK_DAYS} * INTERVAL '1 day'
    ),
    trace_runs AS (
      SELECT DISTINCT artifact."runId"
      FROM "Artifact" AS artifact
      WHERE artifact."type" IN (
        'LOG'::"ArtifactType",
        'SCREENSHOT'::"ArtifactType",
        'TRACE'::"ArtifactType",
        'VIDEO'::"ArtifactType"
      )
    )
    SELECT
      run."id",
      run."checkId",
      run."status",
      run."attempt",
      run."maxAttempts",
      run."retryGroupId",
      run."createdAt",
      run."durationMs",
      run."commitSha",
      run."gitRef",
      run."checkSnapshotDegradedResponseTime",
      run."checkSnapshotType",
      CASE
        WHEN run."runRank" = 1 AND run."aiAnalysis" IS NOT NULL
          THEN jsonb_build_object('aiAnalysis', run."aiAnalysis")
        ELSE NULL
      END AS "result",
      NULL::text AS "errorMessage",
      NULL::text AS "logsPath",
      firewatch."firstFailingAt",
      (run."hasLog" OR trace_run."runId" IS NOT NULL) AS "hasTrace"
    FROM visible_runs AS run
    INNER JOIN ranked_groups AS ranked
      ON ranked."checkId" = run."checkId"
      AND ranked."logicalRunId" = run."logicalRunId"
    LEFT JOIN firewatch ON firewatch."checkId" = run."checkId"
    LEFT JOIN trace_runs AS trace_run ON trace_run."runId" = run."id"
    WHERE ranked."groupRank" <= ${DASHBOARD_RESULT_BAR_COUNT}
    ORDER BY run."checkId" ASC, run."createdAt" DESC, run."id" DESC
  `;

  return runs.map((run) => ({
    ...run,
    artifacts: [],
    result: run.result ?? null,
  }));
}

async function fetchActiveQueue(
  timeZone: string,
  { includeTestSessions = false }: { includeTestSessions?: boolean } = {},
): Promise<DashboardQueueRow[]> {
  const runs = await prisma.checkRun.findMany({
    include: {
      artifacts: {
        orderBy: {
          createdAt: "desc",
        },
      },
      check: {
        include: {
          group: true,
          project: {
            select: {
              slug: true,
            },
          },
        },
      },
      testSession: {
        select: {
          id: true,
          kind: true,
          ref: true,
          source: true,
        },
      },
      project: {
        select: {
          slug: true,
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
    where: includeTestSessions
      ? {
          status: {
            in: [...DASHBOARD_ACTIVE_RUN_STATUSES],
          },
        }
      : {
          AND: [
            buildDashboardVisibleRunWhere(),
            {
              status: {
                in: [...DASHBOARD_ACTIVE_RUN_STATUSES],
              },
            },
          ],
        },
  });

  return (runs as ActiveQueueRunWithCheck[])
    .map((run) => mapQueueRun(run, timeZone))
    .sort(compareQueueRows);
}

function mapQueueRun(
  run: ActiveQueueRunWithCheck,
  timeZone: string,
): DashboardQueueRow {
  const check = getRunCheckSnapshot(run);
  const source = mapQueueSource(run);

  return {
    branch: getQueueBranch(run),
    checkHref: buildQueueCheckHref(run, check.id),
    checkId: check.id,
    checkName: check.name,
    createdAt: run.createdAt.toISOString(),
    createdAtLabel: formatRunTimestamp(run.createdAt, timeZone),
    groupName: check.groupName,
    projectSlug:
      run.project?.slug ??
      run.check?.project.slug ??
      run.checkSnapshotProjectSlug ??
      "default",
    id: run.id,
    runState: mapActiveRunState(run.status),
    source,
    sourceLabel: formatQueueSource(source),
    type: check.type.toLowerCase() as DashboardCheckRow["type"],
  };
}

function compareQueueRows(left: DashboardQueueRow, right: DashboardQueueRow): number {
  const stateRank = queueStateRank(left.runState) - queueStateRank(right.runState);

  if (stateRank !== 0) {
    return stateRank;
  }

  const createdAtRank =
    new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();

  if (createdAtRank !== 0) {
    return createdAtRank;
  }

  return left.checkName.localeCompare(right.checkName);
}

function queueStateRank(runState: DashboardQueueRow["runState"]): number {
  return runState === "running" ? 0 : 1;
}

function mapActiveRunState(status: string): DashboardQueueRow["runState"] {
  return status === "RUNNING" ? "running" : "queued";
}

function getQueueBranch(run: ActiveQueueRunWithCheck): string {
  const ref = run.testSession?.ref?.trim();

  if (ref) {
    return ref;
  }

  const source = run.testSession?.source?.trim();

  if (!source) {
    return "production";
  }

  return getTestSessionSourceBranch(source) ?? source;
}

function buildQueueCheckHref(run: ActiveQueueRunWithCheck, checkId: string): string {
  if (run.testSession?.kind === "TEST") {
    return `/test-sessions/${encodeURIComponent(
      run.testSession.id,
    )}/checks/${encodeURIComponent(checkId)}`;
  }

  if (run.check?.id) {
    return `/checks/${encodeURIComponent(run.check.id)}`;
  }

  return buildRunHref(checkId, run.id);
}

function mapQueueSource(run: ActiveQueueRunWithCheck): DashboardQueueSource {
  if (run.runSource === "SCHEDULE") {
    return "schedule";
  }

  if (run.runSource === "CLI" || run.testSession) {
    return "cli";
  }

  return "manual";
}

function formatQueueSource(source: DashboardQueueSource): string {
  if (source === "schedule") {
    return "Schedule";
  }

  if (source === "cli") {
    return "CLI";
  }

  return "Manual";
}

function buildGroups(checks: CheckWithRuns[], timeZone: string): DashboardGroupRow[] {
  const grouped = new Map<string, CheckWithRuns[]>();

  for (const check of checks) {
    const groupName = check.group?.name ?? "Ungrouped";
    const groupKey = `${check.project?.slug ?? "default"}:${groupName}`;
    grouped.set(groupKey, [...(grouped.get(groupKey) ?? []), check]);
  }

  return [...grouped.values()].map((groupChecks, index) => {
    const firstCheck = groupChecks[0]!;
    const name = firstCheck.group?.name ?? "Ungrouped";
    const children = groupChecks.map((check) => mapCheck(check, timeZone, "latest"));

    return {
      checks: `${children.length} checks`,
      children,
      expanded: index === 0,
      name,
      projectName: firstCheck.project?.name ?? firstCheck.project?.slug ?? "default",
      projectSlug: firstCheck.project?.slug ?? "default",
      status: summarizeStatus(children.map((check) => check.status)),
      updated: formatLatestUpdate(groupChecks, timeZone),
    };
  });
}

function mapCheck(
  check: CheckWithRuns,
  timeZone: string,
  runScope: "all" | "latest",
): DashboardCheckRow {
  const latestRun = check.runs[0];
  const mappedRuns = runScope === "all" ? check.runs : check.runs.slice(0, 1);
  const durations = check.runs
    .map((run) => run.durationMs)
    .filter((duration): duration is number => typeof duration === "number");
  const passedRuns = check.runs.filter((run) => run.status === "PASSED").length;
  const failedRuns = check.runs.filter((run) =>
    ["CANCELLED", "FAILED", "TIMED_OUT"].includes(run.status),
  ).length;

  return {
    avg: formatDuration(average(durations)),
    ava: formatAvailability(check.runs),
    bars: buildBars(check.runs, check.id, timeZone, check),
    delta: latestRun ? "24 h" : "-",
    hasTrace: Boolean(
      check.runs.some(
        (run) =>
          run.hasTrace ||
          run.logsPath ||
          run.artifacts.some((artifact) =>
            ["LOG", "SCREENSHOT", "TRACE", "VIDEO"].includes(artifact.type),
          ),
      ),
    ),
    id: check.id,
    name: check.name,
    p95: formatDuration(percentile(durations, 0.95)),
    runState: mapRunState(latestRun?.status),
    runs: mappedRuns.map((run) => mapRun(run, timeZone, check)),
    settings: {
      enabled: check.enabled,
      entrypoint: check.entrypoint ?? undefined,
      frequency:
        typeof check.frequencyMinutes === "number"
          ? `${check.frequencyMinutes} min`
          : "manual",
      key: check.key,
      request: formatRequestSettings(check.request),
    },
    stats: {
      averageDuration: formatDuration(average(durations)),
      failedRuns: String(failedRuns),
      p95Duration: formatDuration(percentile(durations, 0.95)),
      passedRuns: String(passedRuns),
      totalRuns: String(check.runs.length),
    },
    status: getRunDashboardStatus(latestRun, check),
    tags: check.tags,
    time: formatRunAge(latestRun, timeZone),
    type: check.type.toLowerCase() as DashboardCheckRow["type"],
  };
}

function buildFirewatch(checks: CheckWithRuns[], timeZone: string): DashboardFirewatch {
  const cutoff = new Date(Date.now() - FIREWATCH_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const rows = checks
    .map((check) => mapFirewatchRow(check, cutoff, timeZone))
    .filter((row): row is DashboardFirewatchRow => Boolean(row));

  return {
    lookbackDays: FIREWATCH_LOOKBACK_DAYS,
    rows,
  };
}

function mapFirewatchRow(
  check: CheckWithRuns,
  cutoff: Date,
  timeZone: string,
): DashboardFirewatchRow | undefined {
  const latestRun = getLatestLogicalRunAttempt(check.runs);

  if (!latestRun || getRunDashboardStatus(latestRun, check) !== "failing") {
    return undefined;
  }

  if (typeof check.firstFailingAt !== "undefined") {
    if (!check.firstFailingAt || check.firstFailingAt < cutoff) {
      return undefined;
    }

    return createFirewatchRow(check, latestRun, check.firstFailingAt, timeZone);
  }

  const failingStreak: CheckWithRuns["runs"] = [];

  for (const run of check.runs) {
    if (getRunDashboardStatus(run, check) !== "failing") {
      break;
    }

    failingStreak.push(run);
  }

  const firstFailingRun = failingStreak[failingStreak.length - 1];

  if (!firstFailingRun || firstFailingRun.createdAt < cutoff) {
    return undefined;
  }

  return createFirewatchRow(check, latestRun, firstFailingRun.createdAt, timeZone);
}

function getLatestLogicalRunAttempt(
  runs: CheckWithRuns["runs"],
): CheckWithRuns["runs"][number] | undefined {
  const latestRunAttempts = groupRetryAttempts(runs)[0];

  return latestRunAttempts ? getLatestAttempt(latestRunAttempts) : undefined;
}

function createFirewatchRow(
  check: CheckWithRuns,
  latestRun: MappableRun,
  firstFailingAt: Date,
  timeZone: string,
): DashboardFirewatchRow {
  return {
    checkId: check.id,
    firstSeen: formatRunTimestamp(firstFailingAt, timeZone),
    firstSeenAt: firstFailingAt.toISOString(),
    groupName: check.group?.name ?? "Ungrouped",
    lastSeen: formatRelative(latestRun.createdAt, timeZone),
    lastSeenAt: latestRun.createdAt.toISOString(),
    latestRunHref: buildRunHref(check.id, latestRun.id),
    name: check.name,
    projectName: check.project?.name ?? check.project?.slug ?? "default",
    projectSlug: check.project?.slug ?? "default",
    type: check.type.toLowerCase() as DashboardCheckRow["type"],
  };
}

function mapRun(
  run: MappableRun | TestSessionRunWithCheck,
  timeZone: string,
  check?: Pick<CheckWithRuns, "degradedResponseTime" | "type">,
): DashboardRunRow {
  const maxAttempts = getRunMaxAttempts(run);
  const status = getRunDashboardStatus(run, check);

  return {
    aiAnalysis: formatAiAnalysis(run.result),
    attempt: getRunAttempt(run),
    artifacts: mapRunArtifacts(run),
    createdAt: run.createdAt.toISOString(),
    duration: formatDuration(run.durationMs ?? undefined),
    durationMs: run.durationMs ?? undefined,
    errorMessage: run.errorMessage ?? undefined,
    hasRetries: maxAttempts > 1 || hasRunRetries(run.result),
    id: run.id,
    maxAttempts,
    occurredAt: formatBarTimestamp(run, timeZone),
    performance: mapRunPerformance(run.result),
    retryGroupId: run.retryGroupId ?? undefined,
    runner: "Local runner",
    runState: mapRunState(run.status),
    status,
    tone: mapRunTone(run.status, status),
  };
}

async function fetchRunAttempts(run: MappableRun) {
  const retryGroupId = run.retryGroupId?.trim();

  if (!retryGroupId) {
    return [run];
  }

  const check = getRunCheckSnapshot(run);

  const runs = await prisma.checkRun.findMany({
    include: {
      artifacts: {
        orderBy: {
          createdAt: "desc",
        },
      },
    },
    orderBy: [
      {
        attempt: "asc",
      },
      {
        createdAt: "asc",
      },
    ],
    where: {
      OR: [
        ...(run.checkId
          ? [
              {
                checkId: run.checkId,
              },
            ]
          : []),
        {
          checkSnapshotKey: check.key,
        },
      ],
      retryGroupId,
    },
  });

  return runs.length > 0 ? runs : [run];
}

function mapAttemptNavigationRun(
  run: MappableRun,
  check: Pick<RunCheckSnapshot, "degradedResponseTime" | "id" | "type">,
  currentRunId: string,
  timeZone: string,
): RunDetailData["run"]["attempts"][number] {
  const status = getRunDashboardStatus(run, check);

  return {
    createdAtLabel: formatRunTimestamp(run.createdAt, timeZone),
    duration: formatDuration(run.durationMs ?? undefined),
    href: `/checks/${encodeURIComponent(check.id)}/runs/${encodeURIComponent(run.id)}`,
    id: run.id,
    isCurrent: run.id === currentRunId,
    label: `Attempt #${getRunAttempt(run)}`,
    runState: mapRunState(run.status),
    status,
    tone: mapRunTone(run.status, status),
  };
}

function mapRunPerformance(result: unknown): DashboardRunPerformance | undefined {
  const root = asRecord(result);
  const performance = firstRecord(
    root.performance,
    root.metrics,
    root.timings,
    root.webVitals,
    root.browser,
  );
  const timingsSource = firstRecord(
    performance.timings,
    performance.metrics,
    root.timings,
    root.metrics,
    root.webVitals,
    root.browser,
    performance,
  );
  const errors = firstRecord(root.errors, performance.errors);
  const timings: DashboardRunPerformance["timings"] = {
    dclMs: readMetricNumber(
      timingsSource,
      root,
      "dclMs",
      "dcl",
      "domContentLoadedMs",
      "domContentLoaded",
      "DOMContentLoaded",
    ),
    fcpMs: readMetricNumber(
      timingsSource,
      root,
      "fcpMs",
      "fcp",
      "firstContentfulPaint",
    ),
    lcpMs: readMetricNumber(
      timingsSource,
      root,
      "lcpMs",
      "lcp",
      "largestContentfulPaint",
    ),
    loadedMs: readMetricNumber(
      timingsSource,
      root,
      "loadedMs",
      "loaded",
      "load",
      "loadMs",
    ),
    tbtMs: readMetricNumber(timingsSource, root, "tbtMs", "tbt", "totalBlockingTime"),
    ttfbMs: readMetricNumber(timingsSource, root, "ttfbMs", "ttfb", "timeToFirstByte"),
  };
  const errorCounts: NonNullable<DashboardRunPerformance["errors"]> = {
    consoleErrors: readMetricNumber(errors, root, "consoleErrors", "console") ?? 0,
    documentErrors: readMetricNumber(errors, root, "documentErrors", "document") ?? 0,
    networkErrors: readMetricNumber(errors, root, "networkErrors", "network") ?? 0,
    scriptErrors: readMetricNumber(errors, root, "scriptErrors", "script") ?? 0,
  };
  const hasTiming = Object.values(timings).some((value) => typeof value === "number");
  const hasErrors = Object.values(errorCounts).some((value) => value > 0);

  if (!hasTiming && !hasErrors) {
    return undefined;
  }

  return {
    ...(hasErrors ? { errors: errorCounts } : {}),
    ...(hasTiming ? { timings } : {}),
  };
}

function firstRecord(...values: unknown[]): Record<string, unknown> {
  return values.map(asRecord).find((value) => Object.keys(value).length > 0) ?? {};
}

function readMetricNumber(
  primary: Record<string, unknown>,
  secondary: Record<string, unknown>,
  ...keys: string[]
): number | undefined {
  for (const source of [primary, secondary]) {
    for (const key of keys) {
      const value = source[key];

      if (typeof value === "number" && Number.isFinite(value)) {
        return value;
      }

      if (typeof value === "string") {
        const parsedValue = Number.parseFloat(value);

        if (Number.isFinite(parsedValue)) {
          return parsedValue;
        }
      }
    }
  }

  return undefined;
}

function hasRunRetries(result: unknown): boolean {
  if (!result || typeof result !== "object") {
    return false;
  }

  const value = result as {
    attempt?: unknown;
    attempts?: unknown;
    retries?: unknown;
    retry?: unknown;
  };

  return (
    numericRetryCount(value.retries) > 0 ||
    numericRetryCount(value.retry) > 0 ||
    numericRetryCount(value.attempts) > 1 ||
    arrayRetryCount(value.retries) > 0 ||
    arrayRetryCount(value.retry) > 0 ||
    arrayRetryCount(value.attempts) > 1
  );
}

function numericRetryCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function arrayRetryCount(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function getRunAttempt(run: Pick<MappableRun, "attempt">): number {
  return normalizePositiveInteger(run.attempt, 1);
}

function getRunMaxAttempts(run: Pick<MappableRun, "maxAttempts">): number {
  return normalizePositiveInteger(run.maxAttempts, 1);
}

function normalizePositiveInteger(
  value: number | null | undefined,
  fallback: number,
): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : fallback;
}

function formatRunRequest(
  request: unknown,
  result: unknown,
): RunDetailData["run"]["request"] {
  if (!request || typeof request !== "object") {
    return undefined;
  }

  const value = request as {
    assertions?: unknown;
    body?: unknown;
    headers?: unknown;
    method?: unknown;
    url?: unknown;
  };

  if (typeof value.method !== "string" || typeof value.url !== "string") {
    return undefined;
  }

  return {
    assertions: formatAssertionRows(value.assertions, result),
    body:
      typeof value.body === "string" && value.body.length > 0 ? value.body : undefined,
    headers: formatHeaderRows(value.headers),
    method: value.method,
    queryParams: formatQueryParams(value.url),
    url: value.url,
  };
}

function formatRunResponse(result: unknown): RunDetailData["run"]["response"] {
  const value = asRecord(result);
  const status = formatOptionalValue(value.status);
  const statusText = formatOptionalValue(value.statusText);
  const url = typeof value.url === "string" ? value.url : undefined;
  const body = formatResponseBody(value.body ?? value.responseBody);
  const headers = formatHeaderRows(value.headers ?? value.responseHeaders);

  if (!status && !statusText && !url && !body && headers.length === 0) {
    return undefined;
  }

  return {
    ...(body ? { body } : {}),
    headers,
    ...(status ? { status } : {}),
    ...(statusText ? { statusText } : {}),
    ...(url ? { url } : {}),
  };
}

function formatAssertionRows(
  assertions: unknown,
  result: unknown,
): NonNullable<RunDetailData["run"]["request"]>["assertions"] {
  if (!Array.isArray(assertions)) {
    return [];
  }

  return assertions.map((assertion) => {
    const value =
      assertion && typeof assertion === "object"
        ? (assertion as {
            operator?: unknown;
            source?: unknown;
            target?: unknown;
          })
        : {};
    const source = typeof value.source === "string" ? value.source : "response";
    const operator = typeof value.operator === "string" ? value.operator : "exists";
    const actualValue = getAssertionActual(source, result);

    return {
      actual: formatUnknownValue(actualValue),
      comparison: formatOperatorLabel(operator),
      passed: compareAssertion(operator, actualValue, value.target),
      source: formatSourceLabel(source),
      target: formatUnknownValue(value.target),
    };
  });
}

function getAssertionActual(source: string, result: unknown): unknown {
  const resultRecord = asRecord(result);
  const normalizedSource = source.toLowerCase();

  if (normalizedSource.includes("status")) {
    return resultRecord.status;
  }

  if (normalizedSource.includes("url")) {
    return resultRecord.url;
  }

  if (normalizedSource.includes("body")) {
    return resultRecord.body;
  }

  if (normalizedSource.includes("header")) {
    return resultRecord.headers;
  }

  return undefined;
}

function compareAssertion(
  operator: string,
  actualValue: unknown,
  targetValue: unknown,
): boolean | undefined {
  if (typeof actualValue === "undefined") {
    return undefined;
  }

  const normalizedOperator = operator.toLowerCase();

  if (["equal", "equals", "eq", "toequal"].includes(normalizedOperator)) {
    return String(actualValue) === String(targetValue);
  }

  if (["contains", "include", "includes"].includes(normalizedOperator)) {
    return String(actualValue).includes(String(targetValue));
  }

  if (["not_equal", "notequals", "not"].includes(normalizedOperator)) {
    return String(actualValue) !== String(targetValue);
  }

  return undefined;
}

function formatHeaderRows(headers: unknown): Array<{ name: string; value: string }> {
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) {
    return [];
  }

  return Object.entries(headers).map(([name, value]) => ({
    name,
    value: formatUnknownValue(value),
  }));
}

function formatOptionalValue(value: unknown): string | undefined {
  if (typeof value === "undefined" || value === null) {
    return undefined;
  }

  return formatUnknownValue(value);
}

function formatResponseBody(value: unknown): string | undefined {
  if (typeof value === "undefined" || value === null) {
    return undefined;
  }

  if (typeof value === "string") {
    return value.length > 0 ? value : undefined;
  }

  return JSON.stringify(value, null, 2);
}

function formatQueryParams(url: string): Array<{ name: string; value: string }> {
  try {
    const parsedUrl = new URL(url);

    return [...parsedUrl.searchParams.entries()].map(([name, value]) => ({
      name,
      value,
    }));
  } catch {
    return [];
  }
}

function formatResultFields(result: unknown): RunDetailData["run"]["resultFields"] {
  const record = asRecord(result);
  const hiddenFields = new Set([
    "aiAnalysis",
    "attempt",
    "attempts",
    "retries",
    "retryGroupId",
    "retryStrategy",
  ]);

  return Object.entries(record)
    .filter(([label]) => !hiddenFields.has(label))
    .map(([label, value]) => ({
      label: formatSourceLabel(label),
      value: formatUnknownValue(value),
    }));
}

function formatResultJson(result: unknown): string {
  if (typeof result === "undefined" || result === null) {
    return "{}";
  }

  return JSON.stringify(result, null, 2);
}

function formatAiAnalysis(result: unknown): RunDetailData["run"]["aiAnalysis"] {
  const value = asRecord(asRecord(result).aiAnalysis);
  const status = value.status === "completed" ? "completed" : "failed";
  const content = typeof value.content === "string" ? value.content : undefined;
  const error = typeof value.error === "string" ? value.error : undefined;

  if (!content && !error) {
    return undefined;
  }

  return {
    apiEndpoint: typeof value.apiEndpoint === "string" ? value.apiEndpoint : undefined,
    content,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : undefined,
    error,
    model: typeof value.model === "string" ? value.model : undefined,
    responseLanguage:
      typeof value.responseLanguage === "string" ? value.responseLanguage : undefined,
    status,
  };
}

async function readRunLogPreview(logsPath: string | null): Promise<string | undefined> {
  if (!logsPath) {
    return undefined;
  }

  try {
    const log = await readFile(logsPath, "utf8");

    if (log.length <= MAX_LOG_PREVIEW_CHARS) {
      return log;
    }

    return `... truncated ${log.length - MAX_LOG_PREVIEW_CHARS} chars ...\n${log.slice(
      -MAX_LOG_PREVIEW_CHARS,
    )}`;
  } catch {
    return undefined;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function formatUnknownValue(value: unknown): string {
  if (typeof value === "undefined" || value === null) {
    return "-";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value);
}

function formatOperatorLabel(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatSourceLabel(value: string): string {
  return formatOperatorLabel(value);
}

function mapRunArtifacts(run: MappableRun): DashboardRunArtifact[] {
  const artifacts = run.artifacts.map((artifact) => ({
    downloadUrl: buildArtifactUrl(run.id, artifact.id, true),
    id: artifact.id,
    mimeType: artifact.mimeType ?? undefined,
    name: getArtifactFileName(artifact),
    size: formatBytes(artifact.sizeBytes ?? undefined),
    type: artifact.type.toLowerCase() as DashboardRunArtifact["type"],
    viewUrl: buildArtifactViewUrl(run.id, artifact.id, artifact.type),
  }));

  if (run.logsPath && !artifacts.some((artifact) => artifact.type === "log")) {
    artifacts.push({
      downloadUrl: buildArtifactUrl(run.id, "log", true),
      id: `${run.id}:log`,
      mimeType: "text/plain",
      name: path.basename(run.logsPath),
      size: "-",
      type: "log",
      viewUrl: buildArtifactUrl(run.id, "log"),
    });
  }

  return artifacts;
}

function buildArtifactViewUrl(runId: string, artifactId: string, type: string): string {
  if (type === "TRACE") {
    return `/runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(
      artifactId,
    )}/trace`;
  }

  return buildArtifactUrl(runId, artifactId);
}

function buildArtifactUrl(runId: string, artifactId: string, download = false): string {
  const url = `/api/runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(
    artifactId,
  )}`;

  return download ? `${url}?download=1` : url;
}

function formatRequestSettings(
  request: unknown,
): DashboardCheckRow["settings"]["request"] {
  if (!request || typeof request !== "object") {
    return undefined;
  }

  const value = request as {
    assertions?: unknown;
    body?: unknown;
    headers?: unknown;
    method?: unknown;
    url?: unknown;
  };

  if (typeof value.method !== "string" || typeof value.url !== "string") {
    return undefined;
  }

  return {
    assertions: Array.isArray(value.assertions) ? value.assertions.length : 0,
    body: typeof value.body === "string" && value.body.length > 0,
    headers:
      value.headers &&
      typeof value.headers === "object" &&
      !Array.isArray(value.headers)
        ? Object.keys(value.headers).length
        : 0,
    method: value.method,
    url: value.url,
  };
}

function summarizeGroups(groups: DashboardGroupRow[]): DashboardSummary {
  return groups
    .flatMap((group) => group.children ?? [])
    .reduce<DashboardSummary>(
      (summary, check) => {
        const isRunning = check.runState === "running";
        const isQueued = check.runState === "queued";

        return {
          ...summary,
          [check.status]: summary[check.status] + (isRunning || isQueued ? 0 : 1),
          queued: summary.queued + (isQueued ? 1 : 0),
          running: summary.running + (isRunning ? 1 : 0),
        };
      },
      {
        degraded: 0,
        failing: 0,
        passing: 0,
        queued: 0,
        running: 0,
      },
    );
}

function applyQueueCounts(
  summary: DashboardSummary,
  queue: DashboardQueueRow[],
): DashboardSummary {
  return {
    ...summary,
    queued: queue.filter((row) => row.runState === "queued").length,
    running: queue.filter((row) => row.runState === "running").length,
  };
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

function mapRunStatus(
  status: string | undefined,
  {
    degradedResponseTime,
    durationMs,
    type,
  }: {
    degradedResponseTime?: number | null;
    durationMs?: number | null;
    type?: string | null;
  } = {},
): DashboardStatus {
  if (status === "PASSED") {
    if (
      type === "API" &&
      typeof durationMs === "number" &&
      durationMs > (degradedResponseTime ?? defaultDegradedResponseTimeMs)
    ) {
      return "degraded";
    }

    return "passing";
  }

  if (status === "FAILED" || status === "TIMED_OUT" || status === "CANCELLED") {
    return "failing";
  }

  return "degraded";
}

function getRunDashboardStatus(
  run: MappableRun | TestSessionRunWithCheck | undefined,
  check?: Pick<CheckWithRuns, "degradedResponseTime" | "type">,
): DashboardStatus {
  if (!run) {
    return mapRunStatus(undefined);
  }

  const relatedCheck = "check" in run ? run.check : undefined;

  return mapRunStatus(run.status, {
    degradedResponseTime:
      run.checkSnapshotDegradedResponseTime ??
      relatedCheck?.degradedResponseTime ??
      check?.degradedResponseTime,
    durationMs: run.durationMs,
    type: run.checkSnapshotType ?? relatedCheck?.type ?? check?.type,
  });
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

function buildBars(
  runs: CheckWithRuns["runs"],
  checkId: string,
  timeZone: string,
  check: Pick<CheckWithRuns, "degradedResponseTime" | "type">,
): DashboardCheckRow["bars"] {
  if (runs.length === 0) {
    return Array.from({ length: 12 }, () => ({
      duration: "-",
      occurredAt: "No recorded run",
      runner: "Local runner",
      runState: "not_run" as const,
      status: "degraded" as const,
      tone: "warn" as const,
      value: MIN_RESULT_BAR_HEIGHT,
    }));
  }

  const groupedRuns = groupRetryAttempts(runs).slice(0, DASHBOARD_RESULT_BAR_COUNT);
  const maxDurationMs = Math.max(
    0,
    ...groupedRuns
      .map((attempts) => getLatestAttempt(attempts)?.durationMs)
      .filter((duration): duration is number => typeof duration === "number"),
  );

  return [...groupedRuns]
    .reverse()
    .map((attempts) => mapResultBar(attempts, checkId, maxDurationMs, timeZone, check));
}

function groupRetryAttempts(runs: CheckWithRuns["runs"]): CheckWithRuns["runs"][] {
  const groups = new Map<string, CheckWithRuns["runs"]>();

  for (const run of runs) {
    const retryGroupId = run.retryGroupId?.trim();
    const groupId = retryGroupId || run.id;
    groups.set(groupId, [...(groups.get(groupId) ?? []), run]);
  }

  return [...groups.values()]
    .map((attempts) => [...attempts].sort(compareAttemptsAscending))
    .sort((left, right) => {
      const leftLatest = getLatestAttempt(left);
      const rightLatest = getLatestAttempt(right);

      return (
        (rightLatest?.createdAt.getTime() ?? 0) - (leftLatest?.createdAt.getTime() ?? 0)
      );
    });
}

function mapResultBar(
  attempts: CheckWithRuns["runs"],
  checkId: string,
  maxDurationMs: number,
  timeZone: string,
  check: Pick<CheckWithRuns, "degradedResponseTime" | "type">,
): DashboardCheckRow["bars"][number] {
  const latestAttempt = getLatestAttempt(attempts) ?? attempts[0];
  const hasRetries = attempts.length > 1;
  const hasPassedAttempt = attempts.some((attempt) => attempt.status === "PASSED");
  const runState = hasPassedAttempt ? "passed" : mapRunState(latestAttempt?.status);
  const status = getRunDashboardStatus(latestAttempt, check);
  const tone =
    hasRetries && !hasPassedAttempt && status === "failing"
      ? "bad"
      : getRunResultTone({ runState, status });
  const durationMs = latestAttempt?.durationMs;
  const version = latestAttempt ? formatRunVersion(latestAttempt) : undefined;

  return {
    ...(hasRetries
      ? {
          attempts: attempts.map((attempt) =>
            mapResultBarAttempt(attempt, timeZone, check),
          ),
          hasRetries,
        }
      : {}),
    duration: formatDuration(durationMs ?? undefined),
    ...(latestAttempt ? { href: buildRunHref(checkId, latestAttempt.id) } : {}),
    occurredAt: latestAttempt
      ? formatBarTimestamp(latestAttempt, timeZone)
      : "No recorded run",
    runner: "Local runner",
    runState,
    status,
    tone,
    value: getRelativeBarHeight(durationMs, maxDurationMs),
    ...(version ? { version } : {}),
  };
}

function formatRunVersion(run: MappableRun): string | undefined {
  const gitRef = run.gitRef?.trim();
  const tagMatch = gitRef?.match(/^refs\/tags\/(.+)$/);

  if (tagMatch?.[1]) {
    return tagMatch[1];
  }

  const commitSha = run.commitSha?.trim();

  if (commitSha) {
    return commitSha.slice(0, 8);
  }

  return gitRef?.replace(/^refs\/heads\//, "") || undefined;
}

function mapResultBarAttempt(
  run: MappableRun,
  timeZone: string,
  check: Pick<CheckWithRuns, "degradedResponseTime" | "type">,
): NonNullable<DashboardCheckRow["bars"][number]["attempts"]>[number] {
  const status = getRunDashboardStatus(run, check);

  return {
    duration: formatDuration(run.durationMs ?? undefined),
    label: `Attempt #${getRunAttempt(run)}`,
    occurredAt: formatBarTimestamp(run, timeZone),
    runner: "Local runner",
    runState: mapRunState(run.status),
    status,
    tone: mapRunTone(run.status, status),
  };
}

function getLatestAttempt(
  attempts: CheckWithRuns["runs"],
): CheckWithRuns["runs"][number] | undefined {
  return attempts[attempts.length - 1];
}

function compareAttemptsAscending(
  left: CheckWithRuns["runs"][number],
  right: CheckWithRuns["runs"][number],
): number {
  const attemptRank = getRunAttempt(left) - getRunAttempt(right);

  if (attemptRank !== 0) {
    return attemptRank;
  }

  return left.createdAt.getTime() - right.createdAt.getTime();
}

function getRelativeBarHeight(
  durationMs: number | null | undefined,
  maxDurationMs: number,
): number {
  if (typeof durationMs !== "number" || maxDurationMs <= 0) {
    return MIN_RESULT_BAR_HEIGHT;
  }

  return Math.max(
    MIN_RESULT_BAR_HEIGHT,
    Math.round((durationMs / maxDurationMs) * MAX_RESULT_BAR_HEIGHT),
  );
}

function mapRunTone(
  status: string | undefined,
  dashboardStatus = mapRunStatus(status),
): DashboardResultTone {
  return getRunResultTone({
    runState: mapRunState(status),
    status: dashboardStatus,
  });
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

function formatBytes(value: number | undefined): string {
  if (typeof value !== "number") {
    return "-";
  }

  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${value} B`;
}

function formatRunAge(run: MappableRun | undefined, timeZone: string): string {
  if (!run) {
    return "not run yet";
  }

  if (run.status === "QUEUED") {
    return "queued";
  }

  if (run.status === "RUNNING") {
    return "running";
  }

  return formatRelative(run.createdAt, timeZone);
}

function formatBarTimestamp(run: MappableRun, timeZone: string): string {
  if (run.status === "QUEUED") {
    return "Queued";
  }

  if (run.status === "RUNNING") {
    return "Running";
  }

  return formatRunTimestamp(run.createdAt, timeZone);
}

function formatRunTimestamp(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    hour12: false,
    minute: "2-digit",
    month: "short",
    timeZone,
  }).formatToParts(date);
  const month = getDatePart(parts, "month");
  const day = getDatePart(parts, "day");
  const hour = getDatePart(parts, "hour");
  const minute = getDatePart(parts, "minute");

  return `${month} ${day} ${hour}:${minute}`;
}

function getDatePart(parts: Intl.DateTimeFormatPart[], type: string) {
  return parts.find((part) => part.type === type)?.value ?? "";
}

function formatLatestUpdate(checks: CheckWithRuns[], timeZone: string): string {
  const dates = checks
    .map((check) => check.runs[0]?.createdAt)
    .filter((date): date is Date => date instanceof Date);

  if (dates.length === 0) {
    return "not run yet";
  }

  return formatRelative(
    new Date(Math.max(...dates.map((date) => date.getTime()))),
    timeZone,
  );
}

function formatRelative(date: Date, timeZone: string): string {
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

  return `at ${new Intl.DateTimeFormat("en", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    hour12: false,
    minute: "2-digit",
    month: "short",
    timeZone,
    year: "numeric",
  }).format(date)}`;
}

function createEmptyDashboard(projectSlug: string): DashboardData {
  return {
    firewatch: {
      lookbackDays: FIREWATCH_LOOKBACK_DAYS,
      rows: [],
    },
    groups: [],
    projectSlug,
    queue: [],
    revision: "terminal:",
    summary: {
      degraded: 0,
      failing: 0,
      passing: 0,
      queued: 0,
      running: 0,
    },
  };
}

function createEmptyJournal(
  filters: JournalData["filters"],
  projects: ProjectFilterOption[],
): JournalData {
  return {
    filters,
    pagination: {
      from: 0,
      hasNext: false,
      hasPrevious: false,
      page: filters.page,
      pageSize: filters.pageSize,
      to: 0,
      total: 0,
      totalPages: 1,
    },
    projectSlug: "all",
    projects,
    runs: [],
  };
}

function createEmptyStatusLogs(page: number, pageSize: number): StatusLogsData {
  return {
    logs: [],
    pagination: {
      from: 0,
      hasNext: false,
      hasPrevious: false,
      page,
      pageSize,
      to: 0,
      total: 0,
      totalPages: 1,
    },
    projectSlug: "all",
  };
}
