import { describe, expect, it } from "vitest";

import { isAutoMigrateEnabled } from "./migrations.js";

describe("isAutoMigrateEnabled", () => {
  it("enables automatic migrations by default", () => {
    expect(isAutoMigrateEnabled(undefined)).toBe(true);
    expect(isAutoMigrateEnabled("1")).toBe(true);
    expect(isAutoMigrateEnabled("true")).toBe(true);
  });

  it("accepts common disabled values", () => {
    expect(isAutoMigrateEnabled("0")).toBe(false);
    expect(isAutoMigrateEnabled("false")).toBe(false);
    expect(isAutoMigrateEnabled("OFF")).toBe(false);
    expect(isAutoMigrateEnabled(" no ")).toBe(false);
  });
});
