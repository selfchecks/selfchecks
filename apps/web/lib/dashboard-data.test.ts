import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkFindFirst: vi.fn(),
  checkFindMany: vi.fn(),
  checkRunCount: vi.fn(),
  checkRunFindFirst: vi.fn(),
  checkRunFindMany: vi.fn(),
  checkRunUpdateMany: vi.fn(),
  projectFindFirst: vi.fn(),
  projectFindMany: vi.fn(),
  projectFindUnique: vi.fn(),
  queryRaw: vi.fn(),
  testSessionCount: vi.fn(),
  testSessionFindFirst: vi.fn(),
  testSessionFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: mocks.queryRaw,
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
      findMany: mocks.projectFindMany,
      findUnique: mocks.projectFindUnique,
    },
    testSession: {
      count: mocks.testSessionCount,
      findFirst: mocks.testSessionFindFirst,
      findMany: mocks.testSessionFindMany,
    },
  },
}));

import {
  getCheckDetailData,
  getCheckDetailShellData,
  getDashboardActivityData,
  getDashboardData,
  getDashboardQueueData,
  getJournalData,
  getRunDetailData,
  getStatusLogsData,
  getTestSessionData,
  getTestSessionCheckData,
  getTestSessionsData,
} from "./dashboard-data";

function createActiveQueueRun({
  id,
  status,
  testSession = null,
}: {
  id: string;
  status: "QUEUED" | "RUNNING";
  testSession?: {
    id: string;
    kind: "TEST" | "TRIGGER";
    source: string | null;
  } | null;
}) {
  return {
    artifacts: [],
    check: {
      enabled: true,
      entrypoint: null,
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
      tags: ["api", "bff"],
      type: "API",
    },
    checkId: "check_1",
    createdAt: new Date("2026-07-05T09:40:00.000Z"),
    durationMs: null,
    errorMessage: null,
    id,
    logsPath: null,
    result: null,
    runSource: testSession ? "CLI" : "SCHEDULE",
    status,
    testSession,
    testSessionId: testSession?.id ?? null,
  };
}

describe("dashboard data", () => {
  beforeEach(() => {
    mocks.checkFindMany.mockResolvedValue([]);
    mocks.checkRunCount.mockResolvedValue(0);
    mocks.checkRunFindFirst.mockResolvedValue(null);
    mocks.checkRunFindMany.mockResolvedValue([]);
    mocks.checkRunUpdateMany.mockResolvedValue({ count: 0 });
    mocks.projectFindMany.mockResolvedValue([{ name: "default", slug: "default" }]);
    mocks.queryRaw.mockResolvedValue([]);
    mocks.testSessionCount.mockResolvedValue(0);
    mocks.testSessionFindMany.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.resetAllMocks();
    vi.useRealTimers();
    delete process.env.SELFCHECKS_QUEUED_RUN_TIMEOUT_MINUTES;
  });

  it("counts queued and running checks for the sidebar", async () => {
    mocks.projectFindUnique.mockResolvedValue({
      id: "project_1",
      slug: "default",
    });
    mocks.checkRunFindMany.mockResolvedValue([
      { id: "queued_1", status: "QUEUED" },
      { id: "queued_2", status: "QUEUED" },
      { id: "running_1", status: "RUNNING" },
    ]);
    mocks.checkRunFindFirst.mockResolvedValue({
      finishedAt: new Date("2026-07-05T09:39:00.000Z"),
      id: "terminal_1",
      status: "PASSED",
    });

    await expect(getDashboardActivityData("default")).resolves.toEqual({
      projectSlug: "default",
      queued: 2,
      revision:
        "terminal:terminal_1:PASSED:2026-07-05T09:39:00.000Z|active:queued_1:QUEUED|active:queued_2:QUEUED|active:running_1:RUNNING",
      running: 1,
    });
    expect(mocks.checkRunFindMany).toHaveBeenCalledWith({
      orderBy: {
        id: "asc",
      },
      select: {
        id: true,
        status: true,
      },
      where: {
        status: {
          in: ["QUEUED", "RUNNING"],
        },
      },
    });
    expect(mocks.checkRunFindFirst).toHaveBeenCalledWith({
      orderBy: [{ finishedAt: "desc" }, { id: "desc" }],
      select: {
        finishedAt: true,
        id: true,
        status: true,
      },
      where: {
        AND: [
          {
            OR: [
              { testSessionId: null },
              { status: { in: ["QUEUED", "RUNNING"] } },
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
          },
          { check: { is: { enabled: true } } },
          {
            finishedAt: { not: null },
            status: { notIn: ["QUEUED", "RUNNING"] },
          },
        ],
      },
    });
  });

  it("loads active queue rows without fetching dashboard checks", async () => {
    mocks.checkRunFindMany.mockResolvedValue([
      createActiveQueueRun({
        id: "run_queued",
        status: "QUEUED",
      }),
    ]);

    const data = await getDashboardQueueData("default");

    expect(data.queue).toEqual([
      expect.objectContaining({
        checkName: "bff-health",
        id: "run_queued",
        runState: "queued",
      }),
    ]);
    expect(data.summary).toMatchObject({ queued: 1, running: 0 });
    expect(mocks.checkFindMany).not.toHaveBeenCalled();
  });

  it("does not mutate queued runs while reading check details", async () => {
    mocks.checkFindFirst.mockResolvedValue(null);

    await expect(getCheckDetailData("check_1")).resolves.toBeUndefined();

    expect(mocks.checkRunUpdateMany).not.toHaveBeenCalled();
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
            {
              id: "check_1",
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
    mocks.checkRunFindMany.mockResolvedValue([
      createActiveQueueRun({
        id: "run_queued",
        status: "QUEUED",
      }),
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
        degradedResponseTime: 2_000,
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
    mocks.checkRunFindMany.mockResolvedValue([
      createActiveQueueRun({
        id: "run_running",
        status: "RUNNING",
      }),
    ]);

    const dashboard = await getDashboardData("default");
    const check = dashboard.groups[0]?.children?.[0];
    const bars = check?.bars;

    expect(bars).toEqual([
      expect.objectContaining({
        duration: "1.90 s",
        status: "passing",
        value: 8,
      }),
      expect.objectContaining({
        duration: "13.16 s",
        status: "degraded",
        value: 44,
      }),
    ]);
    expect(check?.status).toBe("degraded");
    expect(dashboard.summary.degraded).toBe(1);
  });

  it("groups retry attempts into one dashboard result bar per logical run", async () => {
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
            attempt: 2,
            createdAt: new Date("2026-07-05T09:42:00.000Z"),
            durationMs: 20,
            id: "run_success_attempt_2",
            logsPath: null,
            maxAttempts: 2,
            result: null,
            retryGroupId: "run_success",
            status: "PASSED",
          },
          {
            artifacts: [],
            attempt: 1,
            createdAt: new Date("2026-07-05T09:40:00.000Z"),
            durationMs: 400,
            id: "run_success_attempt_1",
            logsPath: null,
            maxAttempts: 2,
            result: null,
            retryGroupId: "run_success",
            status: "FAILED",
          },
          {
            artifacts: [],
            attempt: 2,
            createdAt: new Date("2026-07-05T09:35:00.000Z"),
            durationMs: 300,
            id: "run_failed_attempt_2",
            logsPath: null,
            maxAttempts: 2,
            result: null,
            retryGroupId: "run_failed",
            status: "FAILED",
          },
          {
            artifacts: [],
            attempt: 1,
            createdAt: new Date("2026-07-05T09:33:00.000Z"),
            durationMs: 100,
            id: "run_failed_attempt_1",
            logsPath: null,
            maxAttempts: 2,
            result: null,
            retryGroupId: "run_failed",
            status: "FAILED",
          },
        ],
        tags: ["api", "bff"],
        type: "API",
      },
    ]);

    const dashboard = await getDashboardData("default");
    const bars = dashboard.groups[0]?.children?.[0]?.bars;

    expect(bars).toHaveLength(2);
    expect(bars?.[0]).toMatchObject({
      duration: "300 ms",
      hasRetries: true,
      href: "/checks/check_1/runs/run_failed_attempt_2",
      runState: "failed",
      status: "failing",
      tone: "bad",
      value: 44,
    });
    expect(bars?.[0]?.attempts).toEqual([
      expect.objectContaining({
        duration: "100 ms",
        label: "Attempt #1",
        status: "failing",
      }),
      expect.objectContaining({
        duration: "300 ms",
        label: "Attempt #2",
        status: "failing",
      }),
    ]);
    expect(bars?.[1]).toMatchObject({
      duration: "20 ms",
      hasRetries: true,
      href: "/checks/check_1/runs/run_success_attempt_2",
      runState: "passed",
      status: "passing",
      tone: "good",
      value: 8,
    });
    expect(bars?.[1]?.attempts).toEqual([
      expect.objectContaining({
        duration: "400 ms",
        label: "Attempt #1",
        status: "failing",
      }),
      expect.objectContaining({
        duration: "20 ms",
        label: "Attempt #2",
        status: "passing",
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
    mocks.checkRunFindMany.mockResolvedValue([
      createActiveQueueRun({
        id: "run_running",
        status: "RUNNING",
      }),
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

  it("maps active queue rows for production checks and test session snapshots", async () => {
    mocks.projectFindUnique.mockResolvedValue({
      id: "project_1",
      slug: "default",
    });
    mocks.checkFindMany.mockResolvedValue([]);
    mocks.checkRunFindMany.mockResolvedValue([
      {
        ...createActiveQueueRun({
          id: "run_manual",
          status: "QUEUED",
        }),
        runSource: "MANUAL",
      },
      {
        artifacts: [],
        check: null,
        checkId: null,
        checkSnapshotEntrypoint: "tests/signin.spec.ts",
        checkSnapshotGroupName: "Browser",
        checkSnapshotKey: "signin",
        checkSnapshotName: "Sign in",
        checkSnapshotProjectSlug: "default",
        checkSnapshotRequest: null,
        checkSnapshotTags: ["smoke"],
        checkSnapshotType: "BROWSER",
        createdAt: new Date("2026-07-05T09:39:00.000Z"),
        durationMs: null,
        errorMessage: null,
        id: "run_cli",
        logsPath: null,
        result: null,
        runSource: "CLI",
        status: "RUNNING",
        testSession: {
          id: "session_1",
          kind: "TEST",
          ref: "release/3.192.42",
          source: null,
        },
        testSessionId: "session_1",
      },
    ]);

    const dashboard = await getDashboardData("default");

    expect(dashboard.queue).toEqual([
      expect.objectContaining({
        branch: "release/3.192.42",
        checkHref: "/test-sessions/session_1/checks/signin",
        checkId: "signin",
        checkName: "Sign in",
        runState: "running",
        source: "cli",
        sourceLabel: "CLI",
        type: "browser",
      }),
      expect.objectContaining({
        branch: "production",
        checkHref: "/checks/check_1",
        checkName: "bff-health",
        runState: "queued",
        source: "manual",
        sourceLabel: "Manual",
        type: "api",
      }),
    ]);
    expect(dashboard.summary).toMatchObject({
      queued: 1,
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
    mocks.checkRunFindMany.mockResolvedValue([
      createActiveQueueRun({
        id: "run_running_test",
        status: "RUNNING",
        testSession: {
          id: "session_1",
          kind: "TEST",
          source: "selfchecks test",
        },
      }),
    ]);

    const dashboard = await getDashboardData("default");
    const [sql, firewatchDays, resultCount] = mocks.queryRaw.mock.calls[0] ?? [];

    expect(Array.from(sql as TemplateStringsArray).join("?")).toContain(
      'ranked."groupRank" <= ?',
    );
    expect(firewatchDays).toBe(7);
    expect(resultCount).toBe(24);
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
        project: {
          name: "Account",
          slug: "account",
        },
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
          projectName: "Account",
          projectSlug: "account",
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

  it("builds status change logs from completed dashboard runs", async () => {
    mocks.queryRaw.mockResolvedValue([
      {
        checkId: "check_1",
        checkKey: "bff-health",
        checkName: "BFF health",
        checkType: "API",
        createdAt: new Date("2026-07-05T11:00:00.000Z"),
        fromStatus: "degraded",
        groupName: "API / Bff",
        id: "run_recovered",
        page: 1,
        projectSlug: "account",
        toStatus: "passing",
        total: 3,
        totalPages: 1,
      },
      {
        checkId: "check_1",
        checkKey: "bff-health",
        checkName: "BFF health",
        checkType: "API",
        createdAt: new Date("2026-07-05T10:45:00.000Z"),
        fromStatus: "failing",
        groupName: "API / Bff",
        id: "run_degraded",
        page: 1,
        projectSlug: "account",
        toStatus: "degraded",
        total: 3,
        totalPages: 1,
      },
      {
        checkId: "check_1",
        checkKey: "bff-health",
        checkName: "BFF health",
        checkType: "API",
        createdAt: new Date("2026-07-05T09:00:00.000Z"),
        fromStatus: "passing",
        groupName: "API / Bff",
        id: "run_failed",
        page: 1,
        projectSlug: "account",
        toStatus: "failing",
        total: 3,
        totalPages: 1,
      },
    ]);

    const data = await getStatusLogsData("default", {
      page: 1,
      pageSize: 10,
    });

    const [sql, pageSize, requestedPage, degradedResponseTime] =
      mocks.queryRaw.mock.calls[0] ?? [];
    const query = Array.from(sql as TemplateStringsArray).join("?");

    expect(query).toContain('LAG("toStatus") OVER');
    expect(query).toContain('run."status" NOT IN');
    expect(query).toContain('LIMIT (SELECT "pageSize" FROM page_info)');
    expect(query).toContain("LEFT JOIN page_rows ON true");
    expect(pageSize).toBe(10);
    expect(requestedPage).toBe(1);
    expect(degradedResponseTime).toBe(10_000);
    expect(mocks.checkFindMany).not.toHaveBeenCalled();
    expect(data.pagination).toEqual({
      from: 1,
      hasNext: false,
      hasPrevious: false,
      page: 1,
      pageSize: 10,
      to: 3,
      total: 3,
      totalPages: 1,
    });
    expect(data.logs).toEqual([
      expect.objectContaining({
        checkHref: "/checks/check_1",
        checkName: "BFF health",
        fromStatus: "degraded",
        id: "run_recovered",
        runHref: "/checks/check_1/runs/run_recovered",
        toStatus: "passing",
      }),
      expect.objectContaining({
        fromStatus: "failing",
        id: "run_degraded",
        toStatus: "degraded",
      }),
      expect.objectContaining({
        fromStatus: "passing",
        id: "run_failed",
        toStatus: "failing",
      }),
    ]);
  });

  it("returns empty status logs from the aggregate placeholder row", async () => {
    mocks.queryRaw.mockResolvedValue([
      {
        checkId: null,
        checkKey: null,
        checkName: null,
        checkType: null,
        createdAt: null,
        fromStatus: null,
        groupName: null,
        id: null,
        page: 1,
        projectSlug: null,
        toStatus: null,
        total: 0,
        totalPages: 1,
      },
    ]);

    await expect(
      getStatusLogsData("default", {
        page: 99,
        pageSize: 20,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        logs: [],
        pagination: {
          from: 0,
          hasNext: false,
          hasPrevious: false,
          page: 1,
          pageSize: 20,
          to: 0,
          total: 0,
          totalPages: 1,
        },
      }),
    );
  });

  it("includes the latest failed run AI analysis in test session rows", async () => {
    mocks.checkFindMany.mockResolvedValue([
      {
        key: "signin",
        project: {
          slug: "account",
        },
        runs: [
          {
            status: "PASSED",
          },
        ],
      },
    ]);
    mocks.testSessionFindFirst.mockResolvedValue({
      commitSha: "c05713df",
      createdAt: new Date("2026-07-05T11:20:00.000Z"),
      id: "session_1",
      jobUrl: null,
      name: "Release v1.2.3",
      pipelineUrl: null,
      project: {
        slug: "account",
      },
      ref: "release/1.2.3",
      repository: "developers/frontend/account",
      runs: [
        {
          artifacts: [],
          check: null,
          checkId: null,
          checkSnapshotEntrypoint: "signin.spec.ts",
          checkSnapshotGroupName: "Browser",
          checkSnapshotKey: "signin",
          checkSnapshotName: "Sign in",
          checkSnapshotProjectSlug: "account",
          checkSnapshotRequest: null,
          checkSnapshotTags: ["app"],
          checkSnapshotType: "BROWSER",
          createdAt: new Date("2026-07-05T11:20:00.000Z"),
          durationMs: 1200,
          id: "run_1",
          logsPath: null,
          result: {
            aiAnalysis: {
              content: "The sign-in request returned 500.",
              model: "gpt-test",
              responseLanguage: "English",
              status: "completed",
            },
          },
          status: "FAILED",
        },
      ],
      source: null,
      status: "FAILED",
      targetUrl: "https://example.test",
    });

    const data = await getTestSessionData("session_1");

    expect(data?.session.checks[0]).toMatchObject({
      aiAnalysis: {
        content: "The sign-in request returned 500.",
        model: "gpt-test",
        responseLanguage: "English",
        status: "completed",
      },
      checkKey: "signin",
      checkName: "Sign in",
      isRegress: true,
      latestRunOccurredAt: expect.any(String),
      runState: "failed",
    });
    expect(data?.session.summary).toMatchObject({
      failed: 0,
      regress: 1,
    });
    expect(mocks.checkFindMany).toHaveBeenCalledWith({
      select: expect.objectContaining({
        runs: expect.objectContaining({
          take: 1,
          where: expect.objectContaining({
            OR: expect.any(Array),
          }),
        }),
      }),
      where: {
        enabled: true,
        OR: [
          {
            key: "signin",
            project: {
              slug: "account",
            },
          },
        ],
      },
    });
  });

  it("merges a manual session rerun into the existing check row by key", async () => {
    mocks.testSessionFindFirst.mockResolvedValue({
      commitSha: null,
      createdAt: new Date("2026-07-05T11:20:00.000Z"),
      id: "session_1",
      jobUrl: null,
      name: "Release v1.2.3",
      pipelineUrl: null,
      project: {
        slug: "account",
      },
      ref: null,
      repository: null,
      runs: [
        {
          artifacts: [],
          check: {
            enabled: true,
            entrypoint: "signin.spec.ts",
            group: {
              name: "Browser",
            },
            id: "check_live",
            key: "signin",
            name: "Sign in",
            project: {
              slug: "account",
            },
            request: null,
            tags: ["app"],
            type: "BROWSER",
          },
          checkId: "check_live",
          checkSnapshotKey: "signin",
          createdAt: new Date("2026-07-15T10:00:00.000Z"),
          durationMs: null,
          id: "run_2",
          logsPath: null,
          result: null,
          status: "QUEUED",
        },
        {
          artifacts: [],
          check: null,
          checkId: null,
          checkSnapshotEntrypoint: "signin.spec.ts",
          checkSnapshotGroupName: "Browser",
          checkSnapshotKey: "signin",
          checkSnapshotName: "Sign in",
          checkSnapshotProjectSlug: "account",
          checkSnapshotRequest: null,
          checkSnapshotTags: ["app"],
          checkSnapshotType: "BROWSER",
          createdAt: new Date("2026-07-05T11:20:00.000Z"),
          durationMs: 1200,
          id: "run_1",
          logsPath: null,
          result: null,
          status: "FAILED",
        },
      ],
      source: null,
      status: "RUNNING",
      targetUrl: "https://example.test",
    });

    const data = await getTestSessionData("session_1");

    expect(data?.session.checks).toHaveLength(1);
    expect(data?.session.checks[0]).toMatchObject({
      checkHref: "/test-sessions/session_1/checks/check_live",
      checkId: "check_live",
      checkKey: "signin",
      latestRunHref: "/checks/check_live/runs/run_2",
      projectSlug: "account",
      runCount: 2,
      runState: "queued",
    });
    expect(data?.session).toMatchObject({
      runState: "running",
      summary: {
        queued: 1,
        total: 1,
      },
    });
  });

  it("keeps same-key tests from different projects in separate session rows", async () => {
    mocks.testSessionFindFirst.mockResolvedValue({
      commitSha: null,
      createdAt: new Date("2026-08-17T15:00:00.000Z"),
      id: "session_full",
      jobUrl: null,
      name: "Full regression",
      pipelineUrl: null,
      project: {
        slug: "account",
      },
      ref: "release/3.192.52",
      repository: "frontend/account",
      runs: [
        {
          artifacts: [],
          check: {
            degradedResponseTime: null,
            enabled: true,
            entrypoint: "account/health.spec.ts",
            group: { name: "Core" },
            id: "check_account_health",
            key: "health",
            name: "Account health",
            project: { slug: "account" },
            request: null,
            tags: [],
            type: "BROWSER",
          },
          checkId: "check_account_health",
          createdAt: new Date("2026-08-17T15:00:00.000Z"),
          durationMs: 100,
          finishedAt: new Date("2026-08-17T15:00:00.100Z"),
          id: "run_account_health",
          logsPath: null,
          result: null,
          status: "PASSED",
        },
        {
          artifacts: [],
          check: {
            degradedResponseTime: null,
            enabled: true,
            entrypoint: "api/health.spec.ts",
            group: { name: "Core" },
            id: "check_api_health",
            key: "health",
            name: "API health",
            project: { slug: "api" },
            request: null,
            tags: [],
            type: "BROWSER",
          },
          checkId: "check_api_health",
          createdAt: new Date("2026-08-17T15:00:00.000Z"),
          durationMs: 120,
          finishedAt: new Date("2026-08-17T15:00:00.120Z"),
          id: "run_api_health",
          logsPath: null,
          result: null,
          status: "PASSED",
        },
      ],
      source: null,
      status: "PASSED",
      targetUrl: "https://pr-331.app.example.test",
    });

    const data = await getTestSessionData("session_full");

    expect(data?.session.checks).toHaveLength(2);
    expect(data?.session.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          checkId: "check_account_health",
          checkKey: "health",
          projectSlug: "account",
        }),
        expect.objectContaining({
          checkId: "check_api_health",
          checkKey: "health",
          projectSlug: "api",
        }),
      ]),
    );
    expect(data?.session.summary.total).toBe(2);
  });

  it("loads CLI test sessions with target URLs and test summaries", async () => {
    mocks.checkFindMany.mockResolvedValue([
      {
        key: "signin",
        project: {
          slug: "default",
        },
        runs: [
          {
            status: "PASSED",
          },
        ],
      },
    ]);
    mocks.checkRunUpdateMany.mockResolvedValue({ count: 0 });
    mocks.projectFindUnique.mockResolvedValue({
      id: "project_1",
      slug: "default",
    });
    mocks.testSessionCount.mockResolvedValue(2);
    mocks.testSessionFindMany.mockResolvedValue([
      {
        createdAt: new Date("2026-07-05T11:20:00.000Z"),
        id: "session_1",
        name: "Release v1.2.3",
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

    const data = await getTestSessionsData("default", {
      page: 2,
      pageSize: 1,
      query: "signin",
      sessionName: "Release v1.2.3",
    });

    expect(mocks.testSessionCount).toHaveBeenCalledWith({
      where: expect.objectContaining({
        AND: [
          {
            name: {
              equals: "Release v1.2.3",
              mode: "insensitive",
            },
          },
          {
            OR: expect.arrayContaining([
              {
                targetUrl: {
                  contains: "signin",
                  mode: "insensitive",
                },
              },
              {
                runs: {
                  some: {
                    OR: expect.arrayContaining([
                      {
                        checkSnapshotKey: {
                          contains: "signin",
                          mode: "insensitive",
                        },
                      },
                    ]),
                  },
                },
              },
            ]),
          },
        ],
        kind: "TEST",
      }),
    });
    expect(mocks.testSessionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 1,
        take: 1,
        where: {
          AND: [
            {
              name: {
                equals: "Release v1.2.3",
                mode: "insensitive",
              },
            },
            {
              OR: expect.any(Array),
            },
          ],
          kind: "TEST",
        },
      }),
    );
    expect(data.filters).toEqual({
      page: 2,
      pageSize: 1,
      project: "all",
      query: "signin",
      sessionName: "Release v1.2.3",
    });
    expect(data.pagination).toMatchObject({
      from: 2,
      hasNext: false,
      hasPrevious: true,
      page: 2,
      pageSize: 1,
      to: 2,
      total: 2,
      totalPages: 2,
    });
    expect(data.sessions[0]).toMatchObject({
      duration: "5 min 5 s",
      href: "/test-sessions/session_1",
      id: "session_1",
      runState: "failed",
      source: "/repo/config/checkly",
      status: "failing",
      summary: {
        failed: 0,
        passed: 1,
        queued: 0,
        regress: 1,
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
    mocks.testSessionCount.mockResolvedValue(1);
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
        },
      }),
    );
    expect(data).toMatchObject({
      filters: {
        page: 1,
        pageSize: 20,
        query: "",
        sessionName: "",
      },
      pagination: {
        from: 1,
        hasNext: false,
        hasPrevious: false,
        page: 1,
        pageSize: 20,
        to: 1,
        total: 1,
        totalPages: 1,
      },
      projectSlug: "all",
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

  it("derives a terminal test session status when all runs have finished", async () => {
    mocks.projectFindUnique.mockResolvedValue({
      id: "project_1",
      slug: "default",
    });
    mocks.testSessionCount.mockResolvedValue(1);
    mocks.testSessionFindMany.mockResolvedValue([
      {
        createdAt: new Date("2026-07-05T11:20:00.000Z"),
        id: "session_1",
        name: "Release v1.2.3",
        source: "/repo/config/checkly",
        status: "RUNNING",
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
            durationMs: null,
            finishedAt: new Date("2026-07-05T11:21:00.000Z"),
            id: "run_1",
            logsPath: null,
            result: null,
            status: "FAILED",
          },
        ],
      },
    ]);

    const data = await getTestSessionsData("default");

    expect(data.sessions[0]).toMatchObject({
      runState: "failed",
      status: "failing",
      summary: {
        failed: 1,
        passed: 0,
        queued: 0,
        running: 0,
        total: 1,
      },
    });
  });

  it("opens cancelled session tests that only have a run id", async () => {
    const cancelledRun = {
      artifacts: [],
      attempt: 1,
      check: null,
      checkId: null,
      checkSnapshotEntrypoint: null,
      checkSnapshotGroupName: null,
      checkSnapshotKey: null,
      checkSnapshotName: null,
      checkSnapshotProjectSlug: "default",
      checkSnapshotRequest: null,
      checkSnapshotTags: [],
      checkSnapshotType: "BROWSER",
      createdAt: new Date("2026-07-10T09:20:00.000Z"),
      durationMs: null,
      errorMessage: "Session cancelled before the test started.",
      finishedAt: new Date("2026-07-10T09:46:00.000Z"),
      id: "run_cancelled",
      logsPath: null,
      maxAttempts: 1,
      result: null,
      retryGroupId: null,
      runSource: "CLI",
      startedAt: null,
      status: "CANCELLED",
      testSessionId: "session_1",
    };
    mocks.testSessionFindFirst.mockResolvedValue({
      commitSha: null,
      createdAt: new Date("2026-07-10T09:20:00.000Z"),
      id: "session_1",
      kind: "TEST",
      name: "Release v1.2.3",
      runs: [cancelledRun],
      source: null,
      status: "CANCELLED",
      targetUrl: "https://example.test",
    });

    await expect(
      getTestSessionCheckData("session_1", "run_cancelled"),
    ).resolves.toMatchObject({
      check: {
        id: "run_cancelled",
        name: "Unknown check",
      },
      runs: [
        {
          id: "run_cancelled",
          runHref: "/checks/run_cancelled/runs/run_cancelled",
          runState: "cancelled",
        },
      ],
    });
    expect(mocks.testSessionFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          runs: expect.objectContaining({
            where: {
              OR: expect.arrayContaining([{ id: "run_cancelled" }]),
            },
          }),
        }),
        where: expect.objectContaining({
          runs: {
            some: {
              OR: expect.arrayContaining([{ id: "run_cancelled" }]),
            },
          },
        }),
      }),
    );

    mocks.checkRunFindFirst.mockResolvedValue(null);
    await expect(
      getRunDetailData("run_cancelled", "run_cancelled"),
    ).resolves.toBeUndefined();
    expect(mocks.checkRunFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([{ id: "run_cancelled" }]),
        }),
      }),
    );
  });
});
