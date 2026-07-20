import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDashboardAccountLabel: vi.fn(() => "admin@example.com"),
  getDashboardData: vi.fn(),
  getDashboardQueueData: vi.fn(),
  getDashboardSettingsData: vi.fn(),
}));

vi.mock("@/lib/dashboard-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/dashboard-data")>()),
  getDashboardData: mocks.getDashboardData,
  getDashboardQueueData: mocks.getDashboardQueueData,
}));

vi.mock("@/lib/settings-data", () => ({
  getDashboardAccountLabel: mocks.getDashboardAccountLabel,
  getDashboardSettingsData: mocks.getDashboardSettingsData,
}));

vi.mock("./dashboard-client", () => ({
  default: ({
    initialAccountLabel,
    initialActiveView,
    initialQueue,
    initialSettings,
  }: {
    initialAccountLabel?: string;
    initialActiveView: string;
    initialQueue: unknown[];
    initialSettings?: { basic: { login: string } };
  }) => (
    <div data-queue-count={initialQueue.length} data-testid="dashboard-client">
      {initialActiveView}:{initialSettings?.basic.login ?? initialAccountLabel}
    </div>
  ),
}));

import { DashboardData } from "./dashboard-page-data";

describe("DashboardData", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("loads only settings data for the settings view", async () => {
    mocks.getDashboardSettingsData.mockResolvedValue({
      basic: {
        login: "admin@example.com",
      },
    });

    render(await DashboardData({ activeView: "settings" }));

    expect(screen.getByTestId("dashboard-client").textContent).toBe(
      "settings:admin@example.com",
    );
    expect(mocks.getDashboardData).not.toHaveBeenCalled();
    expect(mocks.getDashboardQueueData).not.toHaveBeenCalled();
    expect(mocks.getDashboardSettingsData).toHaveBeenCalledWith("default");
  });

  it("loads only active runs for the queue view", async () => {
    mocks.getDashboardQueueData.mockResolvedValue({
      projectSlug: "default",
      queue: [{ id: "run_1" }],
      summary: {
        degraded: 0,
        failing: 0,
        passing: 0,
        queued: 1,
        running: 0,
      },
    });
    mocks.getDashboardSettingsData.mockResolvedValue({
      basic: {
        login: "admin@example.com",
      },
    });

    render(await DashboardData({ activeView: "queue" }));

    expect(screen.getByTestId("dashboard-client").dataset.queueCount).toBe("1");
    expect(mocks.getDashboardQueueData).toHaveBeenCalledWith("default");
    expect(mocks.getDashboardData).not.toHaveBeenCalled();
    expect(mocks.getDashboardSettingsData).not.toHaveBeenCalled();
  });
});
