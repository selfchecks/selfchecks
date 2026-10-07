import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppNotesIntegration } from "./appnotes-integration";

const mocks = vi.hoisted(() => ({
  useAppNotes: vi.fn(),
  pathname: "/",
}));

vi.mock("@appnotes/react", () => ({
  useAppNotes: mocks.useAppNotes,
}));

vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));

describe("AppNotesIntegration", () => {
  beforeEach(() => {
    mocks.pathname = "/";
  });

  it.each([
    "/oauth/consent",
    "/oauth/connections",
    "/login",
    "/setup",
    "/settings",
    "/settings/ai",
    "/queue",
    "/usage",
    "/unknown-page",
  ])("does not mount AppNotes on the service page %s", (pathname) => {
    vi.stubEnv("NEXT_PUBLIC_APPNOTES_PROJECT_KEY", "appnotes_pk_test");
    mocks.pathname = pathname;
    render(<AppNotesIntegration />);
    expect(document.querySelector("[data-appnotes-toggle]")).toBeNull();
    expect(document.querySelector("[data-appnotes-drawer-root]")).toBeNull();
    expect(mocks.useAppNotes).not.toHaveBeenCalled();
  });

  it("removes the drawer and launcher when navigating from a check to OAuth, then restores them on return", async () => {
    vi.stubEnv("NEXT_PUBLIC_APPNOTES_PROJECT_KEY", "appnotes_pk_test");
    mocks.pathname = "/checks/checkout";
    const { rerender } = render(<AppNotesIntegration />);
    await waitFor(() =>
      expect(document.querySelector("[data-appnotes-toggle]")).not.toBeNull(),
    );
    mocks.pathname = "/oauth/consent";
    rerender(<AppNotesIntegration />);
    expect(document.querySelector("[data-appnotes-toggle]")).toBeNull();
    expect(document.querySelector("[data-appnotes-drawer-root]")).toBeNull();
    mocks.pathname = "/test-sessions/session";
    rerender(<AppNotesIntegration />);
    await waitFor(() =>
      expect(document.querySelector("[data-appnotes-toggle]")).not.toBeNull(),
    );
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("places the launcher first in the current page actions", async () => {
    vi.stubEnv("NEXT_PUBLIC_APPNOTES_PROJECT_KEY", "appnotes_pk_test");

    render(
      <>
        <div data-appnotes-actions="" data-testid="page-actions">
          <button type="button">Page action</button>
        </div>
        <AppNotesIntegration />
      </>,
    );

    const actionsElement = screen.getByTestId("page-actions");

    await waitFor(() => {
      const toggleElement = document.querySelector("[data-appnotes-toggle]");
      const rootElement = document.querySelector("[data-appnotes-drawer-root]");

      expect(toggleElement?.parentElement).toBe(actionsElement);
      expect(toggleElement?.getAttribute("class")).toBe("order-first h-10 shrink-0");
      expect(rootElement?.parentElement).toBe(document.body);
      expect(mocks.useAppNotes).toHaveBeenLastCalledWith(
        expect.objectContaining({
          apiUrl: "https://app.appnotes.tech/api",
          projectKey: "appnotes_pk_test",
          roomId: window.location.host,
          rootDomElement: rootElement,
          theme: "dark",
          toggleDomElement: toggleElement,
        }),
      );
    });
  });

  it("keeps the launcher in the top-right corner without a page actions slot", async () => {
    vi.stubEnv("NEXT_PUBLIC_APPNOTES_PROJECT_KEY", "appnotes_pk_test");

    render(<AppNotesIntegration />);

    await waitFor(() => {
      const toggleElement = document.querySelector("[data-appnotes-toggle]");

      expect(toggleElement?.parentElement).toBe(document.body);
      expect(toggleElement?.getAttribute("class")).toBe(
        "fixed right-4 top-3 z-[2147482999] h-10",
      );
    });
  });

  it("moves the launcher when the page actions slot is replaced", async () => {
    vi.stubEnv("NEXT_PUBLIC_APPNOTES_PROJECT_KEY", "appnotes_pk_test");

    function Fixture({ slot }: { slot: string }) {
      return (
        <>
          <div
            data-appnotes-actions=""
            data-testid={`page-actions-${slot}`}
            key={slot}
          />
          <AppNotesIntegration />
        </>
      );
    }

    const { rerender } = render(<Fixture slot="loading" />);

    await waitFor(() => {
      expect(document.querySelector("[data-appnotes-toggle]")?.parentElement).toBe(
        screen.getByTestId("page-actions-loading"),
      );
    });

    rerender(<Fixture slot="ready" />);

    await waitFor(() => {
      expect(document.querySelector("[data-appnotes-toggle]")?.parentElement).toBe(
        screen.getByTestId("page-actions-ready"),
      );
    });
  });

  it("does not render AppNotes when the project key is unavailable", () => {
    vi.stubEnv("NEXT_PUBLIC_APPNOTES_PROJECT_KEY", "");

    render(<AppNotesIntegration />);

    expect(document.querySelector("[data-appnotes-toggle]")).toBeNull();
    expect(document.querySelector("[data-appnotes-drawer-root]")).toBeNull();
    expect(mocks.useAppNotes).toHaveBeenLastCalledWith(null);
  });
});
