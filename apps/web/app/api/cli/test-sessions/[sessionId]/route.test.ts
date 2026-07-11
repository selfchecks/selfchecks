import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  testSessionFindUnique: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    testSession: {
      findUnique: mocks.testSessionFindUnique,
    },
  },
}));

import { GET } from "./route";

function createRequest(token = "api-token") {
  return new Request("http://localhost/api/cli/test-sessions/session_1", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

describe("CLI test session status route", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("returns a terminal session summary", async () => {
    vi.stubEnv("SELFCHECKS_API_TOKEN", "api-token");
    mocks.testSessionFindUnique.mockResolvedValue({
      createdAt: new Date("2026-07-10T10:00:00.000Z"),
      id: "session_1",
      runs: [
        {
          attempt: 1,
          checkSnapshotKey: "homepage",
          checkSnapshotName: "Homepage",
          createdAt: new Date("2026-07-10T10:00:01.000Z"),
          durationMs: 2000,
          errorMessage: null,
          finishedAt: new Date("2026-07-10T10:00:03.000Z"),
          id: "run_1",
          status: "PASSED",
        },
      ],
      status: "RUNNING",
    });

    const response = await GET(createRequest(), {
      params: Promise.resolve({ sessionId: "session_1" }),
    });

    await expect(response.json()).resolves.toEqual({
      sessionId: "session_1",
      status: "passed",
      summary: {
        durationMs: 3000,
        failed: 0,
        passed: 1,
        results: [
          {
            checkKey: "homepage",
            checkName: "Homepage",
            durationMs: 2000,
            runId: "run_1",
            status: "passed",
          },
        ],
        sessionId: "session_1",
        skipped: 0,
        total: 1,
      },
    });
  });
});
