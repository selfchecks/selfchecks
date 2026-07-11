import type { CheckRunStatus, CheckType, Prisma } from "@prisma/client";

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
  total: number;
};

export type UnstableTest = {
  checkId?: string;
  failed: number;
  failureRate: number;
  name: string;
  passed: number;
  total: number;
  type: Lowercase<CheckType>;
};

export type UsageData = {
  days: UsageDay[];
  projectSlug: string;
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

type UsageRun = {
  check: { id: string; name: string; type: CheckType } | null;
  checkSnapshotKey: string | null;
  checkSnapshotName: string | null;
  checkSnapshotType: CheckType | null;
  finishedAt: Date | null;
  status: CheckRunStatus;
  testSessionId: string | null;
};

export async function getUsageData(
  projectSlug: string,
  now = new Date(),
): Promise<UsageData> {
  const timeZone = getRuntimeTimeZone();

  try {
    const project =
      (await prisma.project.findUnique({
        select: { id: true, slug: true },
        where: { slug: projectSlug },
      })) ??
      (await prisma.project.findFirst({
        orderBy: { createdAt: "desc" },
        select: { id: true, slug: true },
      }));

    const resolvedProjectSlug = project?.slug ?? projectSlug;
    const projectFilters: Prisma.CheckRunWhereInput[] = [
      ...(project ? [{ check: { projectId: project.id } }] : []),
      { checkSnapshotProjectSlug: resolvedProjectSlug },
    ];
    const runs = await prisma.checkRun.findMany({
      select: {
        check: { select: { id: true, name: true, type: true } },
        checkSnapshotKey: true,
        checkSnapshotName: true,
        checkSnapshotType: true,
        finishedAt: true,
        status: true,
        testSessionId: true,
      },
      where: {
        finishedAt: {
          gte: new Date(now.getTime() - (USAGE_RANGE_DAYS + 1) * 86_400_000),
        },
        OR: projectFilters,
        status: { in: [...completedStatuses] },
      },
    });

    return buildUsageData(resolvedProjectSlug, runs, now, timeZone);
  } catch (error) {
    console.warn("Unable to load usage data.", error);
    return buildUsageData(projectSlug, [], now, timeZone);
  }
}

function buildUsageData(
  projectSlug: string,
  runs: UsageRun[],
  now: Date,
  timeZone: string,
): UsageData {
  const dateKeys = getRecentDateKeys(now, timeZone, USAGE_RANGE_DAYS);
  const daysByDate = new Map(
    dateKeys.map((date) => [
      date,
      {
        api: 0,
        browser: 0,
        date,
        failed: 0,
        label: formatDateLabel(date),
        passed: 0,
        total: 0,
      },
    ]),
  );
  const tests = new Map<
    string,
    Omit<UnstableTest, "failureRate" | "type"> & { type: CheckType }
  >();
  let scheduled = 0;
  let testSessions = 0;

  for (const run of runs) {
    if (!run.finishedAt) continue;

    const day = daysByDate.get(formatDateKey(run.finishedAt, timeZone));
    const type = run.checkSnapshotType ?? run.check?.type;

    if (!day || !type) continue;

    if (type === "API") day.api += 1;
    if (type === "BROWSER") day.browser += 1;
    if (run.status === "PASSED") day.passed += 1;
    else day.failed += 1;
    day.total += 1;

    const testKey = run.check?.id ?? run.checkSnapshotKey ?? run.checkSnapshotName;
    const testName = run.check?.name ?? run.checkSnapshotName ?? run.checkSnapshotKey;
    if (testKey && testName) {
      const test = tests.get(testKey) ?? {
        checkId: run.check?.id,
        failed: 0,
        name: testName,
        passed: 0,
        total: 0,
        type,
      };
      if (run.status === "PASSED") test.passed += 1;
      else test.failed += 1;
      test.total += 1;
      tests.set(testKey, test);
    }

    if (run.testSessionId) testSessions += 1;
    else scheduled += 1;
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
    projectSlug,
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
