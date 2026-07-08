import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDashboardSettingsData: vi.fn(),
  getTestSessionData: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
}));

vi.mock("@/lib/dashboard-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/dashboard-data")>()),
  getTestSessionData: mocks.getTestSessionData,
}));

vi.mock("@/lib/settings-data", () => ({
  getDashboardSettingsData: mocks.getDashboardSettingsData,
}));

import type { TestSessionDetailData } from "@/lib/dashboard-data";

import TestSessionPage from "./page";

const sessionDetailFixture: TestSessionDetailData = {
  projectSlug: "default",
  session: {
    checks: [
      {
        checkHref: "/test-sessions/session_1/checks/check_1",
        checkId: "check_1",
        checkKey: "homepage",
        checkName: "Homepage smoke",
        checkType: "browser",
        duration: "1.2 s",
        groupName: "App",
        latestRunHref: "/checks/check_1/runs/run_1",
        runCount: 2,
        runState: "failed",
        status: "failing",
        target: "checks/homepage.spec.ts",
        tone: "bad",
      },
    ],
    createdAt: "2026-07-05T11:20:00.000Z",
    createdAtLabel: "Jul 05 14:20",
    duration: "1.2 s",
    href: "/test-sessions/session_1",
    id: "session_1",
    name: "Nightly regression",
    runState: "failed",
    source:
      "sendsay-ru/frontend/account | v3.192.41 | c05713df | pipeline https://gitlab.sndsy.ru/sendsay-ru/frontend/account/-/pipelines/6569 | job https://gitlab.sndsy.ru/sendsay-ru/frontend/account/-/jobs/123",
    status: "failing",
    summary: {
      failed: 1,
      passed: 0,
      queued: 0,
      running: 0,
      total: 1,
    },
    targetUrl: "https://example.test",
    tone: "bad",
  },
};

describe("TestSessionPage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders a test session with recorded checks", async () => {
    mocks.getTestSessionData.mockResolvedValue(sessionDetailFixture);
    mocks.getDashboardSettingsData.mockResolvedValue({
      basic: {
        login: "admin@example.com",
      },
    });

    render(
      await TestSessionPage({
        params: Promise.resolve({
          sessionId: "session_1",
        }),
      }),
    );

    expect(mocks.getTestSessionData).toHaveBeenCalledWith("session_1");
    expect(
      screen.getByRole("link", { name: "Back to test sessions" }).getAttribute("href"),
    ).toBe("/test-sessions");
    expect(screen.getByRole("heading", { name: "Nightly regression" })).toBeTruthy();
    expect(screen.getByText("Duration 1.2 s")).toBeTruthy();
    expect(screen.getByText("https://example.test")).toBeTruthy();
    expect(screen.getByText("Repository")).toBeTruthy();
    expect(screen.getByText("sendsay-ru/frontend/account")).toBeTruthy();
    expect(screen.getByText("Version")).toBeTruthy();
    expect(screen.getByText("v3.192.41")).toBeTruthy();
    expect(screen.getByText("Commit")).toBeTruthy();
    expect(screen.getByText("c05713df")).toBeTruthy();
    expect(
      screen
        .getByRole("link", {
          name: "https://gitlab.sndsy.ru/sendsay-ru/frontend/account/-/pipelines/6569",
        })
        .getAttribute("href"),
    ).toBe("https://gitlab.sndsy.ru/sendsay-ru/frontend/account/-/pipelines/6569");
    expect(
      screen
        .getByRole("link", {
          name: "https://gitlab.sndsy.ru/sendsay-ru/frontend/account/-/jobs/123",
        })
        .getAttribute("href"),
    ).toBe("https://gitlab.sndsy.ru/sendsay-ru/frontend/account/-/jobs/123");
    expect(
      screen
        .getByRole("link", { name: "Open test Homepage smoke" })
        .getAttribute("href"),
    ).toBe("/test-sessions/session_1/checks/check_1");
    expect(
      screen
        .getByRole("link", { name: "Open latest run for Homepage smoke" })
        .getAttribute("href"),
    ).toBe("/checks/check_1/runs/run_1");
  });

  it("delegates to notFound when the session is missing", async () => {
    mocks.getTestSessionData.mockResolvedValue(undefined);

    await expect(
      TestSessionPage({
        params: Promise.resolve({
          sessionId: "missing",
        }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.notFound).toHaveBeenCalled();
  });
});
