import type { CheckRunStatus, CheckType } from "@prisma/client";

import { prisma } from "./prisma";
import { getRuntimeTimeZone } from "./runtime-config";

const USAGE_RANGE_DAYS = 30;
const completedStatuses = ["PASSED", "FAILED", "TIMED_OUT", "CANCELLED"] as const;

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

type UsageRun = {
  check: {
    id: string;
    name: string;
    projectId: string;
    type: CheckType;
  } | null;
  checkSnapshotKey: string | null;
  checkSnapshotName: string | null;
  checkSnapshotType: CheckType | null;
  finishedAt: Date | null;
  status: CheckRunStatus;
  testSessionId: string | null;
  project: {
    id: string;
    name: string;
    slug: string;
  };
};

type UsageCheck = {
  id: string;
  key: string;
  name: string;
  projectId: string;
  projectSlug: string;
  type: CheckType;
};

export async function getUsageData(
  _projectSlug = "default",
  now = new Date(),
): Promise<UsageData> {
  const timeZone = getRuntimeTimeZone();

  try {
    const [projects, activeChecks, runs] = await Promise.all([
      prisma.project.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true, slug: true },
      }),
      prisma.check.findMany({
        select: {
          id: true,
          key: true,
          name: true,
          projectId: true,
          project: { select: { slug: true } },
          type: true,
        },
      }),
      prisma.checkRun.findMany({
        select: {
          check: { select: { id: true, name: true, projectId: true, type: true } },
          checkSnapshotKey: true,
          checkSnapshotName: true,
          checkSnapshotType: true,
          finishedAt: true,
          status: true,
          testSessionId: true,
          project: { select: { id: true, name: true, slug: true } },
        },
        where: {
          finishedAt: {
            gte: new Date(now.getTime() - (USAGE_RANGE_DAYS + 1) * 86_400_000),
          },
          status: { in: [...completedStatuses] },
        },
      }),
    ]);

    return buildUsageData(
      runs,
      activeChecks.map((check) => ({
        ...check,
        projectSlug: check.project.slug,
      })),
      projects,
      now,
      timeZone,
    );
  } catch (error) {
    console.warn("Unable to load usage data.", error);
    return buildUsageData([], [], [], now, timeZone);
  }
}

function buildUsageData(
  runs: UsageRun[],
  activeChecks: UsageCheck[],
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
  const tests = new Map<
    string,
    Omit<UnstableTest, "failureRate" | "type"> & { type: CheckType }
  >();
  const activeChecksByKey = new Map(
    activeChecks.map((check) => [`${check.projectId}:${check.key}`, check]),
  );
  let scheduled = 0;
  let testSessions = 0;

  for (const run of runs) {
    if (!run.finishedAt) continue;

    const day = daysByDate.get(formatDateKey(run.finishedAt, timeZone));
    const activeCheck =
      run.check ??
      (run.checkSnapshotKey
        ? activeChecksByKey.get(`${run.project.id}:${run.checkSnapshotKey}`)
        : undefined);
    const type = run.checkSnapshotType ?? activeCheck?.type;

    if (!day || !type) continue;

    if (type === "API") day.api += 1;
    if (type === "BROWSER") day.browser += 1;
    if (run.status === "PASSED") day.passed += 1;
    else day.failed += 1;
    day.total += 1;
    day.projects[run.project.id] = (day.projects[run.project.id] ?? 0) + 1;

    const testKey =
      activeCheck?.id ??
      (run.checkSnapshotKey
        ? `${run.project.id}:${run.checkSnapshotKey}`
        : run.checkSnapshotName);
    const testName = activeCheck?.name ?? run.checkSnapshotName ?? run.checkSnapshotKey;
    if (testKey && testName) {
      const test = tests.get(testKey) ?? {
        checkId: activeCheck?.id,
        failed: 0,
        name: testName,
        passed: 0,
        projectSlug: run.project.slug,
        total: 0,
        type,
      };
      if (run.status === "PASSED") test.passed += 1;
      else test.failed += 1;
      test.total += 1;
      tests.set(testKey, test);
    }

    if (run.testSessionId) {
      day.testSessions += 1;
      testSessions += 1;
    } else {
      day.scheduled += 1;
      scheduled += 1;
    }
  }

  const days = dateKeys.map((date) => daysByDate.get(date)!);
  const api = days.reduce((sum, day) => sum + day.api, 0);
  const browser = days.reduce((sum, day) => sum + day.browser, 0);
  const passed = days.reduce((sum, day) => sum + day.passed, 0);
  const failed = days.reduce((sum, day) => sum + day.failed, 0);
  const total = api + browser;
  const unstableTests = [...tests.values()]
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
