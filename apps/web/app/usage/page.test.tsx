import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDashboardSettingsData: vi.fn(),
  getUsageData: vi.fn(),
}));

vi.mock("@/lib/settings-data", () => ({
  getDashboardSettingsData: mocks.getDashboardSettingsData,
}));

vi.mock("@/lib/usage-data", () => ({
  getUsageData: mocks.getUsageData,
}));

import UsagePage from "./page";

describe("UsagePage", () => {
  afterEach(() => vi.resetAllMocks());

  it("shows daily test types and the source split", async () => {
    mocks.getUsageData.mockResolvedValue({
      days: [
        {
          api: 3,
          browser: 1,
          date: "2026-07-11",
          failed: 1,
          label: "Jul 11",
          passed: 3,
          scheduled: 3,
          testSessions: 1,
          total: 4,
        },
      ],
      projectSlug: "default",
      rangeDays: 30,
      totals: {
        api: 3,
        browser: 1,
        failed: 1,
        passed: 3,
        scheduled: 3,
        successRate: 75,
        testSessions: 1,
        total: 4,
      },
      unstableTests: [
        {
          checkId: "check_1",
          failed: 1,
          failureRate: 25,
          name: "Checkout",
          passed: 3,
          total: 4,
          type: "browser",
        },
      ],
    });
    mocks.getDashboardSettingsData.mockResolvedValue({
      basic: { login: "admin@example.com" },
    });

    render(await UsagePage());

    expect(screen.getByRole("heading", { name: "Usage" })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Usage" }).getAttribute("aria-current"),
    ).toBe("page");
    expect(
      screen.getByRole("img", { name: "Completed API and browser tests by day" }),
    ).toBeTruthy();
    expect(screen.getByText("Scheduled checks")).toBeTruthy();
    expect(screen.getAllByText("Test sessions")).toHaveLength(2);
    expect(screen.getAllByText("75%")).toHaveLength(2);
    expect(screen.getAllByText("25%")).toHaveLength(2);
    expect(screen.getByRole("img", { name: "75% success rate" })).toBeTruthy();
    expect(
      screen.getByRole("img", { name: "Passed and failed tests by day" }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Checkout" }).getAttribute("href")).toBe(
      "/checks/check_1",
    );

    fireEvent.mouseEnter(
      screen.getAllByRole("button", { name: "Show details for Jul 11" })[0]!,
    );
    const popover = screen.getByTestId("chart-popover");
    expect(within(popover).getByText("2026-07-11")).toBeTruthy();
    expect(within(popover).getByText("Scheduled")).toBeTruthy();
    expect(within(popover).getByText("Sessions")).toBeTruthy();
  });
});
