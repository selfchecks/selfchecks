import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CopyAnalysisButton } from "./copy-analysis-button";

describe("CopyAnalysisButton", () => {
  it("copies the complete analysis text to the clipboard", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    const analysis = "First line\n\nSecond line with details.";

    render(<CopyAnalysisButton text={analysis} />);

    await user.click(screen.getByRole("button", { name: "Copy AI analysis" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(analysis));
    expect(screen.getByTitle("AI analysis copied")).toBeTruthy();
  });
});
