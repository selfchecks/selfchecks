import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  routerPush: vi.fn(),
  routerRefresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mocks.routerPush,
    refresh: mocks.routerRefresh,
  }),
}));

import { SessionActions } from "./session-actions";

describe("SessionActions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("queues every test in the current session", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ runCount: 12, sessionId: "session_1", status: "queued" }),
          { status: 202 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <SessionActions
        attemptCount={12}
        failedCount={2}
        runState="failed"
        sessionId="session_1"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Rerun tests-session" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/test-sessions/session_1/runs",
        expect.objectContaining({
          body: JSON.stringify({ action: "rerun-session" }),
          method: "POST",
        }),
      );
    });
    expect((await screen.findByRole("status")).textContent).toBe("12 tests queued.");
    expect(mocks.routerRefresh).toHaveBeenCalledOnce();
  });

  it("requires a project, queues a full regression, and opens its cloned session", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            projects: [
              { checkCount: 2, name: "Account", slug: "account" },
              { checkCount: 1, name: "API", slug: "api" },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            runCount: 2,
            sessionId: "session_clone",
            status: "queued",
          }),
          { status: 202 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <SessionActions
        attemptCount={2}
        failedCount={0}
        runState="passed"
        sessionId="session_1"
      />,
    );

    expect(
      screen
        .getByRole("button", { name: "Rerun failed tests" })
        .hasAttribute("disabled"),
    ).toBe(true);
    await user.click(screen.getByRole("button", { name: "Make full regress" }));

    const dialog = await screen.findByRole("dialog", { name: "Make full regress" });
    const runTests = screen.getByRole("button", { name: "Run tests" });

    expect(dialog).toBeTruthy();
    expect(runTests.hasAttribute("disabled")).toBe(true);

    await user.click(screen.getByRole("checkbox", { name: /Account/ }));
    expect(runTests.hasAttribute("disabled")).toBe(false);
    await user.click(runTests);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        "/api/test-sessions/session_1/runs",
        expect.objectContaining({
          body: JSON.stringify({
            action: "full-regression",
            projectSlugs: ["account"],
          }),
          method: "POST",
        }),
      );
    });
    expect(mocks.routerPush).toHaveBeenCalledWith("/test-sessions/session_clone");
  });
});
