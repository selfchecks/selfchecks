import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDashboardSettingsData: vi.fn(),
  getStatusLogsData: vi.fn(),
}));

vi.mock("@/lib/dashboard-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/dashboard-data")>()),
  getStatusLogsData: mocks.getStatusLogsData,
}));

vi.mock("@/lib/settings-data", () => ({
  getDashboardSettingsData: mocks.getDashboardSettingsData,
}));

import type { StatusLogsData } from "@/lib/dashboard-data";

import LogsPage from "./page";

const logsFixture: StatusLogsData = {
  logs: [
    {
      checkHref: "/checks/check_1",
      checkId: "check_1",
      checkKey: "bff-health",
      checkName: "BFF health",
      checkType: "api",
      createdAt: "2026-07-05T11:00:00.000Z",
      createdAtLabel: "Jul 05 14:00",
      fromStatus: "passing",
      groupName: "API / Bff",
      id: "run_failed",
      projectSlug: "account",
      runHref: "/checks/check_1/runs/run_failed",
      toStatus: "failing",
    },
  ],
  pagination: {
    from: 1,
    hasNext: true,
    hasPrevious: false,
    page: 1,
    pageSize: 1,
    to: 1,
    total: 2,
    totalPages: 2,
  },
  projectSlug: "all",
};

describe("LogsPage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders completed status transitions and navigation", async () => {
    mocks.getStatusLogsData.mockResolvedValue(logsFixture);
    mocks.getDashboardSettingsData.mockResolvedValue({
      basic: {
        login: "admin@example.com",
      },
    });

    render(
      await LogsPage({
        searchParams: Promise.resolve({
          page: "1",
          pageSize: "1",
        }),
      }),
    );

    expect(mocks.getStatusLogsData).toHaveBeenCalledWith("default", {
      page: 1,
      pageSize: 1,
    });
    expect(screen.getByRole("heading", { name: "Logs" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Logs" }).getAttribute("href")).toBe(
      "/logs",
    );
    expect(
      screen.getByRole("link", { name: "Logs" }).getAttribute("aria-current"),
    ).toBe("page");
    expect(screen.getByLabelText("Status changed from Passing to Failed")).toBeTruthy();
    expect(screen.queryByText("Running")).toBeNull();
    expect(screen.queryByText("Queued")).toBeNull();
    expect(screen.getByRole("link", { name: "BFF health" }).getAttribute("href")).toBe(
      "/checks/check_1",
    );
    expect(
      screen.getByRole("link", { name: "Open run run_failed" }).getAttribute("href"),
    ).toBe("/checks/check_1/runs/run_failed");
    expect(screen.getByText("1-1 of 2 status changes")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Next" }).getAttribute("href")).toBe(
      "/logs?page=2&pageSize=1",
    );
  });
});
