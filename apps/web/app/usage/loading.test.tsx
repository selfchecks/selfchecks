import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import UsageLoading from "./loading";

describe("UsageLoading", () => {
  it("renders a skeleton for every usage block", () => {
    render(<UsageLoading />);

    expect(screen.getByRole("main", { name: "Loading usage analytics" })).toBeTruthy();
    expect(screen.getByLabelText("Loading usage totals")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Loading tests by day" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Loading test sources" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Loading results by day" })).toBeTruthy();
    expect(
      screen.getByRole("region", { name: "Loading tests by project" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("region", { name: "Loading test reliability" }),
    ).toBeTruthy();
  });
});
