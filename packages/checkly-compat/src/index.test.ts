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
    expect(check.props.request.assertions).toEqual([
      { comparison: "EQUALS", source: "STATUS_CODE", target: 200 },
    ]);
    expect(RetryStrategyBuilder.fixedStrategy({ maxRetries: 2 })).toEqual({
      maxRetries: 2,
      type: "FIXED",
    });
  });

  it("exposes the portable assertion, frequency, request, and retry contract", () => {
    expect(Frequency).toMatchObject({
      EVERY_1M: 1,
      EVERY_2M: 2,
      EVERY_5M: 5,
      EVERY_1H: 60,
    });
    expect(AssertionBuilder.jsonBody("$.data.ok").isNotNull()).toEqual({
      comparison: "IS_NOT_NULL",
      property: "$.data.ok",
      source: "JSON_BODY",
    });
    expect(AssertionBuilder.headers("content-type").contains("json")).toEqual({
      comparison: "CONTAINS",
      property: "content-type",
      source: "HEADERS",
      target: "json",
    });
    expect(AssertionBuilder.responseTime().lessThan(500)).toEqual({
      comparison: "LESS_THAN",
      source: "RESPONSE_TIME",
      target: 500,
    });
    expect(RetryStrategyBuilder.singleRetry()).toEqual({ type: "SINGLE_RETRY" });
  });
});
