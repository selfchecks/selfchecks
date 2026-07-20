import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  projectFindMany: vi.fn(),
  queryRaw: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: mocks.queryRaw,
    project: {
      findMany: mocks.projectFindMany,
    },
  },
}));

vi.mock("@/lib/runtime-config", () => ({
  getRuntimeTimeZone: () => "UTC",
}));

import { getUsageData } from "./usage-data";

describe("usage data", () => {
  afterEach(() => vi.resetAllMocks());

  it("groups completed API and browser tests by day and source", async () => {
    mocks.projectFindMany.mockResolvedValue([
      { id: "project_1", name: "Account", slug: "account" },
    ]);
    mocks.queryRaw.mockResolvedValue([
      {
        checkId: null,
        date: "2026-07-11",
        failed: 0n,
        kind: "day",
        name: null,
        passed: 1n,
        projectId: "project_1",
        projectSlug: null,
        scheduled: 1n,
        testSessions: 0n,
        total: 1n,
        type: "API",
      },
      {
        checkId: null,
        date: "2026-07-11",
        failed: 1n,
        kind: "day",
        name: null,
        passed: 0n,
        projectId: "project_1",
        projectSlug: null,
        scheduled: 0n,
        testSessions: 1n,
        total: 1n,
        type: "BROWSER",
      },
      {
        checkId: null,
        date: "2026-07-10",
        failed: 1n,
        kind: "day",
        name: null,
        passed: 0n,
        projectId: "project_1",
        projectSlug: null,
        scheduled: 0n,
        testSessions: 1n,
        total: 1n,
        type: "API",
      },
      {
        checkId: "check_1",
        date: null,
        failed: 1n,
        kind: "test",
        name: "Health API",
        passed: 1n,
        projectId: "project_1",
        projectSlug: "account",
        scheduled: 0n,
        testSessions: 0n,
        total: 2n,
        type: "API",
      },
      {
        checkId: "check_2",
        date: null,
        failed: 1n,
        kind: "test",
        name: "Checkout",
        passed: 0n,
        projectId: "project_1",
        projectSlug: "account",
        scheduled: 0n,
        testSessions: 0n,
        total: 1n,
        type: "BROWSER",
      },
    ]);

    const data = await getUsageData("default", new Date("2026-07-11T12:00:00.000Z"));

    expect(data.days).toHaveLength(30);
    expect(data.days.at(-1)).toEqual({
      api: 1,
      browser: 1,
      date: "2026-07-11",
      failed: 1,
      label: "Jul 11",
      passed: 1,
      projects: { project_1: 2 },
      scheduled: 1,
      testSessions: 1,
      total: 2,
    });
    expect(data.totals).toEqual({
      api: 2,
      browser: 1,
      failed: 2,
      passed: 1,
      scheduled: 1,
      successRate: 33,
      testSessions: 2,
      total: 3,
    });
    expect(data.unstableTests).toEqual([
      {
        checkId: "check_2",
        failed: 1,
        failureRate: 100,
        name: "Checkout",
        passed: 0,
        projectSlug: "account",
        total: 1,
        type: "browser",
      },
      {
        checkId: "check_1",
        failed: 1,
        failureRate: 50,
        name: "Health API",
        passed: 1,
        projectSlug: "account",
        total: 2,
        type: "api",
      },
    ]);
    const [sql, timeZone, cutoff] = mocks.queryRaw.mock.calls[0] ?? [];

    expect(Array.from(sql as TemplateStringsArray).join("?")).toContain(
      "WITH resolved_runs AS MATERIALIZED",
    );
    expect(timeZone).toBe("UTC");
    expect(cutoff).toEqual(new Date("2026-06-10T12:00:00.000Z"));
  });
});
