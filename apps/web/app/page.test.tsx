import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

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
  return {
    avg: "100 ms",
    ava: "100%",
    bars: [
      {
        value: 12,
      },
      {
        value: 18,
      },
    ],
    delta: "24 h",
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
    <DashboardClient
      initialGroups={fixtureGroups}
      initialSummary={fixtureSummary}
      projectSlug="account"
    />,
  );
}

describe("DashboardPage", () => {
  it("renders the Checkly-like dashboard shell", () => {
    renderDashboard();

    expect(
      screen.getByRole("heading", { name: "Synthetic checks dashboard" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Home" })).toBeTruthy();
    expect(screen.getByText("nikolaev@iprojects.ru")).toBeTruthy();
    expect(screen.getByText("PASSING")).toBeTruthy();
    expect(screen.getByText("DEGRADED")).toBeTruthy();
    expect(screen.getByText("FAILING")).toBeTruthy();
    expect(screen.getByRole("searchbox", { name: "Search checks" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Heartbeats" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Alert channels" })).toBeNull();
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

  it("updates filters from summary cards and filter buttons", async () => {
    const user = userEvent.setup();

    renderDashboard();

    await user.click(screen.getByRole("button", { name: /DEGRADED/ }));

    expect(screen.getByText("group.list")).toBeTruthy();
    expect(screen.queryByText("issue.get")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Home" }));
    await user.click(screen.getByRole("button", { name: /Tags/ }));

    expect(screen.getByRole("button", { name: /api/ })).toBeTruthy();
    expect(screen.getByText("group.list")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /api/ }));

    expect(screen.getByRole("button", { name: /regress/ })).toBeTruthy();
    expect(screen.getByText("group.list")).toBeTruthy();
    expect(screen.queryByText("API / Bff")).toBeNull();
  });

  it("opens the account menu and cycles passive filters", async () => {
    const user = userEvent.setup();

    renderDashboard();

    await user.click(screen.getByRole("button", { name: "nikolaev@iprojects.ru" }));
    expect(screen.getByText("Signed in locally")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Last 24 hours" }));
    expect(screen.getByRole("button", { name: "Last 7 days" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Check type" }));
    expect(screen.getByRole("button", { name: "API checks" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Traces" }));
    expect(screen.getByRole("button", { name: "With traces" })).toBeTruthy();
    expect(screen.getByText("track.list")).toBeTruthy();
    expect(screen.queryByText("issue.get")).toBeNull();

    await user.click(screen.getByRole("button", { name: /FAILING/ }));
    expect(screen.getByText("No checks match the current filters.")).toBeTruthy();
  });

  it("opens local menus and support panel", async () => {
    const user = userEvent.setup();

    renderDashboard();

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("View saved locally.")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Open support chat" }));
    expect(screen.getByRole("heading", { name: "Support" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "issue.get actions" }));
    await user.click(screen.getByRole("button", { name: "Open" }));

    expect(screen.getByText("Selected issue.get.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Open" })).toBeNull();
  });
});
