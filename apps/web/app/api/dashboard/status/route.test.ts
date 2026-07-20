import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDashboardAccountLabel: vi.fn(),
  getDashboardActivityData: vi.fn(),
}));

vi.mock("@/lib/dashboard-data", () => ({
  getDashboardActivityData: mocks.getDashboardActivityData,
}));

vi.mock("@/lib/settings-data", () => ({
  getDashboardAccountLabel: mocks.getDashboardAccountLabel,
}));

import { GET } from "./route";

describe("dashboard status route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns live sidebar status for the requested project", async () => {
    mocks.getDashboardAccountLabel.mockReturnValue("admin@example.com");
    mocks.getDashboardActivityData.mockResolvedValue({
      projectSlug: "account",
      queued: 2,
      revision: "run_1:QUEUED|run_2:RUNNING",
      running: 3,
    });

    const response = await GET(
      new Request("http://localhost/api/dashboard/status?project=account"),
    );

    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      accountLabel: "admin@example.com",
      projectSlug: "account",
      queued: 2,
      revision: "run_1:QUEUED|run_2:RUNNING",
      running: 3,
    });
    expect(mocks.getDashboardActivityData).toHaveBeenCalledWith("account");
  });

  it("returns a service error when status cannot be loaded", async () => {
    mocks.getDashboardActivityData.mockRejectedValue(new Error("database unavailable"));

    const response = await GET(new Request("http://localhost/api/dashboard/status"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Unable to load sidebar status.",
    });
  });
});
