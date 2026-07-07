import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDashboardData: vi.fn(),
}));

vi.mock("@/lib/dashboard-data", () => ({
  getDashboardData: mocks.getDashboardData,
}));

import { GET } from "./route";

describe("dashboard route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns a no-store dashboard snapshot for the requested project", async () => {
    mocks.getDashboardData.mockResolvedValue({
      groups: [],
      projectSlug: "account",
      summary: {
        degraded: 0,
        failing: 0,
        passing: 0,
        queued: 0,
        running: 0,
      },
    });

    const response = await GET(
      new Request("http://localhost/api/dashboard?project=account"),
    );

    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      groups: [],
      projectSlug: "account",
      summary: {
        degraded: 0,
        failing: 0,
        passing: 0,
        queued: 0,
        running: 0,
      },
    });
    expect(mocks.getDashboardData).toHaveBeenCalledWith("account", {
      onError: "throw",
    });
  });

  it("defaults to the local project", async () => {
    mocks.getDashboardData.mockResolvedValue({
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

    await GET(new Request("http://localhost/api/dashboard"));

    expect(mocks.getDashboardData).toHaveBeenCalledWith("default", {
      onError: "throw",
    });
  });

  it("returns a service error when dashboard data cannot be loaded", async () => {
    mocks.getDashboardData.mockRejectedValue(new Error("database unavailable"));

    const response = await GET(new Request("http://localhost/api/dashboard"));

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      error: "Unable to load dashboard data.",
    });
  });
});
