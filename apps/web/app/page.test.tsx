import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

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

import type {
  DashboardCheckRow,
  DashboardFirewatch,
  DashboardGroupRow,
  DashboardQueueRow,
  DashboardSummary,
} from "@/lib/dashboard-types";
import type { DashboardSettingsData } from "@/lib/settings-data";

import DashboardClient from "./dashboard-client";
import { DashboardPageSkeleton } from "./dashboard-loading";

const fixtureGroups: DashboardGroupRow[] = [
  {
    checks: "1 checks",
    name: "API / Bff",
    status: "passing",
    updated: "10 minutes ago",
  },
  {
    checks: "5 checks",
    children: [
      createCheck({
        avg: "1.53 s",
        hasTrace: true,
        name: "group.list",
        p95: "1.53 s",
        status: "degraded",
      }),
      createCheck({
        avg: "514 ms",
        name: "issue.get",
        p95: "514 ms",
        status: "passing",
      }),
      createCheck({
        avg: "388 ms",
        hasTrace: true,
        name: "member.get",
        p95: "388 ms",
        status: "passing",
      }),
      createCheck({
        avg: "305 ms",
        name: "sequence.get",
        p95: "305 ms",
        status: "passing",
      }),
      createCheck({
        avg: "739 ms",
        hasTrace: true,
        name: "track.list",
        p95: "739 ms",
        status: "passing",
      }),
    ],
    expanded: true,
    name: "API / Regress",
    status: "degraded",
    updated: "about 8 hours ago",
  },
];

const fixtureSummary: DashboardSummary = {
  degraded: 1,
  failing: 0,
  passing: 5,
  queued: 0,
  running: 0,
};
const emptyFirewatch: DashboardFirewatch = {
  lookbackDays: 7,
  rows: [],
};
const fixtureAiEndpointOptions = [
  {
    label: "OpenAI",
    value: "https://api.openai.com/v1",
  },
  {
    label: "OpenRouter",
    value: "https://openrouter.ai/api/v1",
  },
  {
    label: "Gemini",
    value: "https://generativelanguage.googleapis.com/v1beta/openai",
  },
  {
    label: "Custom",
    value: "__custom__",
  },
];
const fixtureSettings: DashboardSettingsData = {
  ai: {
    apiEndpoint: "https://openrouter.ai/api/v1",
    apiEndpointOption: "https://openrouter.ai/api/v1",
    apiKeyMasked: "************f7dd",
    customEndpoint: "",
    endpointOptions: fixtureAiEndpointOptions,
    hasApiKey: true,
    model: "openai/gpt-5-mini",
    responseLanguage: "Russian",
  },
  apiKeys: [
    {
      createdAt: "2026-07-10T08:00:00.000Z",
      createdAtLabel: "10 Jul 2026, 11:00",
      id: "key_existing",
      name: "Existing CI",
      preview: "sck_example...cdef",
    },
  ],
  basic: {
    domain: "checks.example.com",
    login: "nikolaev@iprojects.ru",
    notificationEmail: "ops@example.com",
    publicUrl: "https://checks.example.com",
    timeZone: "Europe/Moscow",
  },
  environment: {
    name: "default",
    secrets: [
      {
        currentName: "API_TOKEN",
        hasValue: true,
        name: "API_TOKEN",
        updatedAt: "2026-06-24T10:00:00.000Z",
        value: "",
        valueMasked: "************cdef",
      },
    ],
    variables: [
      {
        name: "BASE_URL",
        value: "https://app.example.com",
      },
    ],
  },
  performance: {
    artifactRetentionDays: 14,
    historyRetentionDays: 180,
    queuedRunTimeoutMinutes: 30,
    runningRunTimeoutMinutes: 120,
    testSessionTimeoutMinutes: 30,
    workerConcurrency: 2,
  },
  projectSlug: "default",
};

function createCheck(overrides: Partial<DashboardCheckRow>): DashboardCheckRow {
  const name = overrides.name ?? "check";
  const status = overrides.status ?? "passing";
  const runState =
    overrides.runState ??
    (status === "passing" ? "passed" : status === "failing" ? "failed" : "not_run");
  const artifacts = overrides.hasTrace
    ? [
        {
          downloadUrl: `/api/runs/run-${name}/artifacts/artifact-${name}?download=1`,
          id: `artifact-${name}`,
          mimeType: "application/zip",
          name: `${name}-trace.zip`,
          size: "42 KB",
          type: "trace" as const,
          viewUrl: `/runs/run-${name}/artifacts/artifact-${name}/trace`,
        },
      ]
    : [];

  const baseCheck: DashboardCheckRow = {
    avg: "100 ms",
    ava: "100%",
    bars: [
      {
        duration: "100 ms",
        href: `/checks/check-${name}/runs/run-${name}-previous`,
        occurredAt: "Jun 22 22:20",
        runner: "Local runner",
        runState,
        status,
        value: 12,
      },
      {
        duration: "120 ms",
        href: `/checks/check-${name}/runs/run-${name}`,
        occurredAt: "Jun 22 22:25",
        runner: "Local runner",
        runState,
        status,
        value: 18,
      },
    ],
    delta: "24 h",
    id: `check-${name}`,
    name: "check",
    p95: "100 ms",
    runState,
    runs: [
      {
        attempt: 1,
        artifacts,
        createdAt: "2026-06-22T19:25:00.000Z",
        duration: "120 ms",
        durationMs: 120,
        hasRetries: false,
        id: `run-${name}`,
        maxAttempts: 1,
        occurredAt: "Jun 22 22:25",
        runner: "Local runner",
        runState,
        status,
      },
    ],
    settings: {
      enabled: true,
      frequency: "5 min",
      key: name,
      request: {
        assertions: 2,
        body: false,
        headers: 1,
        method: "GET",
        url: `https://example.test/${name}`,
      },
    },
    stats: {
      averageDuration: "100 ms",
      failedRuns: status === "failing" ? "1" : "0",
      p95Duration: "100 ms",
      passedRuns: status === "passing" ? "1" : "0",
      totalRuns: "1",
    },
    status,
    tags: ["api", "regress"],
    time: "about 1 hour ago",
    type: "api",
  };

  return {
    ...baseCheck,
    ...overrides,
  } as DashboardCheckRow;
}

function createQueueRow(overrides: Partial<DashboardQueueRow>): DashboardQueueRow {
  const runState = overrides.runState ?? "queued";
  const checkName = overrides.checkName ?? "checkout.ready";

  return {
    branch: "production",
    checkHref: `/checks/check-${checkName}`,
    checkId: `check-${checkName}`,
    checkName,
    createdAt: "2026-07-05T09:40:00.000Z",
    createdAtLabel: "Jul 05 12:40",
    groupName: "API / Checkout",
    id: `run-${checkName}`,
    runState,
    source: "manual",
    sourceLabel: "Manual",
    type: "api",
    ...overrides,
  };
}

function renderDashboard(
  options: {
    activeView?: "dashboard" | "queue" | "settings";
    queue?: DashboardQueueRow[];
  } = {},
) {
  render(
    <DashboardClient
      initialActiveView={options.activeView}
      initialGroups={fixtureGroups}
      initialQueue={options.queue}
      initialSettings={fixtureSettings}
      initialSummary={fixtureSummary}
    />,
  );
}

describe("DashboardPage", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders the Checkly-like dashboard shell", () => {
    renderDashboard();

    expect(
      screen.getByRole("heading", { name: "Synthetic checks dashboard" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Home" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Queue" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /SelfChecks/ })).toBeTruthy();
    expect(screen.queryByText("Available now")).toBeNull();
    expect(screen.getByRole("button", { name: "Open account menu" })).toBeTruthy();
    expect(screen.queryByText("nikolaev@iprojects.ru")).toBeNull();
    expect(screen.queryByText("account")).toBeNull();
    expect(screen.getByRole("button", { name: "Run all checks" })).toBeTruthy();
    expect(screen.getByRole("status", { name: "Running 0, queued 0" })).toBeTruthy();
    expect(screen.getByText("PASSING")).toBeTruthy();
    expect(screen.getByText("DEGRADED")).toBeTruthy();
    expect(screen.getByText("FAILING")).toBeTruthy();
    expect(screen.queryByText("RUNNING")).toBeNull();
    expect(screen.queryByText("QUEUED")).toBeNull();
    const firewatchToggle = screen.getByRole("button", { name: "Firewatch" });

    expect(firewatchToggle.getAttribute("aria-expanded")).toBe("false");
    expect(
      screen.queryByText("No newly failing checks in the last 7 days."),
    ).toBeNull();
    expect(screen.getByRole("searchbox", { name: "Search checks" })).toBeTruthy();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByRole("button", { name: "Last 24 hours" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Status" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Check type" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tags" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Traces" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Heartbeats" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Alert channels" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Open support chat" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Support" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });

  it("renders the dashboard skeleton while the snapshot is loading", () => {
    const { container } = render(<DashboardPageSkeleton />);
    const skeletonPlaceholders = Array.from(
      container.querySelectorAll("[aria-hidden='true']"),
    );

    expect(screen.getByLabelText("Loading dashboard data")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Run all checks" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Restart all failed checks" }),
    ).toBeNull();
    expect(
      skeletonPlaceholders.some((node) => String(node.className).includes("h-10 w-44")),
    ).toBe(true);
    expect(
      skeletonPlaceholders.some((node) => String(node.className).includes("h-9 w-56")),
    ).toBe(true);
    expect(
      screen
        .getByRole("button", { name: "Open account menu" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(screen.getByRole("status", { name: "Running 0, queued 0" })).toBeTruthy();
    expect(screen.getByLabelText("Open queue: running 0, queued 0")).toBeTruthy();
    expect(screen.getByText("Usage")).toBeTruthy();
    expect(screen.getByText("Firewatch")).toBeTruthy();
    expect(screen.getByText("PASSING")).toBeTruthy();
    expect(screen.getByText("Last results")).toBeTruthy();
  });

  it("shows grouped checks and operational metrics", () => {
    renderDashboard();

    expect(screen.getByText("API / Regress")).toBeTruthy();
    expect(screen.getByText("group.list")).toBeTruthy();
    expect(screen.getByText("issue.get")).toBeTruthy();
    expect(screen.getByText("Last results")).toBeTruthy();
    expect(screen.getByText("AVA")).toBeTruthy();
    expect(screen.getByText("P95")).toBeTruthy();
  });

  it("renders Firewatch rows and queues checks from the block", async () => {
    const user = userEvent.setup();
    const failingCheck = createCheck({
      name: "bff-health",
      runState: "failed",
      status: "failing",
      time: "about 1 hour ago",
    });
    const groups: DashboardGroupRow[] = [
      {
        checks: "1 checks",
        children: [failingCheck],
        expanded: true,
        name: "API / Bff",
        status: "failing",
        updated: "about 1 hour ago",
      },
    ];
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Promise.resolve(
          new Response(JSON.stringify({ runId: "run_1", status: "queued" }), {
            headers: {
              "content-type": "application/json",
            },
            status: 202,
          }),
        );
      }

      expect(input).toBe("/api/dashboard");

      return Promise.resolve(
        new Response(
          JSON.stringify({
            firewatch: emptyFirewatch,
            groups,
            summary: {
              degraded: 0,
              failing: 1,
              passing: 0,
              queued: 0,
              running: 0,
            },
          }),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 200,
          },
        ),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <DashboardClient
        initialFirewatch={{
          lookbackDays: 7,
          rows: [
            {
              checkId: failingCheck.id,
              firstSeen: "about 3 hours ago",
              firstSeenAt: "2026-07-05T09:00:00.000Z",
              groupName: "API / Bff",
              lastSeen: "about 1 hour ago",
              lastSeenAt: "2026-07-05T11:00:00.000Z",
              name: failingCheck.name,
              type: "api",
            },
          ],
        }}
        initialGroups={groups}
        initialSettings={fixtureSettings}
        initialSummary={{
          degraded: 0,
          failing: 1,
          passing: 0,
          queued: 0,
          running: 0,
        }}
      />,
    );

    const firewatchToggle = screen.getByRole("button", { name: "Firewatch" });

    expect(firewatchToggle.getAttribute("aria-expanded")).toBe("false");
    expect(
      screen.queryByText("You have 1 check that started failing in the last 7 days"),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Restart all failed checks" }),
    ).toBeTruthy();

    await user.click(firewatchToggle);

    expect(firewatchToggle.getAttribute("aria-expanded")).toBe("true");
    expect(
      screen.getByText("You have 1 check that started failing in the last 7 days"),
    ).toBeTruthy();

    await user.click(screen.getByRole("link", { name: "API / Bff / bff-health" }));

    expect(mocks.routerPush).toHaveBeenCalledWith("/checks/check-bff-health");

    await user.click(screen.getByRole("button", { name: "Schedule now" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/checks/check-bff-health/run", {
        method: "POST",
      });
    });
    expect(
      screen.getByText("No newly failing checks in the last 7 days."),
    ).toBeTruthy();
  });

  it("queues all failed checks from Firewatch even when no rows are newly failing", async () => {
    const user = userEvent.setup();
    const failedApiCheck = createCheck({
      name: "bff-gtm-js",
      runState: "failed",
      status: "failing",
    });
    const failedBrowserCheck = createCheck({
      name: "signin.browser",
      runState: "timed_out",
      status: "failing",
      type: "browser",
    });
    const passingCheck = createCheck({
      name: "bff-health",
      runState: "passed",
      status: "passing",
    });
    const groups: DashboardGroupRow[] = [
      {
        checks: "2 checks",
        children: [failedApiCheck, passingCheck],
        expanded: true,
        name: "API / Bff",
        status: "failing",
        updated: "about 1 hour ago",
      },
      {
        checks: "1 checks",
        children: [failedBrowserCheck],
        expanded: true,
        name: "App / Smoke",
        status: "failing",
        updated: "about 2 hours ago",
      },
    ];
    const postResolvers: Array<() => void> = [];
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        return new Promise<Response>((resolve) =>
          postResolvers.push(() =>
            resolve(
              new Response(JSON.stringify({ runId: "run_queued", status: "queued" }), {
                headers: {
                  "content-type": "application/json",
                },
                status: 202,
              }),
            ),
          ),
        );
      }

      expect(input).toBe("/api/dashboard");

      return Promise.resolve(
        new Response(
          JSON.stringify({
            firewatch: emptyFirewatch,
            groups,
            summary: {
              degraded: 0,
              failing: 2,
              passing: 1,
              queued: 0,
              running: 0,
            },
          }),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 200,
          },
        ),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <DashboardClient
        initialFirewatch={emptyFirewatch}
        initialGroups={groups}
        initialSettings={fixtureSettings}
        initialSummary={{
          degraded: 0,
          failing: 2,
          passing: 1,
          queued: 0,
          running: 0,
        }}
      />,
    );

    expect(
      screen.queryByText("No newly failing checks in the last 7 days."),
    ).toBeNull();

    await user.click(screen.getByRole("button", { name: "Restart all failed checks" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/checks/check-bff-gtm-js/run", {
        method: "POST",
      });
      expect(fetchMock).toHaveBeenCalledWith("/api/checks/check-signin.browser/run", {
        method: "POST",
      });
    });
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Restart all failed checks" }),
      ).toBeNull();
      expect(screen.getAllByText("queued").length).toBeGreaterThan(0);
      expect(screen.getByRole("button", { name: /DEGRADED 0/ })).toBeTruthy();
      expect(screen.getByRole("status", { name: "Running 0, queued 2" })).toBeTruthy();
    });
    expect(fetchMock).not.toHaveBeenCalledWith("/api/checks/check-bff-health/run", {
      method: "POST",
    });

    for (const resolvePost of postResolvers) {
      resolvePost();
    }
  });

  it("queues every runnable check from the topbar action", async () => {
    const user = userEvent.setup();
    const passingCheck = createCheck({
      name: "bff-health",
      runState: "passed",
      status: "passing",
    });
    const failingCheck = createCheck({
      name: "signin.browser",
      runState: "failed",
      status: "failing",
      type: "browser",
    });
    const queuedCheck = createCheck({
      name: "already-queued",
      runState: "queued",
      status: "degraded",
      time: "queued",
    });
    const runningCheck = createCheck({
      name: "already-running",
      runState: "running",
      status: "degraded",
      time: "running",
    });
    const groups: DashboardGroupRow[] = [
      {
        checks: "4 checks",
        children: [passingCheck, failingCheck, queuedCheck, runningCheck],
        expanded: false,
        name: "API / Bff",
        status: "failing",
        updated: "about 1 hour ago",
      },
    ];
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Promise.resolve(
          new Response(JSON.stringify({ runId: "run_queued", status: "queued" }), {
            headers: {
              "content-type": "application/json",
            },
            status: 202,
          }),
        );
      }

      expect(input).toBe("/api/dashboard");

      return Promise.resolve(
        new Response(
          JSON.stringify({
            firewatch: emptyFirewatch,
            groups,
            summary: {
              degraded: 0,
              failing: 1,
              passing: 1,
              queued: 1,
              running: 1,
            },
          }),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 200,
          },
        ),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <DashboardClient
        initialFirewatch={emptyFirewatch}
        initialGroups={groups}
        initialSettings={fixtureSettings}
        initialSummary={{
          degraded: 0,
          failing: 1,
          passing: 1,
          queued: 1,
          running: 1,
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Run all checks" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/checks/check-bff-health/run", {
        method: "POST",
      });
      expect(fetchMock).toHaveBeenCalledWith("/api/checks/check-signin.browser/run", {
        method: "POST",
      });
    });
    expect(fetchMock).not.toHaveBeenCalledWith("/api/checks/check-already-queued/run", {
      method: "POST",
    });
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/checks/check-already-running/run",
      {
        method: "POST",
      },
    );
  });

  it("explains check status icons", () => {
    renderDashboard();

    expect(
      screen.getAllByLabelText("Not run yet: This check has no recorded runs yet.")
        .length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByLabelText("Passing: The latest run passed.").length,
    ).toBeGreaterThan(0);
  });

  it("renders last result hover targets with run details", async () => {
    const user = userEvent.setup();

    renderDashboard();

    const resultBar = screen.getAllByLabelText(
      "Passing Local runner 100 ms Jun 22 22:20",
    )[0]!;

    await user.hover(resultBar);

    await waitFor(() => {
      expect(document.querySelector("[role='tooltip'].fixed")).toBeTruthy();
    });
    expect(screen.getAllByText("Local runner").length).toBeGreaterThan(0);
  });

  it("renders failed and cancelled result bars with matching status colors", () => {
    render(
      <DashboardClient
        initialGroups={[
          {
            checks: "1 checks",
            children: [
              createCheck({
                bars: [
                  {
                    duration: "6 ms",
                    occurredAt: "Jul 05 09:37",
                    runner: "Local runner",
                    runState: "failed",
                    status: "failing",
                    tone: "bad",
                    value: 8,
                  },
                  {
                    duration: "-",
                    occurredAt: "Jul 05 09:38",
                    runner: "Local runner",
                    runState: "cancelled",
                    status: "failing",
                    tone: "muted",
                    value: 8,
                  },
                ],
                name: "bff-health",
                status: "failing",
              }),
            ],
            expanded: true,
            name: "API / Bff",
            status: "failing",
            updated: "3 minutes ago",
          },
        ]}
        initialSettings={fixtureSettings}
        initialSummary={{
          degraded: 0,
          failing: 1,
          passing: 0,
          queued: 0,
          running: 0,
        }}
      />,
    );

    const failedBar = screen.getByLabelText("Failing Local runner 6 ms Jul 05 09:37");

    expect(failedBar.querySelector("[aria-hidden='true']")?.className).toContain(
      "bg-red-500",
    );

    const cancelledBar = screen.getByLabelText("Cancelled Local runner - Jul 05 09:38");

    expect(cancelledBar.querySelector("[aria-hidden='true']")?.className).toContain(
      "bg-slate-500",
    );
  });

  it("renders grouped retry result bars with all attempts and a retry marker", async () => {
    const user = userEvent.setup();

    render(
      <DashboardClient
        initialGroups={[
          {
            checks: "1 checks",
            children: [
              createCheck({
                bars: [
                  {
                    attempts: [
                      {
                        duration: "1.41 min",
                        label: "Attempt #1",
                        occurredAt: "Jul 08 17:20",
                        runner: "Local runner",
                        runState: "failed",
                        status: "failing",
                        tone: "bad",
                      },
                      {
                        duration: "28.64 s",
                        label: "Attempt #2",
                        occurredAt: "Jul 08 17:22",
                        runner: "Local runner",
                        runState: "passed",
                        status: "passing",
                        tone: "good",
                      },
                    ],
                    duration: "28.64 s",
                    hasRetries: true,
                    href: "/checks/check-bff-health/runs/run_2",
                    occurredAt: "Jul 08 17:22",
                    runner: "Local runner",
                    runState: "passed",
                    status: "passing",
                    tone: "good",
                    value: 28,
                  },
                ],
                name: "bff-health",
                status: "passing",
              }),
            ],
            expanded: true,
            name: "API / Bff",
            status: "passing",
            updated: "3 minutes ago",
          },
        ]}
        initialSettings={fixtureSettings}
        initialSummary={{
          degraded: 0,
          failing: 0,
          passing: 1,
          queued: 0,
          running: 0,
        }}
      />,
    );

    const retryBar = screen.getByLabelText(
      "Passing Local runner 28.64 s Jul 08 17:22 2 attempts",
    );

    expect(retryBar.querySelector(".bg-orange-400")).toBeTruthy();

    await user.hover(retryBar);

    expect(await screen.findByText("Attempt #1")).toBeTruthy();
    expect(screen.getByText("Attempt #2 (final)")).toBeTruthy();
    expect(screen.getByText("1.41 min")).toBeTruthy();
    expect(screen.getByText("28.64 s")).toBeTruthy();
  });

  it("opens the run detail when a result bar is clicked", async () => {
    const user = userEvent.setup();

    renderDashboard();

    const resultBar = screen.getAllByLabelText(
      "Passing Local runner 120 ms Jun 22 22:25",
    )[0]!;
    const resultLink = resultBar.closest("a");

    expect(resultLink?.getAttribute("href")).toBe(
      "/checks/check-issue.get/runs/run-issue.get",
    );

    resultLink?.addEventListener("click", (event) => event.preventDefault());

    await user.click(resultBar);

    expect(mocks.routerPush).not.toHaveBeenCalledWith("/checks/check-issue.get");
  });

  it("filters checks from the search field", async () => {
    const user = userEvent.setup();

    renderDashboard();

    await user.type(screen.getByRole("searchbox", { name: "Search checks" }), "issue");

    expect(screen.getByText("issue.get")).toBeTruthy();
    expect(screen.queryByText("group.list")).toBeNull();
    expect(screen.queryByText("track.list")).toBeNull();
  });

  it("toggles grouped rows from the whole group row", async () => {
    const user = userEvent.setup();

    renderDashboard();

    expect(screen.getByText("group.list")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "API / Regress actions" }));
    expect(screen.getByText("group.list")).toBeTruthy();

    await user.click(screen.getByText("API / Regress"));

    expect(screen.queryByText("group.list")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Expand API / Regress" }));

    expect(screen.getByText("group.list")).toBeTruthy();
  });

  it("updates filters from summary cards and filter selects", async () => {
    const user = userEvent.setup();

    renderDashboard();

    await user.click(screen.getByRole("button", { name: /DEGRADED/ }));

    expect(screen.getByText("group.list")).toBeTruthy();
    expect(screen.queryByText("issue.get")).toBeNull();

    await user.click(screen.getByRole("button", { name: /SelfChecks/ }));
    expect(screen.getByText("Dashboard filters reset.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Tags" }));
    await user.click(screen.getByRole("option", { name: "api" }));

    expect(screen.getByRole("button", { name: "api" })).toBeTruthy();
    expect(screen.getByText("group.list")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "api" }));
    await user.click(screen.getByRole("option", { name: "regress" }));

    expect(screen.getByRole("button", { name: "regress" })).toBeTruthy();
    expect(screen.getByText("group.list")).toBeTruthy();
    expect(screen.queryByText("API / Bff")).toBeNull();
  });

  it("shows active queue rows from the sidebar without dashboard filters", async () => {
    const user = userEvent.setup();
    const runningRow = createQueueRow({
      branch: "release/3.192.42",
      checkHref: "/test-sessions/session_1/checks/checkout.running",
      checkName: "checkout.running",
      createdAt: "2026-07-05T09:39:00.000Z",
      runState: "running",
      source: "cli",
      sourceLabel: "CLI",
      type: "browser",
    });
    const queuedRow = createQueueRow({
      checkName: "checkout.queued",
      createdAt: "2026-07-05T09:40:00.000Z",
      runState: "queued",
      source: "schedule",
      sourceLabel: "Schedule",
    });

    render(
      <DashboardClient
        initialGroups={[
          {
            checks: "2 checks",
            children: [
              createCheck({
                name: "checkout.running",
                runState: "running",
                status: "degraded",
                time: "running",
              }),
              createCheck({
                name: "checkout.ready",
                runState: "passed",
                status: "passing",
              }),
            ],
            expanded: true,
            name: "API / Checkout",
            status: "degraded",
            updated: "running",
          },
        ]}
        initialQueue={[queuedRow, runningRow]}
        initialSettings={fixtureSettings}
        initialSummary={{
          degraded: 0,
          failing: 0,
          passing: 1,
          queued: 1,
          running: 1,
        }}
      />,
    );

    expect(screen.getByRole("status", { name: "Running 1, queued 1" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Queue" }));

    expect(screen.getByRole("heading", { name: "Queue" })).toBeTruthy();
    expect(screen.getByText("2 active tests")).toBeTruthy();
    expect(screen.queryByRole("searchbox", { name: "Search checks" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Status" })).toBeNull();
    expect(screen.getByText("checkout.running")).toBeTruthy();
    expect(screen.getByText("checkout.queued")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "checkout.running" }).getAttribute("href"),
    ).toBe("/test-sessions/session_1/checks/checkout.running");
    expect(screen.getByText("release/3.192.42")).toBeTruthy();
    expect(screen.getByText("CLI")).toBeTruthy();
    expect(screen.getByText("Schedule")).toBeTruthy();

    const tableText = screen.getByRole("table").textContent ?? "";

    expect(tableText.indexOf("checkout.running")).toBeLessThan(
      tableText.indexOf("checkout.queued"),
    );
  });

  it("keeps the last dashboard snapshot when live refresh fails", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      expect(input).toBe("/api/dashboard");

      return Promise.resolve(
        new Response(
          JSON.stringify({
            error: "Unable to load dashboard data.",
          }),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 503,
          },
        ),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <DashboardClient
        initialGroups={[
          {
            checks: "2 checks",
            children: [
              createCheck({
                name: "checkout.running",
                runState: "running",
                status: "degraded",
                time: "running",
              }),
              createCheck({
                name: "checkout.ready",
                runState: "passed",
                status: "passing",
              }),
            ],
            expanded: true,
            name: "API / Checkout",
            status: "degraded",
            updated: "running",
          },
        ]}
        initialSettings={fixtureSettings}
        initialSummary={{
          degraded: 0,
          failing: 0,
          passing: 1,
          queued: 0,
          running: 1,
        }}
      />,
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/dashboard", {
        cache: "no-store",
      });
    });
    await waitFor(() => {
      expect(screen.getByText("Unable to refresh run status.")).toBeTruthy();
    });

    expect(screen.getByText("checkout.running")).toBeTruthy();
    expect(screen.getByText("checkout.ready")).toBeTruthy();
    expect(screen.queryByText("No checks match the current filters.")).toBeNull();
  });

  it("opens the account menu and updates passive filter selects", async () => {
    const user = userEvent.setup();

    renderDashboard();

    await user.click(screen.getByRole("button", { name: "Open account menu" }));
    expect(screen.getByText("nikolaev@iprojects.ru")).toBeTruthy();
    expect(screen.queryByText("Signed in locally")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Last 24 hours" }));
    await user.click(screen.getByRole("option", { name: "Last 7 days" }));
    expect(screen.getByRole("button", { name: "Last 7 days" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Check type" }));
    await user.click(screen.getByRole("option", { name: "API checks" }));
    expect(screen.getByRole("button", { name: "API checks" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Traces" }));
    await user.click(screen.getByRole("option", { name: "With traces" }));
    expect(screen.getByRole("button", { name: "With traces" })).toBeTruthy();
    expect(screen.getByText("track.list")).toBeTruthy();
    expect(screen.queryByText("issue.get")).toBeNull();

    await user.click(screen.getByRole("button", { name: /FAILING/ }));
    expect(screen.getByText("No checks match the current filters.")).toBeTruthy();
  });

  it("links to system settings from the sidebar account menu", async () => {
    const user = userEvent.setup();

    renderDashboard();

    await user.click(screen.getByRole("button", { name: "Open account menu" }));
    const settingsLinks = screen.getAllByRole("link", { name: "Settings" });

    expect(settingsLinks).toHaveLength(2);
    expect(settingsLinks[1]?.getAttribute("href")).toBe("/settings");
  });

  it("renders and saves settings forms on the settings view", async () => {
    const user = userEvent.setup();
    const getSectionSaveButton = (heading: string) => {
      const form = screen.getByRole("heading", { name: heading }).closest("form");

      expect(form).toBeTruthy();

      return within(form as HTMLElement).getByRole("button", { name: "Save" });
    };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/settings/basic") {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          domain: string;
          login: string;
          notificationEmail: string;
          timeZone: string;
        };

        return Promise.resolve(
          new Response(
            JSON.stringify({
              settings: {
                domain: body.domain,
                login: body.login,
                notificationEmail: body.notificationEmail,
                publicUrl: `https://${body.domain}`,
                timeZone: body.timeZone,
              },
            }),
            {
              headers: {
                "content-type": "application/json",
              },
              status: 200,
            },
          ),
        );
      }

      if (input === "/api/settings/api-keys") {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          name: string;
        };

        return Promise.resolve(
          new Response(
            JSON.stringify({
              apiKey: "sck_generated_secret",
              key: {
                createdAt: "2026-07-10T09:00:00.000Z",
                createdAtLabel: "10 Jul 2026, 12:00",
                id: "key_generated",
                name: body.name,
                preview: "sck_generate...cret",
              },
            }),
            {
              headers: {
                "content-type": "application/json",
              },
              status: 200,
            },
          ),
        );
      }

      if (
        input === "/api/settings/api-keys/key_generated" &&
        init?.method === "DELETE"
      ) {
        return Promise.resolve(
          new Response(JSON.stringify({ id: "key_generated", revoked: true }), {
            headers: {
              "content-type": "application/json",
            },
            status: 200,
          }),
        );
      }

      if (input === "/api/settings/ai") {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          apiEndpointOption: string;
          apiKey?: string;
          customEndpoint: string;
          model: string;
          responseLanguage: string;
        };

        return Promise.resolve(
          new Response(
            JSON.stringify({
              settings: {
                apiEndpoint:
                  body.apiEndpointOption === "__custom__"
                    ? body.customEndpoint
                    : body.apiEndpointOption,
                apiEndpointOption: body.apiEndpointOption,
                apiKeyMasked: body.apiKey ? "************f7dd" : undefined,
                customEndpoint:
                  body.apiEndpointOption === "__custom__" ? body.customEndpoint : "",
                endpointOptions: fixtureAiEndpointOptions,
                hasApiKey: Boolean(body.apiKey),
                model: body.model,
                responseLanguage: body.responseLanguage,
              },
            }),
            {
              headers: {
                "content-type": "application/json",
              },
              status: 200,
            },
          ),
        );
      }

      if (input === "/api/settings/performance") {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          artifactRetentionDays: number;
          historyRetentionDays: number;
          queuedRunTimeoutMinutes: number;
          runningRunTimeoutMinutes: number;
          testSessionTimeoutMinutes: number;
          workerConcurrency: number;
        };

        return Promise.resolve(
          new Response(
            JSON.stringify({
              settings: {
                artifactRetentionDays: body.artifactRetentionDays,
                historyRetentionDays: body.historyRetentionDays,
                queuedRunTimeoutMinutes: body.queuedRunTimeoutMinutes,
                runningRunTimeoutMinutes: body.runningRunTimeoutMinutes,
                testSessionTimeoutMinutes: body.testSessionTimeoutMinutes,
                workerConcurrency: body.workerConcurrency,
              },
            }),
            {
              headers: {
                "content-type": "application/json",
              },
              status: 200,
            },
          ),
        );
      }

      if (input === "/api/settings/runtime") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              environment: {
                name: "default",
                secrets: fixtureSettings.environment.secrets,
                variables: [
                  {
                    name: "BASE_URL",
                    value: "https://checks2.example.com",
                  },
                ],
              },
            }),
            {
              headers: {
                "content-type": "application/json",
              },
              status: 200,
            },
          ),
        );
      }

      return Promise.reject(new Error(`Unexpected fetch ${String(input)}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    renderDashboard({ activeView: "settings" });

    expect(screen.getByRole("heading", { name: "Administration" })).toBeTruthy();
    expect((screen.getByLabelText("Domain") as HTMLInputElement).value).toBe(
      "checks.example.com",
    );
    expect(
      (screen.getByRole("combobox", { name: "Timezone" }) as HTMLSelectElement).value,
    ).toBe("Europe/Moscow");
    expect(screen.queryByLabelText("Login")).toBeNull();
    expect(screen.queryByLabelText("Notification email")).toBeNull();
    expect(screen.getByRole("heading", { name: "Security" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "API keys" })).toBeTruthy();
    expect((screen.getByLabelText("Key name") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Key name") as HTMLInputElement).placeholder).toBe(
      "API key name",
    );
    expect(screen.getByText("Existing CI")).toBeTruthy();
    expect(screen.getByText("sck_example...cdef")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Performance" })).toBeTruthy();
    expect(
      (screen.getByLabelText("Concurrent test runs") as HTMLInputElement).value,
    ).toBe("2");
    expect(
      (screen.getByLabelText("Queued run timeout") as HTMLInputElement).value,
    ).toBe("30");
    expect(
      (screen.getByLabelText("Running run timeout") as HTMLInputElement).value,
    ).toBe("120");
    expect(
      (screen.getByLabelText("Test artifact retention") as HTMLInputElement).value,
    ).toBe("14");
    expect(
      (screen.getByLabelText("Test history retention") as HTMLInputElement).value,
    ).toBe("180");
    expect(
      (screen.getByLabelText("Maximum test session duration") as HTMLInputElement)
        .value,
    ).toBe("30");
    expect(screen.getByRole("heading", { name: "AI / LLM" })).toBeTruthy();
    expect((screen.getByLabelText("AI_API_ENDPOINT") as HTMLSelectElement).value).toBe(
      "https://openrouter.ai/api/v1",
    );
    expect(screen.getByText("https://openrouter.ai/api/v1")).toBeTruthy();
    expect(screen.getByRole("option", { name: "Gemini" })).toBeTruthy();
    expect((screen.getByLabelText("AI_API_KEY") as HTMLInputElement).placeholder).toBe(
      "Paste new API key",
    );
    expect(screen.getByText("Current key: ************f7dd")).toBeTruthy();
    expect((screen.getByLabelText("AI_MODEL") as HTMLInputElement).value).toBe(
      "openai/gpt-5-mini",
    );
    expect((screen.getByLabelText("Variable 1 name") as HTMLInputElement).value).toBe(
      "BASE_URL",
    );
    expect((screen.getByLabelText("Secret 1 name") as HTMLInputElement).value).toBe(
      "API_TOKEN",
    );
    expect(
      (screen.getByLabelText("Secret 1 value") as HTMLInputElement).placeholder,
    ).toBe("************cdef");

    await user.clear(screen.getByLabelText("Domain"));
    await user.type(screen.getByLabelText("Domain"), "checks2.example.com");
    await user.click(getSectionSaveButton("Basic settings"));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(([input]) => input === "/api/settings/basic"),
      ).toHaveLength(1);
    });
    const basicRequest = fetchMock.mock.calls.find(
      ([input]) => input === "/api/settings/basic",
    )?.[1] as RequestInit;
    expect(JSON.parse(String(basicRequest.body))).toEqual({
      domain: "checks2.example.com",
      login: "nikolaev@iprojects.ru",
      notificationEmail: "ops@example.com",
      timeZone: "Europe/Moscow",
    });
    expect(screen.getByText("Basic settings saved.")).toBeTruthy();

    await user.type(screen.getByLabelText("New password"), "supersecret");
    await user.type(screen.getByLabelText("Confirm password"), "supersecret");
    await user.click(getSectionSaveButton("Security"));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(([input]) => input === "/api/settings/basic"),
      ).toHaveLength(2);
    });
    const securityRequest = fetchMock.mock.calls.filter(
      ([input]) => input === "/api/settings/basic",
    )[1]?.[1] as RequestInit;
    expect(JSON.parse(String(securityRequest.body))).toEqual({
      domain: "checks2.example.com",
      login: "nikolaev@iprojects.ru",
      notificationEmail: "ops@example.com",
      password: "supersecret",
      passwordConfirm: "supersecret",
      timeZone: "Europe/Moscow",
    });
    expect(screen.getByText("Security settings saved.")).toBeTruthy();

    await user.clear(screen.getByLabelText("Key name"));
    await user.type(screen.getByLabelText("Key name"), "Deploy pipeline");
    await user.click(screen.getByRole("button", { name: "Generate" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/settings/api-keys",
        expect.objectContaining({
          method: "POST",
        }),
      );
    });
    expect((screen.getByLabelText("Generated API key") as HTMLInputElement).value).toBe(
      "sck_generated_secret",
    );
    expect(screen.getByText("Deploy pipeline")).toBeTruthy();

    vi.spyOn(window, "confirm").mockReturnValue(true);
    await user.click(
      screen.getByRole("button", { name: "Revoke API key Deploy pipeline" }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/settings/api-keys/key_generated",
        expect.objectContaining({
          method: "DELETE",
        }),
      );
    });
    expect(screen.queryByText("Deploy pipeline")).toBeNull();
    expect(screen.getByText("API key revoked.")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Concurrent test runs"), {
      target: {
        value: "6",
      },
    });
    fireEvent.change(screen.getByLabelText("Queued run timeout"), {
      target: {
        value: "45",
      },
    });
    fireEvent.change(screen.getByLabelText("Running run timeout"), {
      target: {
        value: "180",
      },
    });
    fireEvent.change(screen.getByLabelText("Test artifact retention"), {
      target: {
        value: "21",
      },
    });
    fireEvent.change(screen.getByLabelText("Test history retention"), {
      target: {
        value: "240",
      },
    });
    fireEvent.change(screen.getByLabelText("Maximum test session duration"), {
      target: {
        value: "45",
      },
    });
    await user.click(getSectionSaveButton("Performance"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/settings/performance",
        expect.objectContaining({
          method: "POST",
        }),
      );
    });
    const performanceRequest = fetchMock.mock.calls.find(
      ([input]) => input === "/api/settings/performance",
    )?.[1] as RequestInit;
    expect(JSON.parse(String(performanceRequest.body))).toEqual({
      artifactRetentionDays: 21,
      historyRetentionDays: 240,
      projectSlug: "default",
      queuedRunTimeoutMinutes: 45,
      runningRunTimeoutMinutes: 180,
      testSessionTimeoutMinutes: 45,
      workerConcurrency: 6,
    });
    expect(screen.getByText("Performance settings saved.")).toBeTruthy();

    await user.selectOptions(
      screen.getByLabelText("AI_API_ENDPOINT"),
      "https://generativelanguage.googleapis.com/v1beta/openai",
    );
    await user.clear(screen.getByLabelText("AI_API_KEY"));
    await user.type(screen.getByLabelText("AI_API_KEY"), "new-ai-key-f7dd");
    await user.clear(screen.getByLabelText("AI_MODEL"));
    await user.type(screen.getByLabelText("AI_MODEL"), "gemini-2.5-pro");
    await user.selectOptions(screen.getByLabelText("AI_RESPONSE_LANGUAGE"), "English");
    await user.click(getSectionSaveButton("AI / LLM"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/settings/ai",
        expect.objectContaining({
          method: "POST",
        }),
      );
    });
    const aiRequest = fetchMock.mock.calls.find(
      ([input]) => input === "/api/settings/ai",
    )?.[1] as RequestInit;
    expect(JSON.parse(String(aiRequest.body))).toEqual({
      apiEndpointOption: "https://generativelanguage.googleapis.com/v1beta/openai",
      apiKey: "new-ai-key-f7dd",
      customEndpoint: "",
      model: "gemini-2.5-pro",
      projectSlug: "default",
      responseLanguage: "English",
    });
    expect(screen.getByText("AI settings saved.")).toBeTruthy();

    await user.clear(screen.getByLabelText("Variable 1 value"));
    await user.type(
      screen.getByLabelText("Variable 1 value"),
      "https://checks2.example.com",
    );
    await user.click(getSectionSaveButton("Environment & secrets"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/settings/runtime",
        expect.objectContaining({
          method: "POST",
        }),
      );
    });
    expect(screen.getByText("Environment settings saved.")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Add variable" }));
    expect(screen.getByLabelText("Variable 2 name")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Add secret" }));
    expect(screen.getByLabelText("Secret 2 name")).toBeTruthy();
  }, 15_000);

  it("opens and closes custom filter dropdowns", async () => {
    const user = userEvent.setup();

    renderDashboard();

    await user.click(screen.getByRole("button", { name: "Status" }));

    expect(screen.getByRole("listbox")).toBeTruthy();
    expect(screen.getByRole("option", { name: "Passing" })).toBeTruthy();

    await user.click(screen.getByRole("searchbox", { name: "Search checks" }));

    expect(screen.queryByRole("option", { name: "Passing" })).toBeNull();
  });

  it("navigates to a dedicated check page from rows and menus", async () => {
    const user = userEvent.setup();

    renderDashboard();

    await user.click(screen.getByRole("link", { name: "Open group.list" }));

    expect(mocks.routerPush).toHaveBeenCalledWith("/checks/check-group.list");

    await user.click(screen.getByRole("button", { name: "issue.get actions" }));
    await user.click(screen.getByRole("button", { name: "Open" }));

    expect(mocks.routerPush).toHaveBeenCalledWith("/checks/check-issue.get");
    expect(screen.queryByRole("button", { name: "Open" })).toBeNull();
  });

  it("closes row action menus from outside clicks", async () => {
    const user = userEvent.setup();

    renderDashboard();

    await user.click(screen.getByRole("button", { name: "issue.get actions" }));
    expect(screen.getByRole("button", { name: "Open" })).toBeTruthy();

    await user.click(screen.getByRole("searchbox", { name: "Search checks" }));

    expect(screen.queryByRole("button", { name: "Open" })).toBeNull();
  });

  it("queues a check run from the row action menu and refreshes live run state", async () => {
    const user = userEvent.setup();
    let resolveDashboard: ((response: Response) => void) | undefined;
    const dashboardResponse = new Promise<Response>((resolve) => {
      resolveDashboard = resolve;
    });
    const bffGroup = fixtureGroups[0]!;
    const regressGroup = fixtureGroups[1]!;
    const runningGroups: DashboardGroupRow[] = [
      bffGroup,
      {
        ...regressGroup,
        children: (regressGroup.children ?? []).map((check) =>
          check.name === "issue.get"
            ? {
                ...check,
                bars: [
                  ...check.bars,
                  {
                    duration: "-",
                    occurredAt: "Running",
                    runner: "Local runner",
                    runState: "running" as const,
                    status: "degraded" as const,
                    tone: "active" as const,
                    value: 18,
                  },
                ],
                runState: "running" as const,
                status: "degraded" as const,
                time: "running",
              }
            : check,
        ),
        status: "degraded",
        updated: "running",
      },
    ];
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              runId: "run_1",
              status: "queued",
            }),
            {
              headers: {
                "content-type": "application/json",
              },
              status: 202,
            },
          ),
        );
      }

      expect(input).toBe("/api/dashboard");

      return dashboardResponse;
    });
    vi.stubGlobal("fetch", fetchMock);

    renderDashboard();

    await user.click(screen.getByRole("button", { name: "issue.get actions" }));
    await user.click(screen.getByRole("button", { name: "Run now" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/checks/check-issue.get/run", {
        method: "POST",
      });
    });
    expect(screen.queryByText("Queued issue.get.")).toBeNull();
    expect(screen.getAllByText("queued").length).toBeGreaterThan(0);
    const queuedBar = screen.getByLabelText("Queued Local runner - Queued");

    expect(queuedBar).toBeTruthy();
    expect(queuedBar.querySelector("[aria-hidden='true']")?.className).toContain(
      "bg-yellow-400",
    );
    expect(screen.queryByRole("button", { name: "Run now" })).toBeNull();

    resolveDashboard?.(
      new Response(
        JSON.stringify({
          groups: runningGroups,
          summary: {
            degraded: 1,
            failing: 0,
            passing: 4,
            queued: 0,
            running: 1,
          },
        }),
        {
          headers: {
            "content-type": "application/json",
          },
          status: 200,
        },
      ),
    );

    await waitFor(() => {
      expect(screen.getAllByText("running").length).toBeGreaterThan(0);
    });
    expect(screen.getByLabelText("Running Local runner - Running")).toBeTruthy();
  });
});
