import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDashboardAccountLabel: vi.fn(() => "admin@example.com"),
  getServerStorageUsage: vi.fn(),
  getUsageData: vi.fn(),
}));

vi.mock("@/lib/settings-data", () => ({
  getDashboardAccountLabel: mocks.getDashboardAccountLabel,
}));

vi.mock("@/lib/usage-data", () => ({
  getUsageData: mocks.getUsageData,
}));

vi.mock("@/lib/server-storage", () => ({
  getServerStorageUsage: mocks.getServerStorageUsage,
}));

import UsagePage from "./page";

describe("UsagePage", () => {
  afterEach(() => vi.resetAllMocks());

  it("shows daily test types and the source split", async () => {
    const gibibyte = 1_024 ** 3;
    mocks.getServerStorageUsage.mockResolvedValue({
      artifactsBytes: 10 * gibibyte,
      freeBytes: 40 * gibibyte,
      otherBytes: 50 * gibibyte,
      totalBytes: 100 * gibibyte,
    });
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
    const storage = screen.getByRole("region", { name: "Server storage" });
    expect(
      within(storage).getByRole("img", {
        name: "Server storage: 40 GB free, 10 GB test artifacts, 50 GB other used.",
      }),
    ).toBeTruthy();
    expect(within(storage).getByText("Free space")).toBeTruthy();
    expect(within(storage).getByText("Test artifacts")).toBeTruthy();
    expect(within(storage).getByText("Other used")).toBeTruthy();
    expect(within(storage).getByText("Total capacity")).toBeTruthy();
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
    const storageHeading = screen.getByRole("heading", {
      name: "Server storage",
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
    expect(
      reliabilityHeading.compareDocumentPosition(storageHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
