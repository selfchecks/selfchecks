import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkFindMany: vi.fn(),
  checkRunFindMany: vi.fn(),
  projectFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    check: { findMany: mocks.checkFindMany },
    checkRun: { findMany: mocks.checkRunFindMany },
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
    mocks.checkFindMany.mockResolvedValue([
      {
        id: "check_1",
        key: "health-api",
        name: "Health API",
        projectId: "project_1",
        project: { slug: "account" },
        type: "API",
      },
      {
        id: "check_2",
        key: "checkout",
        name: "Checkout",
        projectId: "project_1",
        project: { slug: "account" },
        type: "BROWSER",
      },
    ]);
    mocks.checkRunFindMany.mockResolvedValue([
      {
        check: {
          id: "check_1",
          name: "Health API",
          projectId: "project_1",
          type: "API",
        },
        checkSnapshotKey: "health-api",
        checkSnapshotName: "Health API",
        checkSnapshotType: null,
        finishedAt: new Date("2026-07-11T08:00:00.000Z"),
        status: "PASSED",
        testSessionId: null,
        project: { id: "project_1", name: "Account", slug: "account" },
      },
      {
        check: null,
        checkSnapshotKey: "checkout",
        checkSnapshotName: "Checkout",
        checkSnapshotType: "BROWSER",
        finishedAt: new Date("2026-07-11T09:00:00.000Z"),
        status: "FAILED",
        testSessionId: "session_1",
        project: { id: "project_1", name: "Account", slug: "account" },
      },
      {
        check: {
          id: "check_1",
          name: "Health API",
          projectId: "project_1",
          type: "API",
        },
        checkSnapshotKey: "health-api",
        checkSnapshotName: "Health API",
        checkSnapshotType: null,
        finishedAt: new Date("2026-07-10T20:00:00.000Z"),
        status: "TIMED_OUT",
        testSessionId: "session_1",
        project: { id: "project_1", name: "Account", slug: "account" },
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
    expect(mocks.checkRunFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ["PASSED", "FAILED", "TIMED_OUT", "CANCELLED"] },
        }),
      }),
    );
  });
});
