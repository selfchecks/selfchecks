import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkFindFirst: vi.fn(),
  checkFindMany: vi.fn(),
  checkRunCount: vi.fn(),
  checkRunFindFirst: vi.fn(),
  checkRunFindMany: vi.fn(),
  checkRunUpdateMany: vi.fn(),
  projectFindFirst: vi.fn(),
  projectFindUnique: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    check: {
      findFirst: mocks.checkFindFirst,
      findMany: mocks.checkFindMany,
    },
    checkRun: {
      count: mocks.checkRunCount,
      findFirst: mocks.checkRunFindFirst,
      findMany: mocks.checkRunFindMany,
      updateMany: mocks.checkRunUpdateMany,
    },
    project: {
      findFirst: mocks.projectFindFirst,
      findUnique: mocks.projectFindUnique,
    },
  },
}));

import {
  getCheckDetailData,
  getDashboardData,
  getJournalData,
  getRunDetailData,
} from "./dashboard-data";

describe("dashboard data", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    delete process.env.SELFCHECKS_QUEUED_RUN_TIMEOUT_MINUTES;
  });

  it("cancels stale queued runs before reading check details", async () => {
    const now = new Date("2026-06-24T09:00:00.000Z");

    vi.useFakeTimers();
    vi.setSystemTime(now);
    mocks.checkRunUpdateMany.mockResolvedValue({ count: 1 });
    mocks.checkFindFirst.mockResolvedValue(null);

    await expect(getCheckDetailData("check_1")).resolves.toBeUndefined();

    expect(mocks.checkRunUpdateMany).toHaveBeenCalledWith({
      data: {
        errorMessage: "Run was cancelled after waiting in queue for 30 minutes.",
        finishedAt: now,
        status: "CANCELLED",
      },
      where: {
        createdAt: {
          lt: new Date("2026-06-24T08:30:00.000Z"),
        },
        status: "QUEUED",
      },
    });
    expect(mocks.checkFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          enabled: true,
          id: "check_1",
        },
      }),
    );
  });

  it("loads run details with request, result and artifacts", async () => {
    const createdAt = new Date("2026-06-24T13:20:03.000Z");

    mocks.checkRunUpdateMany.mockResolvedValue({ count: 0 });
    mocks.checkRunFindFirst.mockResolvedValue({
      artifacts: [
        {
          createdAt,
          id: "artifact_1",
          mimeType: "application/zip",
          path: "/tmp/trace.zip",
          sizeBytes: 43_008,
          type: "TRACE",
        },
      ],
      check: {
        enabled: true,
        entrypoint: null,
        frequencyMinutes: 180,
        group: {
          name: "API / Bff",
        },
        id: "check_1",
        key: "bff-gtm-js",
        name: "bff-gtm-js",
        project: {
          slug: "default",
        },
        request: {
          assertions: [
            {
              operator: "equals",
              source: "status",
              target: 200,
            },
          ],
          headers: {
            accept: "application/json",
          },
          method: "GET",
          url: "https://bff.sndsy.ru/gtm.js?id=GTM-MP43XM",
        },
        tags: ["api", "bff"],
        type: "API",
      },
      checkId: "check_1",
      createdAt,
      durationMs: 2390,
      errorMessage: null,
      finishedAt: createdAt,
      id: "run_1",
      logsPath: null,
      result: {
        body: '{"ok":true}',
        headers: {
          "content-type": "application/json",
        },
        performance: {
          errors: {
            networkErrors: 7,
          },
          timings: {
            fcpMs: 6600,
            lcpMs: 7010,
            tbtMs: 1870,
            ttfbMs: 239,
          },
        },
        aiAnalysis: {
          apiEndpoint: "https://openrouter.ai/api/v1",
          content: "Вероятная причина: upstream вернул 500.",
          createdAt: "2026-06-24T13:21:00.000Z",
          model: "openai/gpt-5-mini",
          responseLanguage: "Russian",
          status: "completed",
        },
        status: 200,
        statusText: "OK",
        url: "https://bff.sndsy.ru/gtm.js?id=GTM-MP43XM",
      },
      startedAt: createdAt,
      status: "PASSED",
    });

    const detail = await getRunDetailData("check_1", "run_1");

    expect(mocks.checkRunFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          check: {
            enabled: true,
          },
          checkId: "check_1",
          id: "run_1",
        },
      }),
    );
    expect(detail?.check.name).toBe("bff-gtm-js");
    expect(detail?.groupName).toBe("API / Bff");
    expect(detail?.projectSlug).toBe("default");
    expect(detail?.run.duration).toBe("2.39 s");
    expect(detail?.run.response).toMatchObject({
      body: '{"ok":true}',
      headers: [
        {
          name: "content-type",
          value: "application/json",
        },
      ],
      status: "200",
      statusText: "OK",
      url: "https://bff.sndsy.ru/gtm.js?id=GTM-MP43XM",
    });
    expect(detail?.run.performance).toMatchObject({
      errors: {
        networkErrors: 7,
      },
      timings: {
        fcpMs: 6600,
        lcpMs: 7010,
        tbtMs: 1870,
        ttfbMs: 239,
      },
    });
    expect(detail?.run.resultFields).toContainEqual({
      label: "Status",
      value: "200",
    });
    expect(detail?.run.resultFields).not.toContainEqual(
      expect.objectContaining({
        label: "Ai Analysis",
      }),
    );
    expect(detail?.run.aiAnalysis).toMatchObject({
      apiEndpoint: "https://openrouter.ai/api/v1",
      content: "Вероятная причина: upstream вернул 500.",
      model: "openai/gpt-5-mini",
      status: "completed",
    });
    expect(detail?.run.request?.queryParams).toEqual([
      {
        name: "id",
        value: "GTM-MP43XM",
      },
    ]);
    expect(detail?.run.request?.assertions[0]).toMatchObject({
      actual: "200",
      comparison: "Equals",
      passed: true,
      source: "Status",
      target: "200",
    });
    expect(detail?.run.artifacts[0]).toMatchObject({
      downloadUrl: "/api/runs/run_1/artifacts/artifact_1?download=1",
      name: "trace.zip",
      size: "42.0 KB",
      type: "trace",
      viewUrl: "/runs/run_1/artifacts/artifact_1/trace",
    });
  });

  it("marks failed and cancelled historical result bars with distinct tones", async () => {
    mocks.checkRunUpdateMany.mockResolvedValue({ count: 0 });
    mocks.projectFindUnique.mockResolvedValue({
      id: "project_1",
      slug: "default",
    });
    mocks.checkFindMany.mockResolvedValue([
      {
        enabled: true,
        entrypoint: null,
        frequencyMinutes: 180,
        group: {
          name: "API / Bff",
        },
        id: "check_1",
        key: "bff-health",
        name: "bff-health",
        request: {
          assertions: [],
          headers: {},
          method: "GET",
          url: "https://example.test/health",
        },
        runs: [
          {
            artifacts: [],
            createdAt: new Date("2026-07-05T09:40:00.000Z"),
            durationMs: null,
            id: "run_queued",
            logsPath: null,
            result: null,
            status: "QUEUED",
          },
          {
            artifacts: [],
            createdAt: new Date("2026-07-05T09:38:00.000Z"),
            durationMs: 6,
            id: "run_failed",
            logsPath: null,
            result: null,
            status: "FAILED",
          },
          {
            artifacts: [],
            createdAt: new Date("2026-07-05T09:37:00.000Z"),
            durationMs: null,
            id: "run_cancelled",
            logsPath: null,
            result: null,
            status: "CANCELLED",
          },
        ],
        tags: ["api", "bff"],
        type: "API",
      },
    ]);

    const dashboard = await getDashboardData("default");
    const check = dashboard.groups[0]?.children?.[0];

    expect(check).toMatchObject({
      runState: "queued",
      status: "degraded",
    });
    expect(dashboard.summary).toMatchObject({
      degraded: 1,
      failing: 0,
      passing: 0,
      running: 0,
    });
    expect(check?.bars).toEqual([
      expect.objectContaining({
        runState: "cancelled",
        status: "failing",
        tone: "muted",
      }),
      expect.objectContaining({
        runState: "failed",
        status: "failing",
        tone: "bad",
      }),
      expect.objectContaining({
        runState: "queued",
        status: "degraded",
        tone: "warn",
      }),
    ]);
  });

  it("marks a check as passing when the latest run passed after failed history", async () => {
    mocks.checkRunUpdateMany.mockResolvedValue({ count: 0 });
    mocks.projectFindUnique.mockResolvedValue({
      id: "project_1",
      slug: "default",
    });
    mocks.checkFindMany.mockResolvedValue([
      {
        enabled: true,
        entrypoint: "ab-tests.spec.ts",
        frequencyMinutes: 1440,
        group: {
          name: "App / Actionmedia",
        },
        id: "check_1",
        key: "AB-tests",
        name: "AB tests",
        request: null,
        runs: [
          {
            artifacts: [],
            createdAt: new Date("2026-07-05T15:45:00.000Z"),
            durationMs: 60000,
            id: "run_passed",
            logsPath: null,
            result: null,
            status: "PASSED",
          },
          {
            artifacts: [],
            createdAt: new Date("2026-07-05T15:43:00.000Z"),
            durationMs: 98700,
            id: "run_failed_1",
            logsPath: null,
            result: null,
            status: "FAILED",
          },
          {
            artifacts: [],
            createdAt: new Date("2026-07-05T15:40:00.000Z"),
            durationMs: 47000,
            id: "run_failed_2",
            logsPath: null,
            result: null,
            status: "FAILED",
          },
        ],
        tags: ["app", "action"],
        type: "BROWSER",
      },
    ]);

    const dashboard = await getDashboardData("default");
    const check = dashboard.groups[0]?.children?.[0];

    expect(check).toMatchObject({
      runState: "passed",
      status: "passing",
    });
    expect(dashboard.summary).toMatchObject({
      degraded: 0,
      failing: 0,
      passing: 1,
      running: 0,
    });
    expect(check?.bars).toEqual([
      expect.objectContaining({
        runState: "failed",
        status: "failing",
        tone: "bad",
      }),
      expect.objectContaining({
        runState: "failed",
        status: "failing",
        tone: "bad",
      }),
      expect.objectContaining({
        runState: "passed",
        status: "passing",
        tone: "good",
      }),
    ]);
  });

  it("counts currently running checks in the dashboard summary", async () => {
    mocks.checkRunUpdateMany.mockResolvedValue({ count: 0 });
    mocks.projectFindUnique.mockResolvedValue({
      id: "project_1",
      slug: "default",
    });
    mocks.checkFindMany.mockResolvedValue([
      {
        enabled: true,
        entrypoint: null,
        frequencyMinutes: 180,
        group: {
          name: "API / Bff",
        },
        id: "check_1",
        key: "bff-health",
        name: "bff-health",
        request: {
          assertions: [],
          headers: {},
          method: "GET",
          url: "https://example.test/health",
        },
        runs: [
          {
            artifacts: [],
            createdAt: new Date("2026-07-05T09:40:00.000Z"),
            durationMs: null,
            id: "run_running",
            logsPath: null,
            result: null,
            status: "RUNNING",
          },
        ],
        tags: ["api", "bff"],
        type: "API",
      },
    ]);

    const dashboard = await getDashboardData("default");
    const check = dashboard.groups[0]?.children?.[0];

    expect(check).toMatchObject({
      runState: "running",
      status: "degraded",
    });
    expect(dashboard.summary).toMatchObject({
      degraded: 0,
      failing: 0,
      passing: 0,
      running: 1,
    });
  });

  it("lists Firewatch rows for current failures that started within seven days", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-05T12:00:00.000Z"));
    mocks.checkRunUpdateMany.mockResolvedValue({ count: 0 });
    mocks.projectFindUnique.mockResolvedValue({
      id: "project_1",
      slug: "default",
    });
    mocks.checkFindMany.mockResolvedValue([
      {
        enabled: true,
        entrypoint: null,
        frequencyMinutes: 180,
        group: {
          name: "API / Bff",
        },
        id: "check_recent",
        key: "bff-health",
        name: "bff-health",
        request: {
          assertions: [],
          headers: {},
          method: "GET",
          url: "https://example.test/health",
        },
        runs: [
          {
            artifacts: [],
            createdAt: new Date("2026-07-05T11:00:00.000Z"),
            durationMs: 9,
            id: "run_recent_latest",
            logsPath: null,
            result: null,
            status: "FAILED",
          },
          {
            artifacts: [],
            createdAt: new Date("2026-07-05T09:00:00.000Z"),
            durationMs: 8,
            id: "run_recent_first",
            logsPath: null,
            result: null,
            status: "FAILED",
          },
          {
            artifacts: [],
            createdAt: new Date("2026-07-04T09:00:00.000Z"),
            durationMs: 6,
            id: "run_recent_previous_pass",
            logsPath: null,
            result: null,
            status: "PASSED",
          },
        ],
        tags: ["api", "bff"],
        type: "API",
      },
      {
        enabled: true,
        entrypoint: null,
        frequencyMinutes: 180,
        group: {
          name: "API / Core",
        },
        id: "check_old",
        key: "core-errors",
        name: "core-errors",
        request: {
          assertions: [],
          headers: {},
          method: "GET",
          url: "https://example.test/core",
        },
        runs: [
          {
            artifacts: [],
            createdAt: new Date("2026-07-05T10:00:00.000Z"),
            durationMs: 9,
            id: "run_old_latest",
            logsPath: null,
            result: null,
            status: "FAILED",
          },
          {
            artifacts: [],
            createdAt: new Date("2026-06-27T10:00:00.000Z"),
            durationMs: 8,
            id: "run_old_first",
            logsPath: null,
            result: null,
            status: "FAILED",
          },
        ],
        tags: ["api"],
        type: "API",
      },
      {
        enabled: true,
        entrypoint: null,
        frequencyMinutes: 180,
        group: {
          name: "Browser",
        },
        id: "check_recovered",
        key: "signin",
        name: "signin",
        request: null,
        runs: [
          {
            artifacts: [],
            createdAt: new Date("2026-07-05T10:30:00.000Z"),
            durationMs: 920,
            id: "run_recovered_latest",
            logsPath: null,
            result: null,
            status: "PASSED",
          },
          {
            artifacts: [],
            createdAt: new Date("2026-07-05T09:30:00.000Z"),
            durationMs: 810,
            id: "run_recovered_failed",
            logsPath: null,
            result: null,
            status: "FAILED",
          },
        ],
        tags: ["browser"],
        type: "BROWSER",
      },
    ]);

    const dashboard = await getDashboardData("default");

    expect(dashboard.firewatch).toEqual({
      lookbackDays: 7,
      rows: [
        {
          checkId: "check_recent",
          firstSeen: "about 3 hours ago",
          firstSeenAt: "2026-07-05T09:00:00.000Z",
          groupName: "API / Bff",
          lastSeen: "about 1 hours ago",
          lastSeenAt: "2026-07-05T11:00:00.000Z",
          name: "bff-health",
          type: "api",
        },
      ],
    });
  });

  it("loads journal rows with filters, links and pagination", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-05T12:00:00.000Z"));
    mocks.checkRunUpdateMany.mockResolvedValue({ count: 0 });
    mocks.projectFindUnique.mockResolvedValue({
      id: "project_1",
      slug: "default",
    });
    mocks.checkRunCount.mockResolvedValue(2);
    mocks.checkRunFindMany.mockResolvedValue([
      {
        artifacts: [
          {
            createdAt: new Date("2026-07-05T11:20:00.000Z"),
            id: "artifact_1",
            mimeType: "application/zip",
            path: "/tmp/trace.zip",
            sizeBytes: 1024,
            type: "TRACE",
          },
        ],
        check: {
          frequencyMinutes: 15,
          group: {
            name: "API / Bff",
          },
          id: "check_1",
          key: "bff-health",
          name: "bff-health",
          tags: ["api", "bff"],
          type: "API",
        },
        createdAt: new Date("2026-07-05T11:20:00.000Z"),
        durationMs: 810,
        errorMessage: null,
        id: "run_1",
        logsPath: null,
        result: null,
        status: "PASSED",
        testSession: null,
      },
    ]);

    const journal = await getJournalData("default", {
      page: 2,
      pageSize: 1,
      query: "health",
      range: "7d",
      status: "passed",
      type: "api",
    });

    expect(mocks.checkRunCount).toHaveBeenCalledWith({
      where: expect.objectContaining({
        check: expect.objectContaining({
          enabled: true,
          projectId: "project_1",
          type: "API",
        }),
        createdAt: {
          gte: new Date("2026-06-28T12:00:00.000Z"),
        },
        status: "PASSED",
      }),
    });
    expect(mocks.checkRunFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: {
          createdAt: "desc",
        },
        skip: 1,
        take: 1,
      }),
    );
    expect(journal.pagination).toMatchObject({
      from: 2,
      hasNext: false,
      hasPrevious: true,
      page: 2,
      pageSize: 1,
      to: 2,
      total: 2,
      totalPages: 2,
    });
    expect(journal.runs[0]).toMatchObject({
      checkHref: "/checks/check_1",
      checkName: "bff-health",
      groupName: "API / Bff",
      runHref: "/checks/check_1/runs/run_1",
      schedule: "15 min",
      status: "passing",
    });
  });
});
