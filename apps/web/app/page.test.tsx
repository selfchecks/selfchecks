import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import DashboardPage from "./page";

describe("DashboardPage", () => {
  it("renders the Checkly-like dashboard shell", () => {
    render(<DashboardPage />);

    expect(
      screen.getByRole("heading", { name: "Synthetic checks dashboard" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Home" })).toBeTruthy();
    expect(screen.getByText("nikolaev@iprojects.ru")).toBeTruthy();
    expect(screen.getByText("PASSING")).toBeTruthy();
    expect(screen.getByText("DEGRADED")).toBeTruthy();
    expect(screen.getByText("FAILING")).toBeTruthy();
    expect(screen.getByRole("searchbox", { name: "Search checks" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Heartbeats" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Alert channels" })).toBeNull();
  });

  it("shows grouped checks and operational metrics", () => {
    render(<DashboardPage />);

    expect(screen.getByText("API / Regress")).toBeTruthy();
    expect(screen.getByText("group.list")).toBeTruthy();
    expect(screen.getByText("issue.get")).toBeTruthy();
    expect(screen.getByText("Last results")).toBeTruthy();
    expect(screen.getByText("AVA")).toBeTruthy();
    expect(screen.getByText("P95")).toBeTruthy();
  });
});
