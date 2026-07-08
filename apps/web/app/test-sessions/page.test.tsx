import { render, screen } from "@testing-library/react";
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

    render(await TestSessionsPage());

    expect(mocks.getTestSessionsData).toHaveBeenCalledWith("default");
    expect(mocks.getDashboardSettingsData).toHaveBeenCalledWith("default");
    expect(screen.getByRole("heading", { name: "Test sessions" })).toBeTruthy();
    expect(screen.getByText("1 recorded test session")).toBeTruthy();
    expect(screen.getByText("Project default")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /Nightly regression/ }).getAttribute("href"),
    ).toBe("/test-sessions/session_1");
    const targetUrlLink = screen.getByRole("link", {
      name: "https://example.test",
    });

    expect(targetUrlLink.getAttribute("href")).toBe("https://example.test");
    expect(targetUrlLink.getAttribute("target")).toBe("_blank");
    expect(screen.getByText("2.4 s")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Open test session session_1" })
        .getAttribute("href"),
    ).toBe("/test-sessions/session_1");
  });

  it("renders an empty state when no test sessions are recorded", async () => {
    mocks.getTestSessionsData.mockResolvedValue({
      projectSlug: "default",
      sessions: [],
    });
    mocks.getDashboardSettingsData.mockResolvedValue({
      basic: {
        login: "",
      },
    });

    render(await TestSessionsPage());

    expect(screen.getByText("0 recorded test sessions")).toBeTruthy();
    expect(screen.getByText("No test sessions recorded.")).toBeTruthy();
  });
});
