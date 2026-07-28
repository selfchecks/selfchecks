import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppNotesIntegration } from "./appnotes-integration";

const mocks = vi.hoisted(() => ({
  useAppNotes: vi.fn(),
}));

vi.mock("@appnotes/react", () => ({
  useAppNotes: mocks.useAppNotes,
}));

describe("AppNotesIntegration", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("keeps the launcher in place and portals the drawer root to the body", async () => {
    vi.stubEnv("NEXT_PUBLIC_APPNOTES_PROJECT_KEY", "appnotes_pk_test");

    render(<AppNotesIntegration />);

    const toggleElement = document.querySelector("[data-appnotes-toggle]");

    expect(toggleElement?.getAttribute("class")).toBe("h-10 shrink-0");

    await waitFor(() => {
      const rootElement = document.querySelector("[data-appnotes-drawer-root]");

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

  it("does not render AppNotes when the project key is unavailable", () => {
    vi.stubEnv("NEXT_PUBLIC_APPNOTES_PROJECT_KEY", "");

    render(<AppNotesIntegration />);

    expect(document.querySelector("[data-appnotes-toggle]")).toBeNull();
    expect(document.querySelector("[data-appnotes-drawer-root]")).toBeNull();
    expect(mocks.useAppNotes).toHaveBeenLastCalledWith(null);
  });
});
