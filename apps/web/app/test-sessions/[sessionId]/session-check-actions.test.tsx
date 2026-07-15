import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { TestSessionCheckRow } from "@/lib/dashboard-data";

import { SessionCheckActions } from "./session-check-actions";

const failedCheck: TestSessionCheckRow = {
  aiAnalysis: {
    content: "The sign-in request returned 500.",
    model: "gpt-test",
    responseLanguage: "English",
    status: "completed",
  },
  checkHref: "/test-sessions/session_1/checks/signin",
  checkId: "signin",
  checkKey: "signin",
  checkName: "Sign in",
  checkType: "browser",
  duration: "1.2 s",
  groupName: "App",
  latestRunHref: "/checks/signin/runs/run_1",
  latestRunOccurredAt: "Jul 15 11:56",
  runCount: 3,
  runState: "failed",
  status: "failing",
  target: "checks/signin.spec.ts",
  tone: "bad",
};

describe("SessionCheckActions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("opens the dashboard-style menu and queues the check by project and key", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ runId: "run_2", status: "queued" }), {
        status: 202,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<SessionCheckActions check={failedCheck} projectSlug="account" />);

    await user.click(screen.getByRole("button", { name: "Sign in actions" }));

    expect(screen.getByRole("link", { name: "Open" }).getAttribute("href")).toBe(
      "/checks/signin/runs/run_1",
    );
    expect(screen.getByRole("button", { name: "AI analysis" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Run now" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/checks/signin/run?project=account", {
        method: "POST",
      });
    });
    expect((await screen.findByRole("status")).textContent).toBe("Sign in queued.");
  });

  it("shows AI analysis only for failed runs", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <SessionCheckActions check={failedCheck} projectSlug="account" />,
    );

    await user.click(screen.getByRole("button", { name: "Sign in actions" }));
    await user.click(screen.getByRole("button", { name: "AI analysis" }));

    const drawer = screen.getByRole("dialog", { name: "AI analysis" });
    expect(within(drawer).getByText("The sign-in request returned 500.")).toBeTruthy();
    await user.click(within(drawer).getByRole("button", { name: "Close AI analysis" }));

    rerender(
      <SessionCheckActions
        check={{ ...failedCheck, runState: "passed", status: "passing" }}
        projectSlug="account"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Sign in actions" }));
    expect(screen.queryByRole("button", { name: "AI analysis" })).toBeNull();
  });
});
