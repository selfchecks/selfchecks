import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  DashboardCheckRow,
  DashboardGroupRow,
  DashboardSummary,
} from "@/lib/dashboard-types";

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
};

function createCheck(overrides: Partial<DashboardCheckRow>): DashboardCheckRow {
  const name = overrides.name ?? "check";

  return {
    avg: "100 ms",
    ava: "100%",
    bars: [
      {
        duration: "100 ms",
        occurredAt: "Jun 22 22:20 (UTC+3)",
        runner: "Local runner",
        status: "passing",
        value: 12,
      },
      {
        duration: "120 ms",
        occurredAt: "Jun 22 22:25 (UTC+3)",
        runner: "Local runner",
        status: "passing",
        value: 18,
      },
    ],
    delta: "24 h",
    id: `check-${name}`,
    name: "check",
    p95: "100 ms",
    status: "passing",
    tags: ["api", "regress"],
    time: "about 1 hour ago",
    type: "api",
    ...overrides,
  };
}

function renderDashboard() {
  render(
    <DashboardClient initialGroups={fixtureGroups} initialSummary={fixtureSummary} />,
  );
}

describe("DashboardPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the Checkly-like dashboard shell", () => {
    renderDashboard();

    expect(
      screen.getByRole("heading", { name: "Synthetic checks dashboard" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Home" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open account menu" })).toBeTruthy();
    expect(screen.queryByText("nikolaev@iprojects.ru")).toBeNull();
    expect(screen.queryByText("account")).toBeNull();
    expect(screen.getByText("PASSING")).toBeTruthy();
    expect(screen.getByText("DEGRADED")).toBeTruthy();
    expect(screen.getByText("FAILING")).toBeTruthy();
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

  it("explains check status icons", () => {
    renderDashboard();

    expect(
      screen.getAllByLabelText(
        "Degraded: The latest run needs attention or the check has not run yet.",
      ).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByLabelText("Passing: The latest run passed.").length,
    ).toBeGreaterThan(0);
  });

  it("renders last result hover targets with run details", () => {
    renderDashboard();

    expect(
      screen.getAllByLabelText("Local runner 100 ms Jun 22 22:20 (UTC+3)").length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByRole("tooltip").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Local runner").length).toBeGreaterThan(0);
  });

  it("filters checks from the search field", async () => {
    const user = userEvent.setup();

    renderDashboard();

    await user.type(screen.getByRole("searchbox", { name: "Search checks" }), "issue");

    expect(screen.getByText("issue.get")).toBeTruthy();
    expect(screen.queryByText("group.list")).toBeNull();
    expect(screen.queryByText("track.list")).toBeNull();
  });

  it("toggles grouped rows", async () => {
    const user = userEvent.setup();

    renderDashboard();

    expect(screen.getByText("group.list")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Collapse API / Regress" }));

    expect(screen.queryByText("group.list")).toBeNull();
  });

  it("updates filters from summary cards and filter selects", async () => {
    const user = userEvent.setup();

    renderDashboard();

    await user.click(screen.getByRole("button", { name: /DEGRADED/ }));

    expect(screen.getByText("group.list")).toBeTruthy();
    expect(screen.queryByText("issue.get")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Home" }));
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

  it("opens and closes custom filter dropdowns", async () => {
    const user = userEvent.setup();

    renderDashboard();

    await user.click(screen.getByRole("button", { name: "Status" }));

    expect(screen.getByRole("listbox")).toBeTruthy();
    expect(screen.getByRole("option", { name: "Passing" })).toBeTruthy();

    await user.click(screen.getByRole("searchbox", { name: "Search checks" }));

    expect(screen.queryByRole("option", { name: "Passing" })).toBeNull();
  });

  it("opens local menus", async () => {
    const user = userEvent.setup();

    renderDashboard();

    await user.click(screen.getByRole("button", { name: "issue.get actions" }));
    await user.click(screen.getByRole("button", { name: "Open" }));

    expect(screen.getByText("Selected issue.get.")).toBeTruthy();
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

  it("queues a check run from the row action menu", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(
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
    vi.stubGlobal("fetch", fetchMock);

    renderDashboard();

    await user.click(screen.getByRole("button", { name: "issue.get actions" }));
    await user.click(screen.getByRole("button", { name: "Run now" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/checks/check-issue.get/run", {
        method: "POST",
      });
    });
    expect(screen.getByText("Queued issue.get.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Run now" })).toBeNull();
  });
});
