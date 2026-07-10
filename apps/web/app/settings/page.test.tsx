import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../dashboard-page-data", () => ({
  DashboardData: ({ activeView }: { activeView: string }) => (
    <div data-testid="dashboard-data">{activeView}</div>
  ),
}));

import SettingsPage from "./page";

describe("SettingsPage", () => {
  it("opens settings as a dedicated route view", () => {
    render(<SettingsPage />);

    expect(screen.getByTestId("dashboard-data").textContent).toBe("settings");
  });
});
