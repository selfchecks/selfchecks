import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCheckDetailData: vi.fn(),
}));

vi.mock("@/lib/dashboard-data", () => ({
  getCheckDetailData: mocks.getCheckDetailData,
}));

import { GET } from "./route";

function createContext(checkId = "check_1") {
  return {
    params: Promise.resolve({
      checkId,
    }),
  };
}

describe("check detail route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns a no-store check detail snapshot", async () => {
    const detail = {
      check: {
        id: "check_1",
        name: "Homepage",
        runs: [],
      },
      groupName: "App / Smoke",
      projectSlug: "default",
      updated: "1 minute ago",
    };

    mocks.getCheckDetailData.mockResolvedValue(detail);

    const response = await GET(
      new Request("http://localhost/api/checks/check_1/detail"),
      createContext(),
    );

    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual(detail);
    expect(mocks.getCheckDetailData).toHaveBeenCalledWith("check_1");
  });

  it("returns not found for missing checks", async () => {
    mocks.getCheckDetailData.mockResolvedValue(undefined);

    const response = await GET(
      new Request("http://localhost/api/checks/missing/detail"),
      createContext("missing"),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Check was not found.",
    });
  });
});
