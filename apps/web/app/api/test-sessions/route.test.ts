import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getTestSessionsData: vi.fn(),
}));

vi.mock("@/lib/dashboard-data", () => ({
  getTestSessionsData: mocks.getTestSessionsData,
}));

import { GET } from "./route";

describe("test sessions route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns a no-store test session snapshot for the requested filters", async () => {
    const data = {
      filters: {
        page: 2,
        pageSize: 10,
        query: "release",
        sessionName: "Release v1.2.3",
      },
      pagination: {
        from: 11,
        hasNext: false,
        hasPrevious: true,
        page: 2,
        pageSize: 10,
        to: 11,
        total: 11,
        totalPages: 2,
      },
      projectSlug: "account",
      sessions: [],
    };

    mocks.getTestSessionsData.mockResolvedValue(data);

    const response = await GET(
      new Request(
        "http://localhost/api/test-sessions?project=account&page=2&pageSize=10&q=release&session=Release%20v1.2.3",
      ),
    );

    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual(data);
    expect(mocks.getTestSessionsData).toHaveBeenCalledWith("account", {
      page: 2,
      pageSize: 10,
      query: "release",
      sessionName: "Release v1.2.3",
    });
  });

  it("defaults to the local project", async () => {
    mocks.getTestSessionsData.mockResolvedValue({
      filters: {
        page: 1,
        pageSize: 20,
        query: "",
        sessionName: "",
      },
      pagination: {
        from: 0,
        hasNext: false,
        hasPrevious: false,
        page: 1,
        pageSize: 20,
        to: 0,
        total: 0,
        totalPages: 1,
      },
      projectSlug: "default",
      sessions: [],
    });

    await GET(new Request("http://localhost/api/test-sessions"));

    expect(mocks.getTestSessionsData).toHaveBeenCalledWith("default", {
      page: undefined,
      pageSize: undefined,
      query: undefined,
      sessionName: undefined,
    });
  });

  it("returns a service error when test sessions cannot be loaded", async () => {
    mocks.getTestSessionsData.mockRejectedValue(new Error("database unavailable"));

    const response = await GET(new Request("http://localhost/api/test-sessions"));

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      error: "Unable to load test sessions.",
    });
  });
});
