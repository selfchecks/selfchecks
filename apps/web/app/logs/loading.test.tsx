import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import LogsLoading from "./loading";

describe("LogsLoading", () => {
  it("renders an immediate route skeleton", () => {
    render(<LogsLoading />);

    expect(screen.getByLabelText("Loading logs")).toBeTruthy();
    expect(screen.getByLabelText("Loading status changes")).toBeTruthy();
  });
});
