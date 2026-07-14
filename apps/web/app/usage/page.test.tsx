import { act, fireEvent, render, screen, within } from "@testing-library/react";
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

    await act(async () => {
      render(await UsagePage());
      await Promise.resolve();
    });

    expect(screen.getByRole("heading", { name: "Usage" })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Usage" }).getAttribute("aria-current"),
    ).toBe("page");
    expect(
      await screen.findByRole("img", {
        name: "Completed API and browser tests by day",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("img", { name: "Scheduled checks and test sessions by day" }),
    ).toBeTruthy();
    expect(screen.getByText("Scheduled")).toBeTruthy();
    expect(screen.getAllByText("Test sessions")).toHaveLength(2);
    expect(screen.getByText("75%")).toBeTruthy();
    expect(screen.getByText("25%")).toBeTruthy();
    expect(screen.getByRole("img", { name: "75% success rate" })).toBeTruthy();
    expect(
      screen.getByRole("img", { name: "Passed and failed tests by day" }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Checkout" }).getAttribute("href")).toBe(
      "/checks/check_1",
    );

    const dayTargets = screen.getAllByRole("button", {
      name: "Show details for Jul 11",
    });
    expect(dayTargets).toHaveLength(4);

    fireEvent.mouseEnter(dayTargets[0]!);
    let popover = screen.getByTestId("chart-popover");
    expect(within(popover).getByText("2026-07-11")).toBeTruthy();
    expect(within(popover).getByText("API")).toBeTruthy();
    expect(within(popover).getByText("Browser")).toBeTruthy();
    expect(within(popover).getAllByRole("listitem")).toHaveLength(2);
    expect(within(popover).queryByText("Passed")).toBeNull();
    expect(within(popover).queryByText("Scheduled")).toBeNull();
    fireEvent.mouseLeave(dayTargets[0]!);

    fireEvent.mouseEnter(dayTargets[1]!);
    popover = screen.getByTestId("chart-popover");
    expect(within(popover).getByText("Scheduled")).toBeTruthy();
    expect(within(popover).getByText("Test sessions")).toBeTruthy();
    expect(within(popover).queryByText("API")).toBeNull();
    fireEvent.mouseLeave(dayTargets[1]!);

    fireEvent.mouseEnter(dayTargets[2]!);
    popover = screen.getByTestId("chart-popover");
    expect(within(popover).getByText("Passed")).toBeTruthy();
    expect(within(popover).getByText("Failed")).toBeTruthy();
    expect(within(popover).queryByText("Browser")).toBeNull();

    const sourcesHeading = screen.getByRole("heading", {
      name: "Where tests come from",
    });
    const reliabilityHeading = screen.getByRole("heading", {
      name: "Test reliability",
    });
    const resultsHeading = screen.getByRole("heading", {
      name: "Results by day",
    });
    expect(
      sourcesHeading.compareDocumentPosition(reliabilityHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      resultsHeading.compareDocumentPosition(reliabilityHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
