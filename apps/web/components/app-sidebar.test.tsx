import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppSidebar } from "./app-sidebar";

describe("AppSidebar", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("renders navigation and the account block in the sidebar footer", async () => {
    const user = userEvent.setup();
    const onHomeClick = vi.fn();

    render(
      <AppSidebar
        accountLabel="admin@example.com"
        activeItem="journal"
        initialQueuedCount={1}
        initialRunningCount={2}
        onHomeClick={onHomeClick}
      />,
    );

    expect(screen.getByRole("button", { name: /SelfChecks/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Home" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Queue" }).getAttribute("href")).toBe(
      "/?view=queue",
    );
    expect(screen.getByRole("link", { name: "Journal" }).getAttribute("href")).toBe(
      "/journal",
    );
    expect(
      screen.getByRole("link", { name: "Test sessions" }).getAttribute("href"),
    ).toBe("/test-sessions");
    expect(screen.getByRole("link", { name: "Usage" }).getAttribute("href")).toBe(
      "/usage",
    );
    expect(screen.getByRole("link", { name: "Settings" }).getAttribute("href")).toBe(
      "/settings",
    );
    expect(
      screen.getByRole("link", { name: "Journal" }).getAttribute("aria-current"),
    ).toBe("page");
    expect(screen.getByRole("status", { name: "Running 2, queued 1" })).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Open queue: running 2, queued 1" })
        .getAttribute("href"),
    ).toBe("/?view=queue");

    await user.click(screen.getByRole("button", { name: "Home" }));
    await user.click(screen.getByRole("button", { name: "Open account menu" }));

    expect(onHomeClick).toHaveBeenCalledTimes(1);
    expect(screen.getByText("admin@example.com")).toBeTruthy();
    expect(screen.queryByText("Signed in locally")).toBeNull();
    expect(screen.getAllByRole("link", { name: "Settings" })).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Sign out" }).getAttribute("href")).toBe(
      "/api/auth/signout",
    );
  });

  it("refreshes running and queued counts", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          accountLabel: "ops@example.com",
          projectSlug: "default",
          queued: 3,
          running: 4,
        }),
        {
          headers: {
            "content-type": "application/json",
          },
          status: 200,
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<AppSidebar />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/dashboard/status?project=default", {
      cache: "no-store",
    });
    expect(screen.getByRole("status", { name: "Running 4, queued 3" })).toBeTruthy();
  });

  it("does not overlap status refresh requests", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(() => new Promise<Response>(() => undefined));
    vi.stubGlobal("fetch", fetchMock);

    render(<AppSidebar />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
