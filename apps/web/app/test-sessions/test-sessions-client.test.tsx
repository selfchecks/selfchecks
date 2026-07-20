import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { TestSessionsData } from "@/lib/dashboard-data";

import { TestSessionsClient } from "./test-sessions-client";

const initialData: TestSessionsData = {
  filters: {
    page: 2,
    pageSize: 10,
    query: "release",
    sessionName: "Initial session",
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
  projectSlug: "default",
  sessions: [
    {
      createdAt: "2026-07-05T11:20:00.000Z",
      createdAtLabel: "Jul 05 14:20",
      duration: "2.4 s",
      href: "/test-sessions/session_1",
      id: "session_1",
      name: "Initial session",
      runState: "running",
      status: "degraded",
      summary: {
        failed: 0,
        passed: 1,
        queued: 0,
        regress: 0,
        running: 1,
        total: 2,
      },
      targetUrl: "https://example.test",
    },
  ],
};

describe("TestSessionsClient", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("refreshes test sessions from the live API endpoint", async () => {
    vi.useFakeTimers();

    const initialSession = initialData.sessions[0]!;
    const updatedData: TestSessionsData = {
      ...initialData,
      sessions: [
        {
          ...initialSession,
          id: "session_2",
          name: "Updated session",
          runState: "passed",
          status: "passing",
          summary: {
            failed: 0,
            passed: 2,
            queued: 0,
            regress: 0,
            running: 0,
            total: 2,
          },
        },
      ],
    };
    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue(updatedData),
      ok: true,
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<TestSessionsClient initialData={initialData} />);

    expect(screen.getByRole("link", { name: "Initial session" })).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/test-sessions?q=release&session=Initial+session&page=2&pageSize=10",
      {
        cache: "no-store",
      },
    );
    expect(screen.getByRole("link", { name: "Updated session" })).toBeTruthy();
  });
});
