import { describe, expect, it } from "vitest";

import { defineConfig } from "./index.js";
import {
  ApiCheck,
  AssertionBuilder,
  Frequency,
  RetryStrategyBuilder,
} from "./constructs.js";

describe("Checkly compatibility exports", () => {
  it("keeps configuration values unchanged", () => {
    const config = defineConfig({ logicalId: "account", projectName: "Account" });

    expect(config).toEqual({ logicalId: "account", projectName: "Account" });
  });

  it("provides the supported construct subset", () => {
    const check = new ApiCheck("health", {
      frequency: Frequency.EVERY_15M,
      request: {
        assertions: [AssertionBuilder.statusCode().equals(200)],
        method: "GET",
        url: "https://example.test/health",
      },
    });

    expect(check.logicalId).toBe("health");
    expect(check.props.frequency).toBe(15);
    expect(RetryStrategyBuilder.fixedStrategy({ maxRetries: 2 })).toEqual({
      maxRetries: 2,
      type: "FIXED",
    });
  });
});
