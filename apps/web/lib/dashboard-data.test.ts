import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkFindFirst: vi.fn(),
  checkRunFindFirst: vi.fn(),
  checkRunUpdateMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    check: {
      findFirst: mocks.checkFindFirst,
    },
    checkRun: {
      findFirst: mocks.checkRunFindFirst,
      updateMany: mocks.checkRunUpdateMany,
    },
    project: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

import { getCheckDetailData, getRunDetailData } from "./dashboard-data";

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
    expect(detail?.run.resultFields).toContainEqual({
      label: "Status",
      value: "200",
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
      viewUrl: "/api/runs/run_1/artifacts/artifact_1",
    });
  });
});
