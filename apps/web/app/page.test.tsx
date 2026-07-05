import { render, screen, waitFor } from "@testing-library/react";
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
  DashboardSummary,
} from "@/lib/dashboard-types";
import type { DashboardSettingsData } from "@/lib/settings-data";

import DashboardClient from "./dashboard-client";

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
  basic: {
    domain: "checks.example.com",
    login: "nikolaev@iprojects.ru",
    notificationEmail: "ops@example.com",
    publicUrl: "https://checks.example.com",
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
        occurredAt: "Jun 22 22:20 (UTC+3)",
        runner: "Local runner",
        runState,
        status,
        value: 12,
      },
      {
        duration: "120 ms",
        occurredAt: "Jun 22 22:25 (UTC+3)",
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
        artifacts,
        createdAt: "2026-06-22T19:25:00.000Z",
        duration: "120 ms",
        durationMs: 120,
        hasRetries: false,
        id: `run-${name}`,
        occurredAt: "Jun 22 22:25 (UTC+3)",
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

function renderDashboard() {
  render(
    <DashboardClient
      initialGroups={fixtureGroups}
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
    expect(screen.getByRole("button", { name: /SelfChecks/ })).toBeTruthy();
    expect(screen.queryByText("Available now")).toBeNull();
    expect(screen.getByRole("button", { name: "Open account menu" })).toBeTruthy();
    expect(screen.queryByText("nikolaev@iprojects.ru")).toBeNull();
    expect(screen.queryByText("account")).toBeNull();
    expect(screen.getByText("PASSING")).toBeTruthy();
    expect(screen.getByText("RUNNING")).toBeTruthy();
    expect(screen.getByText("DEGRADED")).toBeTruthy();
    expect(screen.getByText("QUEUED")).toBeTruthy();
    expect(screen.getByText("FAILING")).toBeTruthy();
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
      expect(screen.getByRole("button", { name: /QUEUED 2/ })).toBeTruthy();
    });
    expect(fetchMock).not.toHaveBeenCalledWith("/api/checks/check-bff-health/run", {
      method: "POST",
    });

    for (const resolvePost of postResolvers) {
      resolvePost();
    }
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

  it("renders last result hover targets with run details", () => {
    renderDashboard();

    expect(
      screen.getAllByLabelText("Passing Local runner 100 ms Jun 22 22:20 (UTC+3)")
        .length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByRole("tooltip").length).toBeGreaterThan(0);
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
                    occurredAt: "Jul 05 09:37 (UTC+0)",
                    runner: "Local runner",
                    runState: "failed",
                    status: "failing",
                    tone: "bad",
                    value: 8,
                  },
                  {
                    duration: "-",
                    occurredAt: "Jul 05 09:38 (UTC+0)",
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

    const failedBar = screen.getByLabelText(
      "Failing Local runner 6 ms Jul 05 09:37 (UTC+0)",
    );

    expect(failedBar.querySelector("[aria-hidden='true']")?.className).toContain(
      "bg-red-500",
    );

    const cancelledBar = screen.getByLabelText(
      "Cancelled Local runner - Jul 05 09:38 (UTC+0)",
    );

    expect(cancelledBar.querySelector("[aria-hidden='true']")?.className).toContain(
      "bg-slate-500",
    );
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

  it("filters running checks from the summary card and status filter", async () => {
    const user = userEvent.setup();

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

    await user.click(screen.getByRole("button", { name: /RUNNING/ }));

    expect(screen.getByText("checkout.running")).toBeTruthy();
    expect(screen.queryByText("checkout.ready")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Running" }));
    await user.click(screen.getByRole("option", { name: "All statuses" }));

    expect(screen.getByText("checkout.ready")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Status" }));
    await user.click(screen.getByRole("option", { name: "Running" }));

    expect(screen.getByText("checkout.running")).toBeTruthy();
    expect(screen.queryByText("checkout.ready")).toBeNull();
  });

  it("opens the account menu and updates passive filter selects", async () => {
    const user = userEvent.setup();

    renderDashboard();

    await user.click(screen.getByRole("button", { name: "Open account menu" }));
    expect(screen.getByText("nikolaev@iprojects.ru")).toBeTruthy();
    expect(screen.getByText("Signed in locally")).toBeTruthy();

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

  it("opens settings from the account menu and saves settings forms", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/settings/basic") {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          domain: string;
          login: string;
          notificationEmail: string;
        };

        return Promise.resolve(
          new Response(
            JSON.stringify({
              settings: {
                domain: body.domain,
                login: body.login,
                notificationEmail: body.notificationEmail,
                publicUrl: `https://${body.domain}`,
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

    renderDashboard();

    await user.click(screen.getByRole("button", { name: "Open account menu" }));
    const settingsButtons = screen.getAllByRole("button", { name: "Settings" });
    await user.click(settingsButtons[settingsButtons.length - 1]!);

    expect(screen.getByRole("heading", { name: "Administration" })).toBeTruthy();
    expect((screen.getByLabelText("Domain") as HTMLInputElement).value).toBe(
      "checks.example.com",
    );
    expect(screen.queryByLabelText("Login")).toBeNull();
    expect(screen.queryByLabelText("Notification email")).toBeNull();
    expect(screen.getByRole("heading", { name: "Security" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "AI / LLM" })).toBeTruthy();
    expect((screen.getByLabelText("AI_API_ENDPOINT") as HTMLSelectElement).value).toBe(
      "https://openrouter.ai/api/v1",
    );
    expect(screen.getByText("https://openrouter.ai/api/v1")).toBeTruthy();
    expect(screen.getByRole("option", { name: "Gemini" })).toBeTruthy();
    expect((screen.getByLabelText("AI_API_KEY") as HTMLInputElement).placeholder).toBe(
      "************f7dd",
    );
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
    await user.click(screen.getByRole("button", { name: "Save basic settings" }));

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
    });
    expect(screen.getByText("Basic settings saved.")).toBeTruthy();

    await user.type(screen.getByLabelText("New password"), "supersecret");
    await user.type(screen.getByLabelText("Confirm password"), "supersecret");
    await user.click(screen.getByRole("button", { name: "Save security" }));

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
    });
    expect(screen.getByText("Security settings saved.")).toBeTruthy();

    await user.selectOptions(
      screen.getByLabelText("AI_API_ENDPOINT"),
      "https://generativelanguage.googleapis.com/v1beta/openai",
    );
    await user.clear(screen.getByLabelText("AI_API_KEY"));
    await user.type(screen.getByLabelText("AI_API_KEY"), "new-ai-key-f7dd");
    await user.clear(screen.getByLabelText("AI_MODEL"));
    await user.type(screen.getByLabelText("AI_MODEL"), "gemini-2.5-pro");
    await user.selectOptions(screen.getByLabelText("AI_RESPONSE_LANGUAGE"), "English");
    await user.click(screen.getByRole("button", { name: "Save AI settings" }));

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
    await user.click(screen.getByRole("button", { name: "Save environment" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/settings/runtime",
        expect.objectContaining({
          method: "POST",
        }),
      );
    });
    expect(screen.getByText("Environment settings saved.")).toBeTruthy();
  });

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
