import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../dashboard-page-data", () => ({
  DashboardData: ({ activeView }: { activeView: string }) => (
    <div data-testid="dashboard-data">{activeView}</div>
  ),
}));

import QueuePage from "./page";

describe("QueuePage", () => {
  it("opens queue as a dedicated route view", () => {
    render(<QueuePage />);

    expect(screen.getByTestId("dashboard-data").textContent).toBe("queue");
  });
});
