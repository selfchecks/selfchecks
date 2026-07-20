import type { CheckType } from "@prisma/client";

import { prisma } from "./prisma";
import { getRuntimeTimeZone } from "./runtime-config";

const USAGE_RANGE_DAYS = 30;

export type UsageDay = {
  api: number;
  browser: number;
  date: string;
  failed: number;
  label: string;
  passed: number;
  projects: Record<string, number>;
  scheduled: number;
  testSessions: number;
  total: number;
};

export type UnstableTest = {
  checkId?: string;
  failed: number;
  failureRate: number;
  name: string;
  passed: number;
  projectSlug: string;
  total: number;
  type: Lowercase<CheckType>;
};

export type UsageData = {
  days: UsageDay[];
  projectSlug: string;
  projects: UsageProject[];
  rangeDays: number;
  unstableTests: UnstableTest[];
  totals: {
    api: number;
    browser: number;
    failed: number;
    passed: number;
    scheduled: number;
    successRate: number;
    testSessions: number;
    total: number;
  };
};

export type UsageProject = {
  color: string;
  id: string;
  name: string;
  slug: string;
  total: number;
};

type UsageAggregateRow = {
  checkId: string | null;
  date: string | null;
  failed: bigint;
  kind: "day" | "test";
  name: string | null;
  passed: bigint;
  projectId: string;
  projectSlug: string | null;
  scheduled: bigint;
  testSessions: bigint;
  total: bigint;
  type: CheckType;
};

export async function getUsageData(
  _projectSlug = "default",
  now = new Date(),
): Promise<UsageData> {
  const timeZone = getRuntimeTimeZone();
  const cutoff = new Date(now.getTime() - (USAGE_RANGE_DAYS + 1) * 86_400_000);

  try {
    const [projects, aggregates] = await Promise.all([
      prisma.project.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true, slug: true },
      }),
      fetchUsageAggregates(cutoff, timeZone),
    ]);

    return buildUsageData(aggregates, projects, now, timeZone);
  } catch (error) {
    console.warn("Unable to load usage data.", error);
    return buildUsageData([], [], now, timeZone);
  }
}

async function fetchUsageAggregates(
  cutoff: Date,
  timeZone: string,
): Promise<UsageAggregateRow[]> {
  return prisma.$queryRaw<UsageAggregateRow[]>`
    WITH resolved_runs AS MATERIALIZED (
      SELECT
        timezone(${timeZone}, run."finishedAt" AT TIME ZONE 'UTC')::date::text AS "date",
        run."projectId",
        project."slug" AS "projectSlug",
        COALESCE(run."checkSnapshotType", direct_check."type", snapshot_check."type")::text AS "type",
        COALESCE(direct_check."id", snapshot_check."id") AS "checkId",
        COALESCE(
          direct_check."id",
          snapshot_check."id",
          CASE
            WHEN run."checkSnapshotKey" IS NOT NULL
              THEN run."projectId" || ':' || run."checkSnapshotKey"
            ELSE run."checkSnapshotName"
          END
        ) AS "testKey",
        COALESCE(
          direct_check."name",
          snapshot_check."name",
          run."checkSnapshotName",
          run."checkSnapshotKey"
        ) AS "name",
        run."status"::text AS "status",
        run."testSessionId"
      FROM "CheckRun" AS run
      INNER JOIN "Project" AS project ON project."id" = run."projectId"
      LEFT JOIN "Check" AS direct_check ON direct_check."id" = run."checkId"
      LEFT JOIN "Check" AS snapshot_check
        ON snapshot_check."projectId" = run."projectId"
        AND snapshot_check."key" = run."checkSnapshotKey"
      WHERE
        run."finishedAt" >= ${cutoff}
        AND run."status" IN (
          'PASSED'::"CheckRunStatus",
          'FAILED'::"CheckRunStatus",
          'TIMED_OUT'::"CheckRunStatus",
          'CANCELLED'::"CheckRunStatus"
        )
    )
    SELECT
      'day'::text AS "kind",
      "date",
      "projectId",
      NULL::text AS "projectSlug",
      NULL::text AS "checkId",
      NULL::text AS "name",
      "type",
      COUNT(*) FILTER (WHERE "status" = 'PASSED') AS "passed",
      COUNT(*) FILTER (WHERE "status" <> 'PASSED') AS "failed",
      COUNT(*) FILTER (WHERE "testSessionId" IS NULL) AS "scheduled",
      COUNT(*) FILTER (WHERE "testSessionId" IS NOT NULL) AS "testSessions",
      COUNT(*) AS "total"
    FROM resolved_runs
    WHERE "type" IS NOT NULL
    GROUP BY "date", "projectId", "type"

    UNION ALL

    SELECT
      'test'::text AS "kind",
      NULL::text AS "date",
      "projectId",
      "projectSlug",
      "checkId",
      "name",
      "type",
      COUNT(*) FILTER (WHERE "status" = 'PASSED') AS "passed",
      COUNT(*) FILTER (WHERE "status" <> 'PASSED') AS "failed",
      0::bigint AS "scheduled",
      0::bigint AS "testSessions",
      COUNT(*) AS "total"
    FROM resolved_runs
    WHERE "type" IS NOT NULL AND "testKey" IS NOT NULL AND "name" IS NOT NULL
    GROUP BY "projectId", "projectSlug", "testKey", "checkId", "name", "type"
  `;
}

function buildUsageData(
  aggregates: UsageAggregateRow[],
  projects: Array<{ id: string; name: string; slug: string }>,
  now: Date,
  timeZone: string,
): UsageData {
  const dateKeys = getRecentDateKeys(now, timeZone, USAGE_RANGE_DAYS);
  const daysByDate = new Map<string, UsageDay>(
    dateKeys.map((date) => [
      date,
      {
        api: 0,
        browser: 0,
        date,
        failed: 0,
        label: formatDateLabel(date),
        passed: 0,
        projects: {},
        scheduled: 0,
        testSessions: 0,
        total: 0,
      },
    ]),
  );
  const tests: Array<
    Omit<UnstableTest, "failureRate" | "type"> & {
      type: CheckType;
    }
  > = [];

  for (const aggregate of aggregates) {
    if (aggregate.kind === "test") {
      if (aggregate.name && aggregate.projectSlug) {
        tests.push({
          checkId: aggregate.checkId ?? undefined,
          failed: Number(aggregate.failed),
          name: aggregate.name,
          passed: Number(aggregate.passed),
          projectSlug: aggregate.projectSlug,
          total: Number(aggregate.total),
          type: aggregate.type,
        });
      }

      continue;
    }

    const day = aggregate.date ? daysByDate.get(aggregate.date) : undefined;

    if (!day) {
      continue;
    }

    const total = Number(aggregate.total);
    day.api += aggregate.type === "API" ? total : 0;
    day.browser += aggregate.type === "BROWSER" ? total : 0;
    day.failed += Number(aggregate.failed);
    day.passed += Number(aggregate.passed);
    day.projects[aggregate.projectId] =
      (day.projects[aggregate.projectId] ?? 0) + total;
    day.scheduled += Number(aggregate.scheduled);
    day.testSessions += Number(aggregate.testSessions);
    day.total += total;
  }

  const days = dateKeys.map((date) => daysByDate.get(date)!);
  const api = days.reduce((sum, day) => sum + day.api, 0);
  const browser = days.reduce((sum, day) => sum + day.browser, 0);
  const passed = days.reduce((sum, day) => sum + day.passed, 0);
  const failed = days.reduce((sum, day) => sum + day.failed, 0);
  const total = api + browser;
  const scheduled = days.reduce((sum, day) => sum + day.scheduled, 0);
  const testSessions = days.reduce((sum, day) => sum + day.testSessions, 0);
  const unstableTests = tests
    .filter((test) => test.failed > 0)
    .map((test) => ({
      ...test,
      failureRate: getPercentage(test.failed, test.total),
      type: test.type.toLowerCase() as Lowercase<CheckType>,
    }))
    .sort(
      (left, right) =>
        right.failureRate - left.failureRate ||
        right.failed - left.failed ||
        right.total - left.total,
    )
    .slice(0, 5);

  return {
    days,
    projectSlug: "all",
    projects: projects.map((project, index) => ({
      ...project,
      color: getProjectColor(index),
      total: days.reduce((sum, day) => sum + (day.projects[project.id] ?? 0), 0),
    })),
    rangeDays: USAGE_RANGE_DAYS,
    unstableTests,
    totals: {
      api,
      browser,
      failed,
      passed,
      scheduled,
      successRate: getPercentage(passed, total),
      testSessions,
      total,
    },
  };
}

function getProjectColor(index: number): string {
  const colors = [
    "#38bdf8",
    "#a78bfa",
    "#34d399",
    "#fbbf24",
    "#fb7185",
    "#22d3ee",
    "#f472b6",
    "#a3e635",
  ];

  return colors[index % colors.length]!;
}

function getPercentage(value: number, total: number) {
  return total === 0 ? 0 : Math.round((value / total) * 100);
}

function getRecentDateKeys(now: Date, timeZone: string, count: number) {
  const [year = 1970, month = 1, day = 1] = formatDateKey(now, timeZone)
    .split("-")
    .map(Number);
  const anchor = Date.UTC(year, month - 1, day);

  return Array.from({ length: count }, (_, index) =>
    new Date(anchor - (count - index - 1) * 86_400_000).toISOString().slice(0, 10),
  );
}

function formatDateKey(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";

  return `${part("year")}-${part("month")}-${part("day")}`;
}

function formatDateLabel(date: string) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}
