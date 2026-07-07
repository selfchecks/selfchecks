import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDashboardData: vi.fn(),
  getDashboardSettingsData: vi.fn(),
}));

vi.mock("@/lib/dashboard-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/dashboard-data")>()),
  getDashboardData: mocks.getDashboardData,
}));

vi.mock("@/lib/settings-data", () => ({
  getDashboardSettingsData: mocks.getDashboardSettingsData,
}));

vi.mock("./dashboard-client", () => ({
  default: ({
    initialActiveView,
    initialSettings,
  }: {
    initialActiveView: string;
    initialSettings: { basic: { login: string } };
  }) => (
    <div data-testid="dashboard-client">
      {initialActiveView}:{initialSettings.basic.login}
    </div>
  ),
}));

import { DashboardData } from "./dashboard-page-data";

describe("DashboardData", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("loads dashboard data and opens the requested settings view", async () => {
    mocks.getDashboardData.mockResolvedValue({
      firewatch: {
        lookbackDays: 7,
        rows: [],
      },
      groups: [],
      projectSlug: "default",
      summary: {
        degraded: 0,
        failing: 0,
        passing: 0,
        queued: 0,
        running: 0,
      },
    });
    mocks.getDashboardSettingsData.mockResolvedValue({
      basic: {
        login: "admin@example.com",
      },
    });

    render(await DashboardData({ activeView: "settings" }));

    expect(screen.getByTestId("dashboard-client").textContent).toBe(
      "settings:admin@example.com",
    );
    expect(mocks.getDashboardData).toHaveBeenCalledWith("default");
    expect(mocks.getDashboardSettingsData).toHaveBeenCalledWith("default");
  });
});
