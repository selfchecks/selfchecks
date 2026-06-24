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
        occurredAt: "Jun 24 12:00 (UTC+3)",
        runner: "Local runner",
        runState: "passed",
        status: "passing",
        tone: "good",
        value: 28,
      },
      {
        duration: "2.79 s",
        occurredAt: "Jun 24 15:00 (UTC+3)",
        runner: "Local runner",
        runState: "failed",
        status: "failing",
        tone: "warn",
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
        artifacts: [
          {
            downloadUrl: "/api/runs/run_1/artifacts/artifact_1?download=1",
            id: "artifact_1",
            mimeType: "application/zip",
            name: "trace.zip",
            size: "42 KB",
            type: "trace",
            viewUrl: "/api/runs/run_1/artifacts/artifact_1",
          },
        ],
        createdAt: nowIso,
        duration: "2.34 s",
        durationMs: 2340,
        hasRetries: false,
        id: "run_1",
        occurredAt: "Jun 24 12:00 (UTC+3)",
        runner: "Local runner",
        runState: "passed",
        status: "passing",
      },
      {
        artifacts: [],
        createdAt: twoDaysAgoIso,
        duration: "2.79 s",
        durationMs: 2790,
        errorMessage: "Expected status 200",
        hasRetries: true,
        id: "run_2",
        occurredAt: "Jun 22 12:00 (UTC+3)",
        runner: "Local runner",
        runState: "failed",
        status: "failing",
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
      failedRuns: "1",
      p95Duration: "2.79 s",
      passedRuns: "5",
      totalRuns: "6",
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

function renderDetail() {
  render(<CheckDetailClient accountLabel="nikolaev@iprojects.ru" detail={detail} />);
}

describe("CheckDetailClient", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("renders a dedicated Checkly-like check detail page", () => {
    renderDetail();

    expect(screen.getByRole("heading", { name: "bff-gtm-js" })).toBeTruthy();
    expect(screen.getByText("selfchecks")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Home" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Settings" })).toBeTruthy();
    expect(screen.getByText("API / Bff")).toBeTruthy();
    expect(screen.getByText("Check is passing")).toBeTruthy();
    expect(
      screen.getAllByText("GET https://bff.sndsy.ru/gtm.js?id=GTM-MP43XM").length,
    ).toBeGreaterThan(1);
    expect(screen.getByText("Run results")).toBeTruthy();
    expect(screen.getByText("Run history")).toBeTruthy();
    expect(
      (screen.getByRole("link", {
        name: "Open run result Jun 24 12:00 (UTC+3)",
      }) as HTMLAnchorElement).href,
    ).toContain("/checks/check_1/runs/run_1");
    expect(
      (screen.getByRole("link", { name: "Jun 24 12:00 (UTC+3)" }) as HTMLAnchorElement)
        .href,
    ).toContain("/checks/check_1/runs/run_1");
    expect(screen.getByText("Trace · 42 KB")).toBeTruthy();
    expect(
      (screen.getByRole("link", { name: "View trace.zip" }) as HTMLAnchorElement).href,
    ).toContain("/api/runs/run_1/artifacts/artifact_1");
    expect(
      (screen.getByRole("link", { name: "Download trace.zip" }) as HTMLAnchorElement)
        .href,
    ).toContain("/api/runs/run_1/artifacts/artifact_1?download=1");
  });

  it("filters run results from the segment controls", async () => {
    const user = userEvent.setup();

    renderDetail();

    expect(screen.getByText("Last 2 runs")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Failed" }));

    expect(
      screen.getByRole("button", { name: "Failed" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByText("Expected status 200")).toBeTruthy();
    expect(screen.getByText("Last 1 runs")).toBeTruthy();
    expect(screen.queryByText("Trace · 42 KB")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Has retries" }));
    expect(
      screen
        .getByRole("button", { name: "Has retries" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByText("Expected status 200")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Location" }));
    expect(
      screen.getByRole("button", { name: "Location" }).getAttribute("aria-pressed"),
    ).toBe("true");

    await user.click(screen.getByRole("button", { name: "24hr" }));

    expect(screen.queryByText("Expected status 200")).toBeNull();
    expect(screen.getAllByText("No runs match the current filters.").length).toBe(3);
  });

  it("queues a run from the detail page", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ runId: "run_2", status: "queued" }), {
          headers: {
            "content-type": "application/json",
          },
          status: 202,
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderDetail();

    await user.click(screen.getByRole("button", { name: "Schedule now" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/checks/check_1/run", {
        method: "POST",
      });
    });
    expect(screen.getByText("Check run queued.")).toBeTruthy();
    expect(mocks.routerRefresh).toHaveBeenCalledOnce();
  });

  it("refreshes while a queued or running run is visible", () => {
    vi.useFakeTimers();

    render(
      <CheckDetailClient
        accountLabel="nikolaev@iprojects.ru"
        detail={{
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
        }}
      />,
    );

    expect(mocks.routerRefresh).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(2000);

    expect(mocks.routerRefresh).toHaveBeenCalledTimes(2);
  });
});
