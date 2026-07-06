import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AppSidebar } from "./app-sidebar";

describe("AppSidebar", () => {
  it("renders journal navigation and supports dashboard callbacks", async () => {
    const user = userEvent.setup();
    const onHomeClick = vi.fn();
    const onSettingsClick = vi.fn();

    render(
      <AppSidebar
        activeItem="journal"
        onHomeClick={onHomeClick}
        onSettingsClick={onSettingsClick}
      />,
    );

    expect(screen.getByRole("button", { name: /SelfChecks/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Home" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Journal" }).getAttribute("href")).toBe(
      "/journal",
    );
    expect(
      screen.getByRole("link", { name: "Test sessions" }).getAttribute("href"),
    ).toBe("/test-sessions");
    expect(screen.getByRole("button", { name: "Settings" })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Journal" }).getAttribute("aria-current"),
    ).toBe("page");

    await user.click(screen.getByRole("button", { name: "Home" }));
    await user.click(screen.getByRole("button", { name: "Settings" }));

    expect(onHomeClick).toHaveBeenCalledTimes(1);
    expect(onSettingsClick).toHaveBeenCalledTimes(1);
  });
});
