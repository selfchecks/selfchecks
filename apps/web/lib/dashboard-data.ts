import path from "node:path";
import { readFile } from "node:fs/promises";

import type {
  DashboardCheckRow,
  DashboardGroupRow,
  DashboardRunArtifact,
  DashboardRunPerformance,
  DashboardRunRow,
  DashboardRunState,
  DashboardResultBar,
  DashboardStatus,
  DashboardSummary,
} from "./dashboard-types";
import { prisma } from "./prisma";

const DEFAULT_QUEUED_RUN_TIMEOUT_MINUTES = 30;
const MAX_LOG_PREVIEW_CHARS = 12_000;

type DashboardData = {
  groups: DashboardGroupRow[];
  projectSlug: string;
  summary: DashboardSummary;
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
    createdAtLabel: string;
    finishedAt: string;
    jobLog?: string;
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

type CheckWithRuns = Awaited<ReturnType<typeof fetchChecks>>[number];
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
  id: string;
  logsPath: string | null;
  result: unknown;
  status: string;
};

const JOURNAL_DEFAULT_PAGE_SIZE = 20;
const JOURNAL_MAX_PAGE_SIZE = 100;

export async function getDashboardData(projectSlug: string): Promise<DashboardData> {
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

export async function getCheckDetailData(
  checkId: string,
): Promise<CheckDetailData | undefined> {
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
      check: mapCheck(check),
      groupName: check.group?.name ?? "Ungrouped",
      projectSlug: check.project.slug,
      updated: formatLatestUpdate([check]),
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
        check: {
          enabled: true,
        },
        checkId,
        id: runId,
      },
    });

    if (!run) {
      return undefined;
    }

    const request = formatRunRequest(run.check.request, run.result);

    return {
      check: {
        id: run.check.id,
        name: run.check.name,
        settings: {
          enabled: run.check.enabled,
          entrypoint: run.check.entrypoint ?? undefined,
          frequency:
            typeof run.check.frequencyMinutes === "number"
              ? `${run.check.frequencyMinutes} min`
              : "manual",
          key: run.check.key,
          request: formatRequestSettings(run.check.request),
        },
        tags: run.check.tags,
        type: run.check.type.toLowerCase() as DashboardCheckRow["type"],
      },
      groupName: run.check.group?.name ?? "Ungrouped",
      projectSlug: run.check.project.slug,
      run: {
        ...mapRun(run),
        aiAnalysis: formatAiAnalysis(run.result),
        createdAtLabel: formatRunTimestamp(run.createdAt),
        finishedAt: run.finishedAt ? formatRunTimestamp(run.finishedAt) : "-",
        jobLog: await readRunLogPreview(run.logsPath),
        request,
        response: formatRunResponse(run.result),
        resultFields: formatResultFields(run.result),
        resultJson: formatResultJson(run.result),
        startedAt: run.startedAt ? formatRunTimestamp(run.startedAt) : "-",
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
        to: skip + runs.length,
        total,
        totalPages,
      },
      projectSlug: project.slug,
      runs: runs.map(mapJournalRun),
    };
  } catch (error) {
    console.warn("Unable to load journal data.", error);
    return createEmptyJournal(projectSlug, filters);
  }
}

function normalizeJournalFilters(
  options: JournalDataOptions,
): JournalData["filters"] {
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

function mapJournalRun(
  run: MappableRun & {
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
  },
): JournalRunRow {
  return {
    ...mapRun(run),
    checkHref: `/checks/${encodeURIComponent(run.check.id)}`,
    checkId: run.check.id,
    checkKey: run.check.key,
    checkName: run.check.name,
    checkTags: run.check.tags,
    checkType: run.check.type.toLowerCase() as DashboardCheckRow["type"],
    createdAtLabel: formatRunTimestamp(run.createdAt),
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
  const passedRuns = check.runs.filter((run) => run.status === "PASSED").length;
  const failedRuns = check.runs.filter((run) =>
    ["CANCELLED", "FAILED", "TIMED_OUT"].includes(run.status),
  ).length;

  return {
    avg: formatDuration(average(durations)),
    ava: formatAvailability(check.runs),
    bars: buildBars(check.runs),
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
    runs: check.runs.map(mapRun),
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
    time: formatRunAge(latestRun),
    type: check.type.toLowerCase() as DashboardCheckRow["type"],
  };
}

function mapRun(run: MappableRun): DashboardRunRow {
  return {
    artifacts: mapRunArtifacts(run),
    createdAt: run.createdAt.toISOString(),
    duration: formatDuration(run.durationMs ?? undefined),
    durationMs: run.durationMs ?? undefined,
    errorMessage: run.errorMessage ?? undefined,
    hasRetries: hasRunRetries(run.result),
    id: run.id,
    occurredAt: formatBarTimestamp(run),
    performance: mapRunPerformance(run.result),
    runner: "Local runner",
    runState: mapRunState(run.status),
    status: mapRunStatus(run.status),
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

  return [value.retries, value.retry, value.attempts, value.attempt].some((item) => {
    if (typeof item === "number") {
      return item > 0;
    }

    if (Array.isArray(item)) {
      return item.length > 0;
    }

    return false;
  });
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

  return Object.entries(record)
    .filter(([label]) => label !== "aiAnalysis")
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
    name: path.basename(artifact.path),
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

        return {
          ...summary,
          [check.status]: summary[check.status] + (isRunning ? 0 : 1),
          running: summary.running + (isRunning ? 1 : 0),
        };
      },
      {
        degraded: 0,
        failing: 0,
        passing: 0,
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
    tone: mapRunTone(run.status),
    value: Math.max(8, Math.min(44, Math.round((run.durationMs ?? 500) / 40))),
  }));
}

function mapRunTone(status: string | undefined): NonNullable<DashboardResultBar["tone"]> {
  if (status === "RUNNING") {
    return "active";
  }

  if (status === "PASSED") {
    return "good";
  }

  if (status === "FAILED" || status === "TIMED_OUT" || status === "CANCELLED") {
    return "bad";
  }

  return "warn";
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

function formatRunAge(run: MappableRun | undefined): string {
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

function formatBarTimestamp(run: MappableRun): string {
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
