import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDashboardAccountLabel: vi.fn(() => "admin@example.com"),
  getDashboardActivityData: vi.fn(),
  getDashboardData: vi.fn(),
  getDashboardQueueData: vi.fn(),
  getDashboardSettingsData: vi.fn(),
}));

vi.mock("@/lib/dashboard-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/dashboard-data")>()),
  getDashboardActivityData: mocks.getDashboardActivityData,
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
    initialServiceActivity,
    initialSettings,
  }: {
    initialAccountLabel?: string;
    initialActiveView: string;
    initialQueue: unknown[];
    initialServiceActivity?: { queued: number; running: number };
    initialSettings?: { basic: { login: string } };
  }) => (
    <div
      data-queue-count={initialQueue.length}
      data-service-queued={initialServiceActivity?.queued}
      data-service-running={initialServiceActivity?.running}
      data-testid="dashboard-client"
    >
      {initialActiveView}:{initialSettings?.basic.login ?? initialAccountLabel}
    </div>
  ),
}));

import { DashboardData } from "./dashboard-page-data";

describe("DashboardData", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("loads settings and service activity for the settings view", async () => {
    mocks.getDashboardActivityData.mockResolvedValue({
      projectSlug: "default",
      queued: 8,
      revision: "terminal:",
      running: 1,
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
    expect(screen.getByTestId("dashboard-client").dataset.serviceQueued).toBe("8");
    expect(screen.getByTestId("dashboard-client").dataset.serviceRunning).toBe("1");
    expect(mocks.getDashboardData).not.toHaveBeenCalled();
    expect(mocks.getDashboardQueueData).not.toHaveBeenCalled();
    expect(mocks.getDashboardActivityData).toHaveBeenCalledWith("default");
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
    expect(screen.getByTestId("dashboard-client").dataset.serviceQueued).toBe("1");
    expect(screen.getByTestId("dashboard-client").dataset.serviceRunning).toBe("0");
    expect(mocks.getDashboardQueueData).toHaveBeenCalledWith("default");
    expect(mocks.getDashboardActivityData).not.toHaveBeenCalled();
    expect(mocks.getDashboardData).not.toHaveBeenCalled();
    expect(mocks.getDashboardSettingsData).not.toHaveBeenCalled();
  });
});
