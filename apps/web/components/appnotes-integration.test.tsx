import type { AppNotesProps } from "@appnotes/react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AppNotesIntegration } from "./appnotes-integration";

vi.mock("@appnotes/react", () => ({
  AppNotes: ({ apiUrl, projectKey, roomId, theme }: AppNotesProps) => (
    <div
      data-api-url={apiUrl}
      data-project-key={projectKey}
      data-room-id={roomId}
      data-testid="appnotes"
      data-theme={theme}
    />
  ),
}));

describe("AppNotesIntegration", () => {
  it("configures AppNotes for the current SelfChecks host", () => {
    render(<AppNotesIntegration />);

    const appNotes = screen.getByTestId("appnotes");

    expect(appNotes.getAttribute("data-api-url")).toBe("https://appnotes.tech/api");
    expect(appNotes.getAttribute("data-project-key")).toBe(
      "appnotes_pk_DtXYxqlZ6H0EoAts",
    );
    expect(appNotes.getAttribute("data-room-id")).toBe(window.location.host);
    expect(appNotes.getAttribute("data-theme")).toBe("dark");
  });
});
