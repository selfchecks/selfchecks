import path from "node:path";
import { readFile } from "node:fs/promises";

import type { Prisma } from "@prisma/client";

import type {
  DashboardCheckRow,
  DashboardFirewatch,
  DashboardFirewatchRow,
  DashboardGroupRow,
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

const DEFAULT_QUEUED_RUN_TIMEOUT_MINUTES = 30;
const FIREWATCH_LOOKBACK_DAYS = 7;
const MAX_LOG_PREVIEW_CHARS = 12_000;
const MAX_RESULT_BAR_HEIGHT = 44;
const MIN_RESULT_BAR_HEIGHT = 8;

type DashboardData = {
  firewatch: DashboardFirewatch;
  groups: DashboardGroupRow[];
  projectSlug: string;
  summary: DashboardSummary;
};
type DashboardDataOptions = {
  onError?: "empty" | "throw";
};

export type TestSessionRunCountSummary = {
  failed: number;
  passed: number;
  queued: number;
  running: number;
  total: number;
};

export type TestSessionRow = {
  createdAt: string;
  createdAtLabel: string;
  duration: string;
  href: string;
  id: string;
  name?: string;
  runState: DashboardRunState;
  source?: string;
  status: DashboardStatus;
  summary: TestSessionRunCountSummary;
  targetUrl?: string;
  tone?: DashboardResultTone;
};

export type TestSessionsData = {
  projectSlug: string;
  sessions: TestSessionRow[];
};

export type TestSessionCheckRow = {
  checkHref: string;
  checkId: string;
  checkKey: string;
  checkName: string;
  checkType: DashboardCheckRow["type"];
  duration: string;
  groupName: string;
  latestRunHref: string;
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
  runHref: string;
  schedule: string;
  sessionName?: string;
};

export type JournalData = {
  filters: {
    page: number;
    pageSize: number;
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
  runs: JournalRunRow[];
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
  checkId?: string | null;
  checkSnapshotEntrypoint?: string | null;
  checkSnapshotGroupName?: string | null;
  checkSnapshotKey?: string | null;
  checkSnapshotName?: string | null;
  checkSnapshotProjectSlug?: string | null;
  checkSnapshotRequest?: unknown;
  checkSnapshotTags?: string[];
  checkSnapshotType?: string | null;
  id: string;
  logsPath: string | null;
  attempt?: number | null;
  maxAttempts?: number | null;
  result: unknown;
  retryGroupId?: string | null;
  status: string;
};
type CheckWithRuns = {
  enabled: boolean;
  entrypoint: string | null;
  frequencyMinutes: number | null;
  group: {
    name: string;
  } | null;
  id: string;
  key: string;
  name: string;
  request: unknown;
  runs: MappableRun[];
  tags: string[];
  type: string;
};
type TestSessionRunWithCheck = MappableRun & {
  check: {
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
  createdAt: Date;
  id: string;
  name: string | null;
  runs: TestSessionRunWithCheck[];
  source: string | null;
  status: string;
  targetUrl: string | null;
};
type RunCheckSnapshot = {
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
    frequencyMinutes: number | null;
    group: {
      name: string;
    } | null;
    id: string;
    key: string;
    name: string;
    tags: string[];
    type: string;
  };
  testSession: {
    name: string | null;
  } | null;
};

const JOURNAL_DEFAULT_PAGE_SIZE = 20;
const JOURNAL_MAX_PAGE_SIZE = 100;
const DASHBOARD_ACTIVE_RUN_STATUSES = ["QUEUED", "RUNNING"] as const;

export async function getDashboardData(
  projectSlug: string,
  options: DashboardDataOptions = {},
): Promise<DashboardData> {
  const timeZone = getRuntimeTimeZone();

  try {
    await cancelStaleQueuedRuns();

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
    const groups = buildGroups(checks, timeZone);

    return {
      firewatch: buildFirewatch(checks, timeZone),
      groups,
      projectSlug: project.slug,
      summary: summarizeGroups(groups),
    };
  } catch (error) {
    console.warn("Unable to load dashboard data.", error);

    if (options.onError === "throw") {
      throw error;
    }

    return createEmptyDashboard(projectSlug);
  }
}

export async function getCheckDetailShellData(
  checkId: string,
): Promise<CheckDetailData | undefined> {
  const timeZone = getRuntimeTimeZone();

  try {
    await cancelStaleQueuedRuns();

    const check = await prisma.check.findFirst({
      select: {
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
      check: mapCheck(shellCheck, timeZone),
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
    await cancelStaleQueuedRuns();

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
      check: mapCheck(check, timeZone),
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
    await cancelStaleQueuedRuns();

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
        ],
      },
    });

    if (!run) {
      return undefined;
    }

    const check = getRunCheckSnapshot(run as TestSessionRunWithCheck);
    const request = formatRunRequest(check.request, run.result);
    const attemptRuns = await fetchRunAttempts(run as MappableRun);
    const attempts = attemptRuns.map((attemptRun) =>
      mapAttemptNavigationRun(attemptRun, check.id, run.id, timeZone),
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
        ...mapRun(run, timeZone),
        attemptNumber: getRunAttempt(run),
        attempts,
        aiAnalysis: formatAiAnalysis(run.result),
        createdAtLabel: formatRunTimestamp(run.createdAt, timeZone),
        failedAttempts: attempts.filter((attempt) => attempt.status === "failing")
          .length,
        finishedAt: run.finishedAt ? formatRunTimestamp(run.finishedAt, timeZone) : "-",
        jobLog: await readRunLogPreview(run.logsPath),
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
  projectSlug: string,
  options: JournalDataOptions = {},
): Promise<JournalData> {
  const filters = normalizeJournalFilters(options);
  const timeZone = getRuntimeTimeZone();

  try {
    await cancelStaleQueuedRuns();

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
      return createEmptyJournal(projectSlug, filters);
    }

    const where = buildJournalWhere(project.id, filters);
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
      projectSlug: project.slug,
      runs: journalRuns.map((run) => mapJournalRun(run, timeZone)),
    };
  } catch (error) {
    console.warn("Unable to load journal data.", error);
    return createEmptyJournal(projectSlug, filters);
  }
}

export async function getTestSessionsData(
  projectSlug: string,
): Promise<TestSessionsData> {
  const timeZone = getRuntimeTimeZone();

  try {
    await cancelStaleQueuedRuns();

    const project = await findProjectForDashboard(projectSlug);
    const resolvedProjectSlug = project?.slug ?? projectSlug;
    const projectRunFilters: Prisma.CheckRunWhereInput[] = [
      ...(project
        ? [
            {
              check: {
                projectId: project.id,
              },
            },
          ]
        : []),
      {
        checkSnapshotProjectSlug: resolvedProjectSlug,
      },
    ];

    const sessions = await prisma.testSession.findMany({
      include: {
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
      take: 100,
      where: {
        kind: "TEST",
        runs: {
          some: {
            OR: projectRunFilters,
          },
        },
      },
    });

    return {
      projectSlug: resolvedProjectSlug,
      sessions: sessions.map((session) =>
        mapTestSession(session as TestSessionWithRuns, timeZone),
      ),
    };
  } catch (error) {
    console.warn("Unable to load test sessions data.", error);

    return {
      projectSlug,
      sessions: [],
    };
  }
}

export async function getTestSessionData(
  sessionId: string,
): Promise<TestSessionDetailData | undefined> {
  const timeZone = getRuntimeTimeZone();

  try {
    await cancelStaleQueuedRuns();

    const session = await prisma.testSession.findFirst({
      include: {
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

    const mappedSession = mapTestSession(session as TestSessionWithRuns, timeZone);
    const runs = session.runs as TestSessionRunWithCheck[];
    const firstCheck = runs[0] ? getRunCheckSnapshot(runs[0]) : undefined;

    return {
      projectSlug: firstCheck?.projectSlug ?? "default",
      session: {
        ...mappedSession,
        checks: mapTestSessionChecks(runs, session.id),
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
    await cancelStaleQueuedRuns();

    const session = await prisma.testSession.findFirst({
      include: {
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
      session: mapTestSession(session as TestSessionWithRuns, timeZone),
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
    query: options.query?.trim() ?? "",
    range: normalizeJournalRange(options.range),
    status: normalizeJournalStatus(options.status),
    type: normalizeJournalType(options.type),
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
  projectId: string,
  filters: JournalData["filters"],
): CheckRunWhere {
  const where: CheckRunWhere = {
    check: {
      enabled: true,
      projectId,
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

async function findProjectForDashboard(projectSlug: string) {
  return (
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
    }))
  );
}

function buildDashboardVisibleRunWhere(): Prisma.CheckRunWhereInput {
  return {
    OR: [
      {
        testSessionId: null,
      },
      {
        status: {
          in: [...DASHBOARD_ACTIVE_RUN_STATUSES],
        },
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
): TestSessionRow {
  const runs = session.runs;
  const latestRuns = getLatestRunsByCheck(runs);
  const summary = summarizeTestSessionRuns(latestRuns);

  return {
    createdAt: session.createdAt.toISOString(),
    createdAtLabel: formatRunTimestamp(session.createdAt, timeZone),
    duration: formatTestSessionDuration(runs),
    href: `/test-sessions/${encodeURIComponent(session.id)}`,
    id: session.id,
    name: session.name ?? undefined,
    runState: mapRunState(session.status),
    source: session.source ?? undefined,
    status: mapRunStatus(session.status),
    summary,
    targetUrl: session.targetUrl ?? undefined,
    tone: mapRunTone(session.status),
  };
}

function mapTestSessionChecks(
  runs: TestSessionRunWithCheck[],
  sessionId: string,
): TestSessionCheckRow[] {
  const runsByCheck = new Map<string, TestSessionRunWithCheck[]>();

  for (const run of runs) {
    const check = getRunCheckSnapshot(run);

    runsByCheck.set(check.id, [...(runsByCheck.get(check.id) ?? []), run]);
  }

  return [...runsByCheck.values()]
    .map((checkRuns) => {
      const latestRun = getLatestRun(checkRuns);
      const check = getRunCheckSnapshot(latestRun);

      return {
        checkHref: `/test-sessions/${encodeURIComponent(
          sessionId,
        )}/checks/${encodeURIComponent(check.id)}`,
        checkId: check.id,
        checkKey: check.key,
        checkName: check.name,
        checkType: check.type.toLowerCase() as DashboardCheckRow["type"],
        duration: formatDuration(latestRun.durationMs ?? undefined),
        groupName: check.groupName,
        latestRunHref: buildRunHref(check.id, latestRun.id),
        runCount: checkRuns.length,
        runState: mapRunState(latestRun.status),
        status: mapRunStatus(latestRun.status),
        target: formatTestRunTarget(latestRun),
        tone: mapRunTone(latestRun.status),
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
    const current = runsByCheck.get(check.id);

    if (!current || run.createdAt > current.createdAt) {
      runsByCheck.set(check.id, run);
    }
  }

  return [...runsByCheck.values()];
}

function getLatestRun(runs: TestSessionRunWithCheck[]): TestSessionRunWithCheck {
  return runs.reduce((latestRun, run) =>
    run.createdAt > latestRun.createdAt ? run : latestRun,
  );
}

function summarizeTestSessionRuns(
  runs: TestSessionRunWithCheck[],
): TestSessionRunCountSummary {
  return runs.reduce<TestSessionRunCountSummary>(
    (summary, run) => {
      const runState = mapRunState(run.status);
      const status = mapRunStatus(run.status);

      return {
        failed: summary.failed + (status === "failing" ? 1 : 0),
        passed: summary.passed + (status === "passing" ? 1 : 0),
        queued: summary.queued + (runState === "queued" ? 1 : 0),
        running: summary.running + (runState === "running" ? 1 : 0),
        total: summary.total + 1,
      };
    },
    {
      failed: 0,
      passed: 0,
      queued: 0,
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
    ...mapRun(run, timeZone),
    checkHref: `/checks/${encodeURIComponent(run.check.id)}`,
    checkId: run.check.id,
    checkKey: run.check.key,
    checkName: run.check.name,
    checkTags: run.check.tags,
    checkType: run.check.type.toLowerCase() as DashboardCheckRow["type"],
    createdAtLabel: formatRunTimestamp(run.createdAt, timeZone),
    groupName: run.check.group?.name ?? "Ungrouped",
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

async function fetchChecks(projectId: string) {
  return prisma.check.findMany({
    include: {
      group: true,
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

function buildGroups(checks: CheckWithRuns[], timeZone: string): DashboardGroupRow[] {
  const grouped = new Map<string, CheckWithRuns[]>();

  for (const check of checks) {
    const groupName = check.group?.name ?? "Ungrouped";
    grouped.set(groupName, [...(grouped.get(groupName) ?? []), check]);
  }

  return [...grouped.entries()].map(([name, groupChecks], index) => {
    const children = groupChecks.map((check) => mapCheck(check, timeZone));

    return {
      checks: `${children.length} checks`,
      children,
      expanded: index === 0,
      name,
      status: summarizeStatus(children.map((check) => check.status)),
      updated: formatLatestUpdate(groupChecks, timeZone),
    };
  });
}

function mapCheck(check: CheckWithRuns, timeZone: string): DashboardCheckRow {
  const latestRun = check.runs[0];
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
    bars: buildBars(check.runs, timeZone),
    delta: latestRun ? "24 h" : "-",
    hasTrace: Boolean(
      check.runs.some(
        (run) =>
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
    runs: check.runs.map((run) => mapRun(run, timeZone)),
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
    status: mapRunStatus(latestRun?.status),
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
  const latestRun = check.runs[0];

  if (!latestRun || mapRunStatus(latestRun.status) !== "failing") {
    return undefined;
  }

  const failingStreak: CheckWithRuns["runs"] = [];

  for (const run of check.runs) {
    if (mapRunStatus(run.status) !== "failing") {
      break;
    }

    failingStreak.push(run);
  }

  const firstFailingRun = failingStreak[failingStreak.length - 1];

  if (!firstFailingRun || firstFailingRun.createdAt < cutoff) {
    return undefined;
  }

  return {
    checkId: check.id,
    firstSeen: formatRunTimestamp(firstFailingRun.createdAt, timeZone),
    firstSeenAt: firstFailingRun.createdAt.toISOString(),
    groupName: check.group?.name ?? "Ungrouped",
    lastSeen: formatRelative(latestRun.createdAt, timeZone),
    lastSeenAt: latestRun.createdAt.toISOString(),
    name: check.name,
    type: check.type.toLowerCase() as DashboardCheckRow["type"],
  };
}

function mapRun(run: MappableRun, timeZone: string): DashboardRunRow {
  const maxAttempts = getRunMaxAttempts(run);

  return {
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
    status: mapRunStatus(run.status),
    tone: mapRunTone(run.status),
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
  checkId: string,
  currentRunId: string,
  timeZone: string,
): RunDetailData["run"]["attempts"][number] {
  return {
    createdAtLabel: formatRunTimestamp(run.createdAt, timeZone),
    duration: formatDuration(run.durationMs ?? undefined),
    href: `/checks/${encodeURIComponent(checkId)}/runs/${encodeURIComponent(run.id)}`,
    id: run.id,
    isCurrent: run.id === currentRunId,
    label: `Attempt #${getRunAttempt(run)}`,
    runState: mapRunState(run.status),
    status: mapRunStatus(run.status),
    tone: mapRunTone(run.status),
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

async function cancelStaleQueuedRuns(now = new Date()) {
  const timeoutMinutes = parsePositiveInteger(
    process.env.SELFCHECKS_QUEUED_RUN_TIMEOUT_MINUTES,
    DEFAULT_QUEUED_RUN_TIMEOUT_MINUTES,
  );
  const cutoff = new Date(now.getTime() - timeoutMinutes * 60_000);

  try {
    await prisma.checkRun.updateMany({
      data: {
        errorMessage: `Run was cancelled after waiting in queue for ${timeoutMinutes} minutes.`,
        finishedAt: now,
        status: "CANCELLED",
      },
      where: {
        createdAt: {
          lt: cutoff,
        },
        status: "QUEUED",
      },
    });
  } catch (error) {
    console.warn("Unable to cancel stale queued runs.", error);
  }
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsedValue = Number.parseInt(value, 10);

  if (!Number.isSafeInteger(parsedValue) || parsedValue <= 0) {
    return fallback;
  }

  return parsedValue;
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

function buildBars(
  runs: CheckWithRuns["runs"],
  timeZone: string,
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

  const maxDurationMs = Math.max(
    0,
    ...runs
      .map((run) => run.durationMs)
      .filter((duration): duration is number => typeof duration === "number"),
  );

  return [...runs].reverse().map((run) => ({
    duration: formatDuration(run.durationMs ?? undefined),
    occurredAt: formatBarTimestamp(run, timeZone),
    runner: "Local runner",
    runState: mapRunState(run.status),
    status: mapRunStatus(run.status),
    tone: mapRunTone(run.status),
    value: getRelativeBarHeight(run.durationMs, maxDurationMs),
  }));
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

function mapRunTone(status: string | undefined): DashboardResultTone {
  return getRunResultTone({
    runState: mapRunState(status),
    status: mapRunStatus(status),
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
  projectSlug: string,
  filters: JournalData["filters"],
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
    projectSlug,
    runs: [],
  };
}
