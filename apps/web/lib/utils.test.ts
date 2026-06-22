import { describe, expect, it } from "vitest";

import { cn } from "./utils";

describe("cn", () => {
  it("combines conditional class names", () => {
    expect(cn("base", { hidden: false }, ["nested"])).toBe("base nested");
  });

  it("resolves Tailwind conflicts with the later class", () => {
    expect(cn("px-2 text-sm", "px-4")).toBe("text-sm px-4");
  });
});
