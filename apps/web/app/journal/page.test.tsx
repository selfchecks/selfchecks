import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDashboardSettingsData: vi.fn(),
  getJournalData: vi.fn(),
}));

vi.mock("@/lib/dashboard-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/dashboard-data")>()),
  getJournalData: mocks.getJournalData,
}));

vi.mock("@/lib/settings-data", () => ({
  getDashboardSettingsData: mocks.getDashboardSettingsData,
}));

import type { JournalData } from "@/lib/dashboard-data";

import JournalPage from "./page";

const journalFixture: JournalData = {
  filters: {
    page: 2,
    pageSize: 10,
    query: "health",
    range: "7d",
    status: "passed",
    type: "api",
  },
  pagination: {
    from: 11,
    hasNext: false,
    hasPrevious: true,
    page: 2,
    pageSize: 10,
    to: 12,
    total: 12,
    totalPages: 2,
  },
  projectSlug: "default",
  runs: [
    {
      artifacts: [
        {
          downloadUrl: "/api/runs/run_1/artifacts/artifact_1?download=1",
          id: "artifact_1",
          mimeType: "application/zip",
          name: "trace.zip",
          size: "1.0 KB",
          type: "trace",
          viewUrl: "/runs/run_1/artifacts/artifact_1/trace",
        },
      ],
      checkHref: "/checks/check_1",
      checkId: "check_1",
      checkKey: "bff-health",
      checkName: "bff-health",
      checkTags: ["api", "bff"],
      checkType: "api",
      createdAt: "2026-07-05T11:20:00.000Z",
      createdAtLabel: "Jul 05 14:20 (UTC+3)",
      duration: "810 ms",
      durationMs: 810,
      groupName: "API / Bff",
      hasRetries: false,
      id: "run_1",
      occurredAt: "Jul 05 14:20 (UTC+3)",
      runHref: "/checks/check_1/runs/run_1",
      runner: "Local runner",
      runState: "passed",
      schedule: "15 min",
      status: "passing",
    },
  ],
};

describe("JournalPage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders filters, paginated runs and navigation links", async () => {
    mocks.getJournalData.mockResolvedValue(journalFixture);
    mocks.getDashboardSettingsData.mockResolvedValue({
      basic: {
        login: "nikolaev@iprojects.ru",
      },
    });

    render(
      await JournalPage({
        searchParams: Promise.resolve({
          page: "2",
          pageSize: "10",
          q: "health",
          status: "passed",
          type: "api",
        }),
      }),
    );

    expect(mocks.getJournalData).toHaveBeenCalledWith("default", {
      page: 2,
      pageSize: 10,
      query: "health",
      range: undefined,
      status: "passed",
      type: "api",
    });
    expect(screen.getByRole("heading", { name: "Journal" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Journal" }).getAttribute("href")).toBe(
      "/journal",
    );
    expect(screen.queryByRole("link", { name: "Checks" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Apply" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Reset" })).toBeNull();
    expect(
      (screen.getByRole("searchbox", { name: "Search runs" }) as HTMLInputElement)
        .value,
    ).toBe("health");
    expect(
      (screen.getByRole("combobox", { name: "Status" }) as HTMLSelectElement).value,
    ).toBe("passed");
    expect(
      (screen.getByRole("combobox", { name: "Check type" }) as HTMLSelectElement).value,
    ).toBe("api");
    expect(screen.getAllByText("11-12 of 12 runs").length).toBe(2);
    expect(screen.getByRole("link", { name: "bff-health" }).getAttribute("href")).toBe(
      "/checks/check_1",
    );
    expect(
      screen.getByRole("link", { name: /Jul 05 14:20/ }).getAttribute("href"),
    ).toBe("/checks/check_1/runs/run_1");
    expect(
      screen.getByRole("link", { name: "Open run run_1" }).getAttribute("href"),
    ).toBe("/checks/check_1/runs/run_1");
    expect(screen.getByText("Page 2 of 2")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Previous" }).getAttribute("href")).toBe(
      "/journal?q=health&status=passed&type=api&pageSize=10",
    );
  });
});
