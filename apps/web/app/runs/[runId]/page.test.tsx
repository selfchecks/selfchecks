import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRunDetailData: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/lib/dashboard-data", () => ({ getRunDetailData: mocks.getRunDetailData }));
vi.mock("@/lib/settings-data", () => ({
  getDashboardAccountLabel: () => "admin@example.com",
}));
vi.mock("@/app/checks/[checkId]/runs/[runId]/run-detail-view", () => ({
  RunDetailView: ({ detail }: { detail: { run: { id: string } } }) => (
    <div>{detail.run.id}</div>
  ),
}));

import RunPage from "./page";

describe("RunPage", () => {
  afterEach(() => vi.clearAllMocks());

  it("opens a run without requiring a check id or key in the URL", async () => {
    mocks.getRunDetailData.mockResolvedValue({ run: { id: "failed_run" } });
    render(await RunPage({ params: Promise.resolve({ runId: "failed_run" }) }));

    expect(screen.getByText("failed_run")).toBeTruthy();
    expect(mocks.getRunDetailData).toHaveBeenCalledWith(undefined, "failed_run");
  });

  it("returns 404 for a run that does not exist", async () => {
    mocks.getRunDetailData.mockResolvedValue(undefined);

    await expect(
      RunPage({ params: Promise.resolve({ runId: "missing" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
