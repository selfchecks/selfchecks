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
  testSessionFindFirst: vi.fn(),
  testSessionFindMany: vi.fn(),
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
    testSession: {
      findFirst: mocks.testSessionFindFirst,
      findMany: mocks.testSessionFindMany,
    },
  },
}));

import {
  getCheckDetailData,
  getCheckDetailShellData,
  getDashboardData,
  getJournalData,
  getRunDetailData,
  getTestSessionsData,
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

  it("loads a lightweight check detail shell without run result payloads", async () => {
    const createdAt = new Date("2026-07-05T13:20:03.000Z");

    mocks.checkRunUpdateMany.mockResolvedValue({ count: 0 });
    mocks.checkFindFirst.mockResolvedValue({
      enabled: true,
      entrypoint: "checks/homepage.spec.ts",
      frequencyMinutes: 180,
      group: {
        name: "App / Smoke",
      },
      id: "check_1",
      key: "homepage",
      name: "Homepage",
      project: {
        slug: "default",
      },
      request: null,
      runs: [
        {
          artifacts: [],
          createdAt,
          durationMs: 2390,
          errorMessage: null,
          id: "run_1",
          logsPath: null,
          status: "PASSED",
        },
      ],
      tags: ["app", "regress"],
      type: "BROWSER",
    });

    const detail = await getCheckDetailShellData("check_1");
    const query = mocks.checkFindFirst.mock.calls[0]?.[0] as {
      select?: {
        runs?: {
          select?: Record<string, unknown>;
          take?: number;
        };
      };
    };

    expect(query.select?.runs?.take).toBe(1);
    expect(query.select?.runs?.select).not.toHaveProperty("result");
    expect(detail).toMatchObject({
      check: {
        id: "check_1",
        name: "Homepage",
        runState: "passed",
        runs: [
          {
            id: "run_1",
            performance: undefined,
          },
        ],
      },
      groupName: "App / Smoke",
      projectSlug: "default",
    });
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
          path: "/tmp/artifacts/run_1/test-results/paid-content-email-draft-creation-chromium/trace.zip",
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
          id: "run_1",
          OR: [
            {
              check: {
                enabled: true,
                id: "check_1",
              },
            },
            {
              checkSnapshotKey: "check_1",
            },
          ],
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
      name: "paid-content-email-draft-creation-chromium.trace.zip",
      size: "42.0 KB",
      type: "trace",
      viewUrl: "/runs/run_1/artifacts/artifact_1/trace",
    });
  });

  it("loads sibling retry attempts for run details", async () => {
    const firstAttemptAt = new Date("2026-06-24T13:18:03.000Z");
    const secondAttemptAt = new Date("2026-06-24T13:20:03.000Z");

    mocks.checkRunUpdateMany.mockResolvedValue({ count: 0 });
    mocks.checkRunFindFirst.mockResolvedValue({
      artifacts: [],
      attempt: 2,
      check: {
        enabled: true,
        entrypoint: null,
        frequencyMinutes: 180,
        group: {
          name: "API / Bff",
        },
        id: "check_1",
        key: "bff-health",
        name: "bff-health",
        project: {
          slug: "default",
        },
        request: {
          assertions: [],
          headers: {},
          method: "GET",
          url: "https://example.test/health",
        },
        tags: ["api"],
        type: "API",
      },
      checkId: "check_1",
      createdAt: secondAttemptAt,
      durationMs: 120,
      errorMessage: null,
      finishedAt: secondAttemptAt,
      id: "run_2",
      logsPath: null,
      maxAttempts: 2,
      result: {
        status: 200,
      },
      retryGroupId: "run_1",
      startedAt: secondAttemptAt,
      status: "PASSED",
    });
    mocks.checkRunFindMany.mockResolvedValue([
      {
        artifacts: [],
        attempt: 1,
        checkId: "check_1",
        createdAt: firstAttemptAt,
        durationMs: 90,
        errorMessage: "HTTP 500 Internal Server Error",
        id: "run_1",
        logsPath: null,
        maxAttempts: 2,
        result: {
          status: 500,
        },
        retryGroupId: "run_1",
        status: "FAILED",
      },
      {
        artifacts: [],
        attempt: 2,
        checkId: "check_1",
        createdAt: secondAttemptAt,
        durationMs: 120,
        errorMessage: null,
        id: "run_2",
        logsPath: null,
        maxAttempts: 2,
        result: {
          status: 200,
        },
        retryGroupId: "run_1",
        status: "PASSED",
      },
    ]);

    const detail = await getRunDetailData("check_1", "run_2");

    expect(mocks.checkRunFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
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
              checkId: "check_1",
            },
            {
              checkSnapshotKey: "bff-health",
            },
          ],
          retryGroupId: "run_1",
        },
      }),
    );
    expect(detail?.run).toMatchObject({
      attemptNumber: 2,
      failedAttempts: 1,
      maxAttempts: 2,
    });
    expect(detail?.run.attempts).toEqual([
      expect.objectContaining({
        href: "/checks/check_1/runs/run_1",
        isCurrent: false,
        label: "Attempt #1",
        status: "failing",
      }),
      expect.objectContaining({
        href: "/checks/check_1/runs/run_2",
        isCurrent: true,
        label: "Attempt #2",
        status: "passing",
      }),
    ]);
  });

  it("throws dashboard loading errors in strict mode", async () => {
    const error = new Error("database unavailable");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    mocks.checkRunUpdateMany.mockResolvedValue({ count: 0 });
    mocks.projectFindUnique.mockResolvedValue({
      id: "project_1",
      slug: "default",
    });
    mocks.checkFindMany.mockRejectedValue(error);

    try {
      await expect(getDashboardData("default", { onError: "throw" })).rejects.toThrow(
        "database unavailable",
      );
      expect(warnSpy).toHaveBeenCalledWith("Unable to load dashboard data.", error);
    } finally {
      warnSpy.mockRestore();
    }
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
      degraded: 0,
      failing: 0,
      passing: 0,
      queued: 1,
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
        tone: "queued",
      }),
    ]);
  });

  it("scales dashboard result bars against the displayed runs for each check", async () => {
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
        key: "bff-gtm-js",
        name: "bff-gtm-js",
        request: {
          assertions: [],
          headers: {},
          method: "GET",
          url: "https://example.test/gtm.js",
        },
        runs: [
          {
            artifacts: [],
            createdAt: new Date("2026-07-05T09:40:00.000Z"),
            durationMs: 13160,
            id: "run_slow",
            logsPath: null,
            result: null,
            status: "PASSED",
          },
          {
            artifacts: [],
            createdAt: new Date("2026-07-05T09:38:00.000Z"),
            durationMs: 1900,
            id: "run_fast",
            logsPath: null,
            result: null,
            status: "PASSED",
          },
        ],
        tags: ["api", "bff"],
        type: "API",
      },
    ]);

    const dashboard = await getDashboardData("default");
    const bars = dashboard.groups[0]?.children?.[0]?.bars;

    expect(bars).toEqual([
      expect.objectContaining({
        duration: "1.90 s",
        value: 8,
      }),
      expect.objectContaining({
        duration: "13.16 s",
        value: 44,
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
      queued: 0,
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
      queued: 0,
      running: 1,
    });
  });

  it("keeps finished CLI test sessions out of dashboard run history", async () => {
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
            id: "run_running_test",
            logsPath: null,
            result: null,
            status: "RUNNING",
          },
          {
            artifacts: [],
            createdAt: new Date("2026-07-05T09:38:00.000Z"),
            durationMs: 8,
            id: "run_monitoring",
            logsPath: null,
            result: null,
            status: "PASSED",
          },
        ],
        tags: ["api", "bff"],
        type: "API",
      },
    ]);

    const dashboard = await getDashboardData("default");
    const query = mocks.checkFindMany.mock.calls[0]?.[0] as {
      include?: {
        runs?: {
          where?: unknown;
        };
      };
    };

    expect(query.include?.runs?.where).toEqual({
      OR: [
        {
          testSessionId: null,
        },
        {
          status: {
            in: ["QUEUED", "RUNNING"],
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
    });
    expect(dashboard.summary).toMatchObject({
      degraded: 0,
      failing: 0,
      passing: 0,
      queued: 0,
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
          firstSeen: "Jul 05 12:00",
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

  it("loads CLI test sessions with target URLs and test summaries", async () => {
    mocks.checkRunUpdateMany.mockResolvedValue({ count: 0 });
    mocks.projectFindUnique.mockResolvedValue({
      id: "project_1",
      slug: "default",
    });
    mocks.testSessionFindMany.mockResolvedValue([
      {
        createdAt: new Date("2026-07-05T11:20:00.000Z"),
        id: "session_1",
        name: null,
        source: "/repo/config/checkly",
        status: "FAILED",
        targetUrl: "https://example.test",
        runs: [
          {
            artifacts: [],
            check: null,
            checkId: null,
            checkSnapshotEntrypoint: "signin.spec.ts",
            checkSnapshotGroupName: "Browser",
            checkSnapshotKey: "signin",
            checkSnapshotName: "Signin",
            checkSnapshotProjectSlug: "default",
            checkSnapshotRequest: null,
            checkSnapshotTags: ["app"],
            checkSnapshotType: "BROWSER",
            createdAt: new Date("2026-07-05T11:20:00.000Z"),
            durationMs: 305000,
            id: "run_1",
            logsPath: null,
            result: null,
            status: "FAILED",
          },
          {
            artifacts: [],
            check: null,
            checkId: null,
            checkSnapshotEntrypoint: null,
            checkSnapshotGroupName: "API / Bff",
            checkSnapshotKey: "bff-health",
            checkSnapshotName: "bff-health",
            checkSnapshotProjectSlug: "default",
            checkSnapshotRequest: {
              assertions: [],
              headers: {},
              method: "GET",
              url: "https://example.test/health",
            },
            checkSnapshotTags: ["api"],
            checkSnapshotType: "API",
            createdAt: new Date("2026-07-05T11:19:00.000Z"),
            durationMs: 370,
            id: "run_2",
            logsPath: null,
            result: {
              url: "https://example.test/health",
            },
            status: "PASSED",
          },
        ],
      },
    ]);

    const data = await getTestSessionsData("default");

    expect(mocks.testSessionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          kind: "TEST",
          runs: {
            some: {
              OR: [
                {
                  check: {
                    projectId: "project_1",
                  },
                },
                {
                  checkSnapshotProjectSlug: "default",
                },
              ],
            },
          },
        },
      }),
    );
    expect(data.sessions[0]).toMatchObject({
      duration: "5 min 5 s",
      href: "/test-sessions/session_1",
      id: "session_1",
      runState: "failed",
      source: "/repo/config/checkly",
      status: "failing",
      summary: {
        failed: 1,
        passed: 1,
        queued: 0,
        running: 0,
        total: 2,
      },
      targetUrl: "https://example.test",
    });
  });

  it("loads snapshot-only test sessions without a persisted project row", async () => {
    mocks.checkRunUpdateMany.mockResolvedValue({ count: 0 });
    mocks.projectFindUnique.mockResolvedValue(null);
    mocks.projectFindFirst.mockResolvedValue(null);
    mocks.testSessionFindMany.mockResolvedValue([
      {
        createdAt: new Date("2026-07-05T11:20:00.000Z"),
        id: "session_1",
        name: "Release v1.2.3",
        source: "developers/frontend/account | v1.2.3",
        status: "PASSED",
        targetUrl: "https://example.test",
        runs: [
          {
            artifacts: [],
            check: null,
            checkId: null,
            checkSnapshotEntrypoint: "signin.spec.ts",
            checkSnapshotGroupName: "Browser",
            checkSnapshotKey: "signin",
            checkSnapshotName: "Signin",
            checkSnapshotProjectSlug: "default",
            checkSnapshotRequest: null,
            checkSnapshotTags: ["app"],
            checkSnapshotType: "BROWSER",
            createdAt: new Date("2026-07-05T11:20:00.000Z"),
            durationMs: 3900000,
            id: "run_1",
            logsPath: null,
            result: null,
            status: "PASSED",
          },
        ],
      },
    ]);

    const data = await getTestSessionsData("default");

    expect(mocks.testSessionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          kind: "TEST",
          runs: {
            some: {
              OR: [
                {
                  checkSnapshotProjectSlug: "default",
                },
              ],
            },
          },
        },
      }),
    );
    expect(data).toMatchObject({
      projectSlug: "default",
      sessions: [
        {
          duration: "1 h 5 min",
          id: "session_1",
          status: "passing",
          summary: {
            passed: 1,
            total: 1,
          },
        },
      ],
    });
  });
});
