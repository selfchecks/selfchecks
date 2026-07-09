import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDashboardSettingsData: vi.fn(),
  getTestSessionsData: vi.fn(),
}));

vi.mock("@/lib/dashboard-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/dashboard-data")>()),
  getTestSessionsData: mocks.getTestSessionsData,
}));

vi.mock("@/lib/settings-data", () => ({
  getDashboardSettingsData: mocks.getDashboardSettingsData,
}));

import type { TestSessionsData } from "@/lib/dashboard-data";

import TestSessionsPage from "./page";

const testSessionsFixture: TestSessionsData = {
  filters: {
    page: 2,
    pageSize: 10,
    query: "release",
  },
  pagination: {
    from: 11,
    hasNext: false,
    hasPrevious: true,
    page: 2,
    pageSize: 10,
    to: 11,
    total: 11,
    totalPages: 2,
  },
  projectSlug: "default",
  sessions: [
    {
      createdAt: "2026-07-05T11:20:00.000Z",
      createdAtLabel: "Jul 05 14:20",
      duration: "2.4 s",
      href: "/test-sessions/session_1",
      id: "session_1",
      name: "Nightly regression",
      runState: "failed",
      source: "selfchecks test --project default",
      status: "failing",
      summary: {
        failed: 1,
        passed: 2,
        queued: 0,
        running: 0,
        total: 3,
      },
      targetUrl: "https://example.test",
      tone: "bad",
    },
  ],
};

describe("TestSessionsPage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders recorded test sessions and navigation links", async () => {
    mocks.getTestSessionsData.mockResolvedValue(testSessionsFixture);
    mocks.getDashboardSettingsData.mockResolvedValue({
      basic: {
        login: "admin@example.com",
      },
    });

    render(
      await TestSessionsPage({
        searchParams: Promise.resolve({
          page: "2",
          pageSize: "10",
          q: "release",
        }),
      }),
    );

    expect(mocks.getTestSessionsData).toHaveBeenCalledWith("default", {
      page: 2,
      pageSize: 10,
      query: "release",
    });
    expect(mocks.getDashboardSettingsData).toHaveBeenCalledWith("default");
    expect(screen.getByRole("heading", { name: "Test sessions" })).toBeTruthy();
    expect(screen.getAllByText("11-11 of 11 test sessions").length).toBe(2);
    expect(screen.getByText("Project default")).toBeTruthy();
    expect(
      (
        screen.getByRole("searchbox", {
          name: "Search test sessions",
        }) as HTMLInputElement
      ).value,
    ).toBe("release");
    expect(
      (screen.getByRole("combobox", { name: "Rows per page" }) as HTMLSelectElement)
        .value,
    ).toBe("10");
    expect(
      screen.getByRole("link", { name: /Nightly regression/ }).getAttribute("href"),
    ).toBe("/test-sessions/session_1");
    const targetUrlLink = screen.getByRole("link", {
      name: "https://example.test",
    });

    expect(targetUrlLink.getAttribute("href")).toBe("https://example.test");
    expect(targetUrlLink.getAttribute("target")).toBe("_blank");
    expect(screen.getByRole("columnheader", { name: "Total" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Passed" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Failed" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Running" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Queued" })).toBeTruthy();
    expect(
      screen.getAllByRole("columnheader").map((header) => header.textContent),
    ).toEqual([
      "Session",
      "Status",
      "Total",
      "Passed",
      "Failed",
      "Running",
      "Queued",
      "Duration",
      "URL",
    ]);
    expect(screen.queryByRole("columnheader", { name: "Source" })).toBeNull();
    expect(
      screen.queryByRole("link", { name: "Open test session session_1" }),
    ).toBeNull();

    const sessionRow = screen.getByRole("row", {
      name: /Nightly regression/,
    });

    expect(within(sessionRow).getByText("Jul 05 14:20")).toBeTruthy();
    expect(within(sessionRow).queryByText("session_1")).toBeNull();
    expect(within(sessionRow).getByRole("cell", { name: "3" })).toBeTruthy();
    expect(within(sessionRow).getByRole("cell", { name: "2" })).toBeTruthy();
    expect(within(sessionRow).getByRole("cell", { name: "1" })).toBeTruthy();
    expect(within(sessionRow).getAllByRole("cell", { name: "0" })).toHaveLength(2);
    expect(screen.getByText("2.4 s")).toBeTruthy();
    expect(screen.getByText("Page 2 of 2")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Previous" }).getAttribute("href")).toBe(
      "/test-sessions?q=release&pageSize=10",
    );
  });

  it("renders an empty state when no test sessions are recorded", async () => {
    mocks.getTestSessionsData.mockResolvedValue({
      filters: {
        page: 1,
        pageSize: 20,
        query: "",
      },
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
      projectSlug: "default",
      sessions: [],
    });
    mocks.getDashboardSettingsData.mockResolvedValue({
      basic: {
        login: "",
      },
    });

    render(await TestSessionsPage({}));

    expect(screen.getAllByText("0 test sessions").length).toBe(2);
    expect(
      screen.getByText("No test sessions match the current filters."),
    ).toBeTruthy();
  });
});
