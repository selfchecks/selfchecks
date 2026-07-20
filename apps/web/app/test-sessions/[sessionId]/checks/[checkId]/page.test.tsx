import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDashboardAccountLabel: vi.fn(() => "admin@example.com"),
  getTestSessionCheckData: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
}));

vi.mock("@/lib/dashboard-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/dashboard-data")>()),
  getTestSessionCheckData: mocks.getTestSessionCheckData,
}));

vi.mock("@/lib/settings-data", () => ({
  getDashboardAccountLabel: mocks.getDashboardAccountLabel,
}));

import type { TestSessionCheckDetailData } from "@/lib/dashboard-data";

import TestSessionCheckPage from "./page";

const checkDetailFixture: TestSessionCheckDetailData = {
  check: {
    id: "check_1",
    key: "homepage",
    name: "Homepage smoke",
    tags: ["browser", "smoke"],
    target: "checks/homepage.spec.ts",
    type: "browser",
  },
  groupName: "App",
  projectSlug: "default",
  runs: [
    {
      artifacts: [
        {
          downloadUrl: "/api/runs/run_1/artifacts/artifact_1?download=1",
          id: "artifact_1",
          mimeType: "application/zip",
          name: "trace.zip",
          size: "42 KB",
          type: "trace",
          viewUrl: "/runs/run_1/artifacts/artifact_1/trace",
        },
      ],
      attempt: 2,
      createdAt: "2026-07-05T11:20:00.000Z",
      duration: "1.2 s",
      durationMs: 1200,
      errorMessage: "locator not found",
      hasRetries: true,
      id: "run_1",
      maxAttempts: 2,
      occurredAt: "Jul 05 14:20",
      runHref: "/checks/check_1/runs/run_1",
      runner: "Local runner",
      runState: "failed",
      status: "failing",
      tone: "bad",
    },
  ],
  session: {
    createdAt: "2026-07-05T11:20:00.000Z",
    createdAtLabel: "Jul 05 14:20",
    duration: "1.2 s",
    href: "/test-sessions/session_1",
    id: "session_1",
    name: "Nightly regression",
    runState: "failed",
    status: "failing",
    summary: {
      failed: 1,
      passed: 0,
      queued: 0,
      regress: 0,
      running: 0,
      total: 1,
    },
    tone: "bad",
  },
};

describe("TestSessionCheckPage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders runs for a check inside a test session", async () => {
    mocks.getTestSessionCheckData.mockResolvedValue(checkDetailFixture);
    render(
      await TestSessionCheckPage({
        params: Promise.resolve({
          checkId: "check_1",
          sessionId: "session_1",
        }),
      }),
    );

    expect(mocks.getTestSessionCheckData).toHaveBeenCalledWith("session_1", "check_1");
    expect(
      screen.getByRole("link", { name: "Back to test session" }).getAttribute("href"),
    ).toBe("/test-sessions/session_1");
    expect(screen.getByRole("heading", { name: "Homepage smoke" })).toBeTruthy();
    expect(screen.getAllByText("browser").length).toBeGreaterThan(1);
    expect(screen.getByText("checks/homepage.spec.ts")).toBeTruthy();
    expect(
      screen
        .getAllByRole("link", { name: "Nightly regression" })
        .map((link) => link.getAttribute("href")),
    ).toContain("/test-sessions/session_1");
    expect(
      screen.getByRole("link", { name: /Jul 05 14:20/ }).getAttribute("href"),
    ).toBe("/checks/check_1/runs/run_1");
    expect(
      screen.getAllByRole("columnheader").map((header) => header.textContent),
    ).toEqual(["Run", "Status", "Attempt", "Duration", "Error"]);
    expect(screen.getByText("#2 of 2")).toBeTruthy();
    expect(screen.getByText("locator not found")).toBeTruthy();
    expect(screen.queryByRole("columnheader", { name: "Artifacts" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Open run run_1" })).toBeNull();
  });

  it("delegates to notFound when the check is missing from the session", async () => {
    mocks.getTestSessionCheckData.mockResolvedValue(undefined);

    await expect(
      TestSessionCheckPage({
        params: Promise.resolve({
          checkId: "missing_check",
          sessionId: "session_1",
        }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.notFound).toHaveBeenCalled();
  });
});
