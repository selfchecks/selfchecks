import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button, buttonVariants } from "./button";

describe("Button", () => {
  it("renders a native button by default", () => {
    render(<Button>Run checks</Button>);

    expect(screen.getByRole("button", { name: "Run checks" })).toBeTruthy();
  });

  it("applies variant and size classes", () => {
    render(
      <Button size="sm" variant="secondary">
        Refresh
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Refresh" });
    expect(button.className).toContain("bg-secondary");
    expect(button.className).toContain("h-9");
  });

  it("can render a child component through Slot", () => {
    render(
      <Button asChild>
        <a href="/runs">Runs</a>
      </Button>,
    );

    expect(screen.getByRole("link", { name: "Runs" }).getAttribute("href")).toBe(
      "/runs",
    );
  });
});

describe("buttonVariants", () => {
  it("returns default variant classes", () => {
    expect(buttonVariants()).toContain("bg-primary");
  });
});
