import type { AppNotesProps } from "@appnotes/react";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppNotesIntegration } from "./appnotes-integration";

vi.mock("@appnotes/react", () => ({
  AppNotes: ({ apiUrl, projectKey, roomId, theme, toggleClassName }: AppNotesProps) => (
    <div
      data-api-url={apiUrl}
      data-project-key={projectKey}
      data-room-id={roomId}
      data-testid="appnotes"
      data-theme={theme}
      data-toggle-class={toggleClassName}
    />
  ),
}));

describe("AppNotesIntegration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("configures AppNotes for the current SelfChecks host", () => {
    vi.stubEnv("NEXT_PUBLIC_APPNOTES_PROJECT_KEY", "appnotes_pk_test");

    render(<AppNotesIntegration />);

    const appNotes = screen.getByTestId("appnotes");

    expect(appNotes.getAttribute("data-api-url")).toBe("https://appnotes.tech/api");
    expect(appNotes.getAttribute("data-project-key")).toBe("appnotes_pk_test");
    expect(appNotes.getAttribute("data-room-id")).toBe(window.location.host);
    expect(appNotes.getAttribute("data-theme")).toBe("dark");
    expect(appNotes.getAttribute("data-toggle-class")).toBe(
      "fixed bottom-6 right-6 z-[2147483000]",
    );
  });

  it("does not render AppNotes when the project key is unavailable", () => {
    vi.stubEnv("NEXT_PUBLIC_APPNOTES_PROJECT_KEY", "");

    render(<AppNotesIntegration />);

    expect(screen.queryByTestId("appnotes")).toBeNull();
  });
});
