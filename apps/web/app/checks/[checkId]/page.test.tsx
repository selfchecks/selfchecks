import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCheckDetailShellData: vi.fn(),
  getDashboardAccountLabel: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
}));

vi.mock("@/lib/dashboard-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/dashboard-data")>()),
  getCheckDetailShellData: mocks.getCheckDetailShellData,
}));

vi.mock("@/lib/settings-data", () => ({
  getDashboardAccountLabel: mocks.getDashboardAccountLabel,
}));

vi.mock("./check-detail-client", () => ({
  default: ({
    accountLabel,
    detail,
  }: {
    accountLabel: string;
    detail: { check: { name: string } };
  }) => (
    <div data-testid="check-detail-client">
      {accountLabel}:{detail.check.name}
    </div>
  ),
}));

import CheckDetailPage from "./page";

describe("CheckDetailPage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("passes shell data and account label to the client view", async () => {
    mocks.getCheckDetailShellData.mockResolvedValue({
      check: {
        name: "API health",
      },
    });
    mocks.getDashboardAccountLabel.mockReturnValue("admin@example.com");

    render(
      await CheckDetailPage({
        params: Promise.resolve({
          checkId: "check_1",
        }),
      }),
    );

    expect(screen.getByTestId("check-detail-client").textContent).toBe(
      "admin@example.com:API health",
    );
    expect(mocks.getCheckDetailShellData).toHaveBeenCalledWith("check_1");
  });

  it("delegates to notFound when the check is missing", async () => {
    mocks.getCheckDetailShellData.mockResolvedValue(undefined);

    await expect(
      CheckDetailPage({
        params: Promise.resolve({
          checkId: "missing",
        }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.notFound).toHaveBeenCalled();
  });
});
