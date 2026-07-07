import { describe, expect, it } from "vitest";

import { dashboardCopy } from "./messages";

describe("dashboardCopy", () => {
  it("exposes stable dashboard copy groups", () => {
    expect(dashboardCopy.product).toBe("SelfChecks");
    expect(dashboardCopy.actions).toMatchObject({
      refresh: "Refresh",
      runChecks: "Run checks",
    });
    expect(dashboardCopy.checks.columns).toMatchObject({
      check: "Check",
      group: "Group",
      lastRun: "Last run",
      status: "Status",
    });
  });
});
