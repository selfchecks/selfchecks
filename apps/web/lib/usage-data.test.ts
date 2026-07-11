import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkRunFindMany: vi.fn(),
  projectFindFirst: vi.fn(),
  projectFindUnique: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    checkRun: { findMany: mocks.checkRunFindMany },
    project: {
      findFirst: mocks.projectFindFirst,
      findUnique: mocks.projectFindUnique,
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
    mocks.projectFindUnique.mockResolvedValue({ id: "project_1", slug: "default" });
    mocks.checkRunFindMany.mockResolvedValue([
      {
        check: { id: "check_1", name: "Health API", type: "API" },
        checkSnapshotKey: "health-api",
        checkSnapshotName: "Health API",
        checkSnapshotType: null,
        finishedAt: new Date("2026-07-11T08:00:00.000Z"),
        status: "PASSED",
        testSessionId: null,
      },
      {
        check: null,
        checkSnapshotKey: "checkout",
        checkSnapshotName: "Checkout",
        checkSnapshotType: "BROWSER",
        finishedAt: new Date("2026-07-11T09:00:00.000Z"),
        status: "FAILED",
        testSessionId: "session_1",
      },
      {
        check: { id: "check_1", name: "Health API", type: "API" },
        checkSnapshotKey: "health-api",
        checkSnapshotName: "Health API",
        checkSnapshotType: null,
        finishedAt: new Date("2026-07-10T20:00:00.000Z"),
        status: "TIMED_OUT",
        testSessionId: "session_1",
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
        checkId: undefined,
        failed: 1,
        failureRate: 100,
        name: "Checkout",
        passed: 0,
        total: 1,
        type: "browser",
      },
      {
        checkId: "check_1",
        failed: 1,
        failureRate: 50,
        name: "Health API",
        passed: 1,
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
