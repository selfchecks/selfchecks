import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatusPill } from "./status-pill";

describe("StatusPill", () => {
  it("renders known status labels", () => {
    render(<StatusPill status="ready" />);

    expect(screen.getByText("Ready").className).toContain("text-primary");
  });

  it("falls back to the raw status for unknown values", () => {
    render(<StatusPill status="custom" />);

    expect(screen.getByText("custom")).toBeTruthy();
  });
});
