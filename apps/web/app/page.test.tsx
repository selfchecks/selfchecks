import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import DashboardPage from "./page";

describe("DashboardPage", () => {
  it("renders the dashboard shell and empty state", () => {
    render(<DashboardPage />);

    expect(
      screen.getByRole("heading", { name: "Synthetic checks dashboard" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Run checks" })).toBeTruthy();
    expect(
      screen.getByText(
        "No checks imported yet. Run selfchecks deploy to populate this list.",
      ),
    ).toBeTruthy();
  });

  it("shows bootstrap commands for the first installation slice", () => {
    render(<DashboardPage />);

    expect(screen.getByText("yarn db:migrate")).toBeTruthy();
    expect(screen.getByText("selfchecks deploy --force")).toBeTruthy();
    expect(screen.getByText("selfchecks test --tags smoke --record")).toBeTruthy();
  });
});
