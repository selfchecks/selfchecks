import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CheckDetailData } from "@/lib/dashboard-data";

const mocks = vi.hoisted(() => ({
  routerPush: vi.fn(),
  routerRefresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mocks.routerPush,
    refresh: mocks.routerRefresh,
  }),
}));

import CheckDetailClient from "./check-detail-client";

const nowIso = new Date().toISOString();
const twoDaysAgoIso = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

const detail: CheckDetailData = {
  check: {
    avg: "2.34 s",
    ava: "96%",
    bars: [
      {
        duration: "2.34 s",
        occurredAt: "Jun 24 12:00",
        runner: "Local runner",
        runState: "passed",
        status: "passing",
        tone: "good",
        value: 28,
      },
      {
        duration: "2.79 s",
        occurredAt: "Jun 24 15:00",
        runner: "Local runner",
        runState: "failed",
        status: "failing",
        tone: "bad",
        value: 34,
      },
    ],
    delta: "24 h",
    hasTrace: true,
    id: "check_1",
    name: "bff-gtm-js",
    p95: "2.79 s",
    runState: "passed",
    runs: [
      {
        attempt: 1,
        artifacts: [
          {
            downloadUrl: "/api/runs/run_1/artifacts/artifact_1?download=1",
            id: "artifact_1",
            mimeType: "application/zip",
            name: "trace.zip",
            size: "42 KB",
            type: "trace",
            viewUrl: "/runs/run_1/artifacts/artifact_1/trace",
          },
        ],
        createdAt: nowIso,
        duration: "2.34 s",
        durationMs: 2340,
        hasRetries: false,
        id: "run_1",
        maxAttempts: 1,
        occurredAt: "Jun 24 12:00",
        performance: {
          errors: {
            consoleErrors: 0,
            documentErrors: 0,
            networkErrors: 7,
            scriptErrors: 0,
          },
          timings: {
            dclMs: 5120,
            fcpMs: 6600,
            lcpMs: 7010,
            loadedMs: 6180,
            tbtMs: 1870,
            ttfbMs: 239,
          },
        },
        runner: "Local runner",
        runState: "passed",
        status: "passing",
      },
      {
        attempt: 2,
        artifacts: [],
        createdAt: twoDaysAgoIso,
        duration: "2.79 s",
        durationMs: 2790,
        errorMessage: "Expected status 200",
        hasRetries: true,
        id: "run_2",
        maxAttempts: 2,
        occurredAt: "Jun 22 12:00",
        performance: {
          errors: {
            consoleErrors: 1,
            documentErrors: 2,
            networkErrors: 5,
            scriptErrors: 1,
          },
          timings: {
            dclMs: 5400,
            fcpMs: 6900,
            lcpMs: 7300,
            loadedMs: 6500,
            tbtMs: 2100,
            ttfbMs: 260,
          },
        },
        runner: "Local runner",
        runState: "failed",
        status: "failing",
        tone: "bad",
      },
      {
        attempt: 1,
        artifacts: [],
        createdAt: twoDaysAgoIso,
        duration: "-",
        durationMs: undefined,
        errorMessage: "Run was cancelled.",
        hasRetries: false,
        id: "run_3",
        maxAttempts: 1,
        occurredAt: "Jun 22 13:00",
        runner: "Local runner",
        runState: "cancelled",
        status: "failing",
        tone: "muted",
      },
    ],
    settings: {
      enabled: true,
      frequency: "180 min",
      key: "bff-gtm-js",
      request: {
        assertions: 1,
        body: false,
        headers: 2,
        method: "GET",
        url: "https://bff.sndsy.ru/gtm.js?id=GTM-MP43XM",
      },
    },
    stats: {
      averageDuration: "2.34 s",
      failedRuns: "2",
      p95Duration: "2.79 s",
      passedRuns: "5",
      totalRuns: "7",
    },
    status: "passing",
    tags: ["api", "bff"],
    time: "1 hour ago",
    type: "api",
  },
  groupName: "API / Bff",
  projectSlug: "default",
  updated: "1 hour ago",
};

function createJsonResponse(payload: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(payload), {
      headers: {
        "content-type": "application/json",
      },
      status,
    }),
  );
}

function getFetchUrl(input: Parameters<typeof fetch>[0]) {
  if (typeof input === "string") {
    return input;
  }

  if (input instanceof Request) {
    return input.url;
  }

  return input.toString();
}

function stubDetailFetch(fullDetail = detail) {
  const fetchMock = vi.fn((input: Parameters<typeof fetch>[0]) => {
    const url = getFetchUrl(input);

    if (url.endsWith("/api/checks/check_1/detail")) {
      return createJsonResponse(fullDetail);
    }

    return createJsonResponse({ error: `Unexpected request: ${url}` }, 500);
  });

  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
}

function renderDetail({
  fetchMock,
  fullDetail = detail,
  initialDetail = detail,
}: {
  fetchMock?: ReturnType<typeof vi.fn>;
  fullDetail?: CheckDetailData;
  initialDetail?: CheckDetailData;
} = {}) {
  if (fetchMock) {
    vi.stubGlobal("fetch", fetchMock);
  } else {
    stubDetailFetch(fullDetail);
  }

  render(
    <CheckDetailClient accountLabel="nikolaev@iprojects.ru" detail={initialDetail} />,
  );
}

describe("CheckDetailClient", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("renders a dedicated Checkly-like check detail page", async () => {
    renderDetail();

    expect(screen.getByRole("heading", { name: "bff-gtm-js" })).toBeTruthy();
    expect(screen.getByText("SelfChecks")).toBeTruthy();
    expect(screen.queryByText("Available now")).toBeNull();
    expect(screen.getByRole("link", { name: "Home" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Settings" })).toBeTruthy();
    expect(screen.getByText("API / Bff")).toBeTruthy();
    expect(screen.getByText("Check is passing")).toBeTruthy();
    expect(
      screen.getAllByText("GET https://bff.sndsy.ru/gtm.js?id=GTM-MP43XM").length,
    ).toBeGreaterThan(1);
    expect(screen.getByText("Run results")).toBeTruthy();
    expect(screen.getByText("Run history")).toBeTruthy();
    expect(screen.queryByRole("columnheader", { name: "Error" })).toBeNull();
    expect(screen.getByText("Performance")).toBeTruthy();
    expect(screen.getByText("Check duration")).toBeTruthy();
    expect(screen.getByText("Loading")).toBeTruthy();
    expect(screen.getByText("Errors")).toBeTruthy();
    expect(screen.getByText("Interactivity")).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText("Trace · 42 KB")).toBeTruthy();
    });
    expect(screen.getAllByText("TTFB").length).toBeGreaterThan(1);
    expect(screen.getByText("239 ms")).toBeTruthy();
    expect(screen.getByText("Network")).toBeTruthy();
    expect(screen.getByText("Network Errors")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getAllByText("TBT").length).toBeGreaterThan(1);
    expect(screen.getByText("1.87 s")).toBeTruthy();
    expect(
      (
        screen.getByRole("link", {
          name: "Open run result Jun 24 12:00",
        }) as HTMLAnchorElement
      ).href,
    ).toContain("/checks/check_1/runs/run_1");
    expect(
      (screen.getByRole("link", { name: "Jun 24 12:00" }) as HTMLAnchorElement).href,
    ).toContain("/checks/check_1/runs/run_1");
    expect(
      (screen.getByRole("link", { name: "View trace.zip" }) as HTMLAnchorElement).href,
    ).toContain("/runs/run_1/artifacts/artifact_1/trace");
    expect(
      (screen.getByRole("link", { name: "Download trace.zip" }) as HTMLAnchorElement)
        .href,
    ).toContain("/api/runs/run_1/artifacts/artifact_1?download=1");
  });

  it("keeps dense run charts constrained to the card width", async () => {
    const runs = Array.from({ length: 49 }, (_, index) => ({
      ...detail.check.runs[index % detail.check.runs.length]!,
      createdAt: new Date(Date.now() - index * 60_000).toISOString(),
      id: `run_dense_${index}`,
      occurredAt: `Jul 05 ${String(index).padStart(2, "0")}:00`,
    }));

    renderDetail({
      fullDetail: {
        ...detail,
        check: {
          ...detail.check,
          runs,
        },
      },
    });

    const chart = await screen.findByRole("img", { name: "Run result chart" });

    expect(chart.className).toContain("grid");
    expect(chart.className).toContain("min-w-0");
    expect(chart.className).toContain("overflow-hidden");
    expect(chart.getAttribute("style")).toContain(
      "grid-template-columns: repeat(49, minmax(0, 1fr))",
    );
    expect(chart.getAttribute("style")).toContain("column-gap: 4px");
  });

  it("scales run chart bars against the displayed runs", async () => {
    const fullDetail: CheckDetailData = {
      ...detail,
      check: {
        ...detail.check,
        runs: [
          {
            ...detail.check.runs[0]!,
            duration: "13.16 s",
            durationMs: 13160,
            id: "run_slow",
            occurredAt: "Jul 05 09:40",
          },
          {
            ...detail.check.runs[0]!,
            duration: "1.90 s",
            durationMs: 1900,
            id: "run_fast",
            occurredAt: "Jul 05 09:38",
          },
        ],
      },
    };

    renderDetail({
      fullDetail,
      initialDetail: fullDetail,
    });

    const fastBar = await screen.findByLabelText("Passed 1.90 s Jul 05 09:38");
    const slowBar = screen.getByLabelText("Passed 13.16 s Jul 05 09:40");

    expect(fastBar.querySelector("span")?.getAttribute("style")).toContain(
      "height: 13px",
    );
    expect(slowBar.querySelector("span")?.getAttribute("style")).toContain(
      "height: 88px",
    );
  });

  it("renders failed and cancelled run chart bars with dashboard matching colors", async () => {
    renderDetail();

    const failedBar = await screen.findByLabelText("Failed 2.79 s Jun 22 12:00");

    expect(failedBar.querySelector("span")?.className).toContain("bg-red-500");

    const cancelledBar = screen.getByLabelText("Cancelled - Jun 22 13:00");

    expect(cancelledBar.querySelector("span")?.className).toContain("bg-slate-500");
  });

  it("filters run results from the segment controls", async () => {
    const user = userEvent.setup();

    renderDetail();

    await waitFor(() => {
      expect(screen.getByText("Last 3 runs")).toBeTruthy();
    });

    await user.click(screen.getByRole("button", { name: "Failed" }));

    expect(
      screen.getByRole("button", { name: "Failed" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.queryByText("Expected status 200")).toBeNull();
    expect(screen.getByText("Last 2 runs")).toBeTruthy();
    expect(screen.queryByText("Trace · 42 KB")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Has retries" }));
    expect(
      screen.getByRole("button", { name: "Has retries" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByText("Last 1 runs")).toBeTruthy();
    expect(screen.getAllByText("Jun 22 12:00").length).toBeGreaterThan(0);
    expect(screen.queryByText("Jun 22 13:00")).toBeNull();

    await user.click(screen.getByRole("button", { name: "24hr" }));

    expect(screen.queryByText("Expected status 200")).toBeNull();
    expect(screen.getAllByText("No runs match the current filters.").length).toBe(3);
  });

  it("queues a run from the detail page", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(
      (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const url = getFetchUrl(input);

        if (url.endsWith("/api/checks/check_1/run") && init?.method === "POST") {
          return createJsonResponse({ runId: "run_2", status: "queued" }, 202);
        }

        if (url.endsWith("/api/checks/check_1/detail")) {
          return createJsonResponse(detail);
        }

        return createJsonResponse({ error: `Unexpected request: ${url}` }, 500);
      },
    );

    renderDetail({ fetchMock });

    await user.click(screen.getByRole("button", { name: "Schedule now" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/checks/check_1/run", {
        method: "POST",
      });
    });
    expect(screen.getByText("Check run queued.")).toBeTruthy();
    expect(mocks.routerRefresh).toHaveBeenCalledOnce();
  });

  it("polls run history while a queued or running run is visible", async () => {
    vi.useFakeTimers();
    const queuedDetail: CheckDetailData = {
      ...detail,
      check: {
        ...detail.check,
        runState: "queued",
        runs: [
          {
            ...detail.check.runs[0]!,
            id: "run_queued",
            runState: "queued",
            status: "degraded",
          },
        ],
        status: "degraded",
      },
    };
    const fetchMock = stubDetailFetch(queuedDetail);

    renderDetail({
      fetchMock,
      fullDetail: queuedDetail,
      initialDetail: queuedDetail,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2000);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mocks.routerRefresh).not.toHaveBeenCalled();
  });
});
