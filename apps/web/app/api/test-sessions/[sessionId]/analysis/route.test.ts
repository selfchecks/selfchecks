import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  analyzeFailedTestSession: vi.fn(),
  testSessionFindFirst: vi.fn(),
  testSessionUpdate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    testSession: {
      findFirst: mocks.testSessionFindFirst,
      update: mocks.testSessionUpdate,
    },
  },
}));

vi.mock("@selfchecks/cli/ai-analysis", () => ({
  analyzeFailedTestSession: mocks.analyzeFailedTestSession,
}));

import { POST } from "./route";

describe("test session AI analysis route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("analyzes only the latest failed attempt of every test", async () => {
    mocks.testSessionFindFirst.mockResolvedValue({
      aiAnalysis: null,
      id: "session_1",
      name: "Release release/3.192.70",
      project: { slug: "account" },
      ref: "release/3.192.70",
      runs: [
        createRun({
          checkKey: "checkout",
          checkName: "Checkout",
          createdAt: "2026-08-19T08:03:00.000Z",
          errorMessage: "Timeout 30000ms exceeded",
          id: "run_checkout_2",
          result: { aiAnalysis: { content: "Checkout button did not appear." } },
          status: "TIMED_OUT",
        }),
        createRun({
          checkKey: "checkout",
          checkName: "Checkout",
          createdAt: "2026-08-19T08:02:00.000Z",
          errorMessage: "Screenshot comparison failed",
          id: "run_checkout_1",
          status: "FAILED",
        }),
        createRun({
          checkKey: "header",
          checkName: "Header visual",
          errorMessage: "toHaveScreenshot: 124 pixels differ",
          id: "run_header",
          status: "FAILED",
        }),
        createRun({
          checkKey: "profile",
          checkName: "Profile",
          errorMessage: "strict mode violation: locator resolved to 2 elements",
          id: "run_profile",
          status: "FAILED",
        }),
        createRun({
          checkKey: "health",
          checkName: "Health",
          errorMessage: null,
          id: "run_health",
          status: "PASSED",
        }),
      ],
      status: "FAILED",
      targetUrl: "https://pr-410.app.example.test",
    });
    mocks.analyzeFailedTestSession.mockResolvedValue({
      content: "Главная причина — таймаут checkout.",
      model: "gpt-5-mini",
      responseLanguage: "Russian",
      status: "completed",
    });

    const response = await POST(
      new Request("http://localhost/api/test-sessions/session_1/analysis", {
        method: "POST",
      }),
      createContext(),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.failedCount).toBe(3);
    expect(
      Object.fromEntries(
        payload.categories.map((category: { count: number; key: string }) => [
          category.key,
          category.count,
        ]),
      ),
    ).toEqual({
      element: 0,
      locator: 1,
      other: 0,
      screenshot: 1,
      timeout: 1,
    });
    expect(mocks.analyzeFailedTestSession).toHaveBeenCalledWith(
      expect.objectContaining({
        failures: expect.arrayContaining([
          expect.objectContaining({
            checkKey: "checkout",
            existingAnalysis: "Checkout button did not appear.",
            status: "TIMED_OUT",
          }),
        ]),
        ref: "release/3.192.70",
        targetUrl: "https://pr-410.app.example.test",
      }),
    );
    expect(
      mocks.analyzeFailedTestSession.mock.calls[0]?.[0].failures.some(
        (failure: { checkKey: string; status: string }) =>
          failure.checkKey === "checkout" && failure.status === "FAILED",
      ),
    ).toBe(false);
    expect(mocks.testSessionUpdate).toHaveBeenCalledWith({
      data: {
        aiAnalysis: expect.objectContaining({
          failedCount: 3,
          failedRunIds: ["run_checkout_2", "run_header", "run_profile"],
        }),
      },
      where: {
        id: "session_1",
      },
    });
  });

  it("reuses a stored analysis for the same final failed runs", async () => {
    mocks.testSessionFindFirst.mockResolvedValue({
      aiAnalysis: {
        analysis: {
          content: "Сохранённая сводка.",
          status: "completed",
        },
        categories: [],
        failedCount: 1,
        failedRunIds: ["run_1"],
      },
      id: "session_1",
      name: "Release",
      project: { slug: "account" },
      ref: "stable",
      runs: [createRun()],
      status: "FAILED",
      targetUrl: "https://app.example.test",
    });

    const response = await POST(
      new Request("http://localhost/api/test-sessions/session_1/analysis", {
        method: "POST",
      }),
      createContext(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      analysis: {
        content: "Сохранённая сводка.",
        status: "completed",
      },
      categories: [],
      failedCount: 1,
    });
    expect(mocks.analyzeFailedTestSession).not.toHaveBeenCalled();
    expect(mocks.testSessionUpdate).not.toHaveBeenCalled();
  });

  it("waits until every test in the session is finished", async () => {
    mocks.testSessionFindFirst.mockResolvedValue({
      aiAnalysis: null,
      id: "session_1",
      name: "Release",
      project: { slug: "account" },
      ref: "stable",
      runs: [createRun({ status: "RUNNING" })],
      status: "RUNNING",
      targetUrl: "https://app.example.test",
    });

    const response = await POST(
      new Request("http://localhost/api/test-sessions/session_1/analysis", {
        method: "POST",
      }),
      createContext(),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "AI analysis is available after every test in the session finishes.",
    });
    expect(mocks.analyzeFailedTestSession).not.toHaveBeenCalled();
  });
});

function createRun({
  checkKey = "checkout",
  checkName = "Checkout",
  createdAt = "2026-08-19T08:01:00.000Z",
  errorMessage = "Assertion failed",
  id = "run_1",
  result = {},
  status = "FAILED",
}: {
  checkKey?: string;
  checkName?: string;
  createdAt?: string;
  errorMessage?: string | null;
  id?: string;
  result?: unknown;
  status?: string;
} = {}) {
  return {
    attempt: 1,
    check: {
      id: `check_${checkKey}`,
      key: checkKey,
      name: checkName,
      project: { slug: "account" },
    },
    checkSnapshotKey: checkKey,
    checkSnapshotName: checkName,
    checkSnapshotProjectSlug: "account",
    createdAt: new Date(createdAt),
    errorMessage,
    id,
    result,
    status,
  };
}

function createContext() {
  return {
    params: Promise.resolve({ sessionId: "session_1" }),
  };
}
