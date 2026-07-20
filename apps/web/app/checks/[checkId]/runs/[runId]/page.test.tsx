import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDashboardAccountLabel: vi.fn(() => "admin@example.com"),
  getRunDetailData: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
}));

vi.mock("@/lib/dashboard-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/dashboard-data")>()),
  getRunDetailData: mocks.getRunDetailData,
}));

vi.mock("@/lib/settings-data", () => ({
  getDashboardAccountLabel: mocks.getDashboardAccountLabel,
}));

vi.mock("./run-detail-view", () => ({
  RunDetailView: ({
    accountLabel,
    detail,
  }: {
    accountLabel: string;
    detail: { run: { id: string } };
  }) => (
    <div data-testid="run-detail-view">
      {accountLabel}:{detail.run.id}
    </div>
  ),
}));

import RunDetailPage from "./page";

describe("RunDetailPage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("loads run details and account settings for the view", async () => {
    mocks.getRunDetailData.mockResolvedValue({
      projectSlug: "default",
      run: {
        id: "run_1",
      },
    });
    render(
      await RunDetailPage({
        params: Promise.resolve({
          checkId: "check_1",
          runId: "run_1",
        }),
      }),
    );

    expect(screen.getByTestId("run-detail-view").textContent).toBe(
      "admin@example.com:run_1",
    );
    expect(mocks.getRunDetailData).toHaveBeenCalledWith("check_1", "run_1");
    expect(mocks.getDashboardAccountLabel).toHaveBeenCalled();
  });

  it("delegates to notFound when the run is missing", async () => {
    mocks.getRunDetailData.mockResolvedValue(undefined);

    await expect(
      RunDetailPage({
        params: Promise.resolve({
          checkId: "check_1",
          runId: "missing",
        }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.notFound).toHaveBeenCalled();
  });
});
