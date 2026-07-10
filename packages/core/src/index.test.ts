import { describe, expect, it } from "vitest";

import {
  apiRequestSchema,
  checkDefinitionSchema,
  deploySummarySchema,
  frequencySchema,
  getCheckIdentity,
  normalizePerformanceSettingValue,
  normalizePerformanceSettings,
  normalizeCheckQueueName,
  normalizeTags,
  retryStrategySchema,
} from "./index.js";

describe("normalizeTags", () => {
  it("trims, deduplicates, and sorts tags", () => {
    expect(normalizeTags([" smoke", "api", "smoke", ""])).toEqual(["api", "smoke"]);
  });

  it("accepts any iterable", () => {
    expect(normalizeTags(new Set(["pr", "smoke", "pr"]))).toEqual(["pr", "smoke"]);
  });
});

describe("frequencySchema", () => {
  it("accepts positive integer intervals", () => {
    expect(frequencySchema.parse({ intervalMinutes: 5 })).toEqual({
      intervalMinutes: 5,
    });
  });

  it("rejects zero, negative, and non-integer intervals", () => {
    expect(() => frequencySchema.parse({ intervalMinutes: 0 })).toThrow();
    expect(() => frequencySchema.parse({ intervalMinutes: -1 })).toThrow();
    expect(() => frequencySchema.parse({ intervalMinutes: 1.5 })).toThrow();
  });
});

describe("apiRequestSchema", () => {
  it("fills optional defaults", () => {
    expect(
      apiRequestSchema.parse({
        method: "GET",
        url: "https://example.test/health",
      }),
    ).toEqual({
      assertions: [],
      headers: {},
      method: "GET",
      url: "https://example.test/health",
    });
  });

  it("accepts assertions and body content", () => {
    expect(
      apiRequestSchema.parse({
        assertions: [
          {
            operator: "equals",
            source: "status",
            target: 200,
          },
        ],
        body: '{"ok":true}',
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
        url: "https://example.test/api",
      }),
    ).toMatchObject({
      assertions: [
        {
          operator: "equals",
          source: "status",
          target: 200,
        },
      ],
      method: "POST",
    });
  });
});

describe("retryStrategySchema", () => {
  it("accepts Checkly-style retry strategy options", () => {
    expect(
      retryStrategySchema.parse({
        baseBackoffSeconds: 30,
        maxDurationSeconds: 600,
        maxRetries: 4,
        sameRegion: false,
        type: "LINEAR",
      }),
    ).toEqual({
      baseBackoffSeconds: 30,
      maxDurationSeconds: 600,
      maxRetries: 4,
      sameRegion: false,
      type: "LINEAR",
    });
  });

  it("rejects retry counts above the Checkly limit", () => {
    expect(() =>
      retryStrategySchema.parse({
        maxRetries: 11,
        type: "FIXED",
      }),
    ).toThrow();
  });
});

describe("checkDefinitionSchema", () => {
  it("requires API request definitions for API checks", () => {
    expect(() =>
      checkDefinitionSchema.parse({
        key: "api-health",
        name: "API health",
        type: "api",
      }),
    ).toThrow("API checks require a request definition.");
  });

  it("accepts API checks with request definitions", () => {
    expect(
      checkDefinitionSchema.parse({
        key: "api-health",
        name: "API health",
        request: {
          method: "GET",
          url: "https://example.test/health",
        },
        tags: ["smoke"],
        type: "api",
      }),
    ).toMatchObject({
      key: "api-health",
      request: {
        assertions: [],
        headers: {},
      },
      tags: ["smoke"],
    });
  });

  it("accepts browser checks with an entrypoint", () => {
    expect(
      checkDefinitionSchema.parse({
        entrypoint: "checks/homepage.spec.ts",
        key: "homepage",
        name: "Homepage",
        type: "browser",
      }),
    ).toMatchObject({
      enabled: true,
      key: "homepage",
      tags: [],
    });
  });

  it("requires browser entrypoints for browser checks", () => {
    expect(() =>
      checkDefinitionSchema.parse({
        key: "homepage",
        name: "Homepage",
        type: "browser",
      }),
    ).toThrow("Browser checks require a Playwright entrypoint.");
  });
});

describe("deploySummarySchema", () => {
  it("accepts a deploy summary and fills warning defaults", () => {
    expect(
      deploySummarySchema.parse({
        checks: [
          {
            entrypoint: "checks/homepage.spec.ts",
            key: "homepage",
            name: "Homepage",
            type: "browser",
          },
        ],
        created: 1,
        projectSlug: "account",
        removed: 0,
        updated: 0,
      }),
    ).toMatchObject({
      created: 1,
      projectSlug: "account",
      warnings: [],
    });
  });

  it("rejects negative counters", () => {
    expect(() =>
      deploySummarySchema.parse({
        checks: [],
        created: -1,
        projectSlug: "account",
        removed: 0,
        updated: 0,
      }),
    ).toThrow();
  });
});

describe("getCheckIdentity", () => {
  it("creates a stable project-scoped check identity", () => {
    expect(getCheckIdentity("account", "homepage")).toBe("account:homepage");
  });
});

describe("normalizeCheckQueueName", () => {
  it("defaults to the shared selfchecks queue", () => {
    expect(normalizeCheckQueueName(undefined)).toBe("selfchecks-checks");
  });

  it("rejects BullMQ-incompatible names", () => {
    expect(() => normalizeCheckQueueName("selfchecks:checks")).toThrow(
      'SELFCHECKS_QUEUE_NAME cannot contain ":"',
    );
  });
});

describe("normalizePerformanceSettings", () => {
  it("fills performance defaults", () => {
    expect(normalizePerformanceSettings(undefined)).toEqual({
      artifactRetentionDays: 14,
      historyRetentionDays: 180,
      queuedRunTimeoutMinutes: 30,
      runningRunTimeoutMinutes: 120,
      testSessionTimeoutMinutes: 30,
      workerConcurrency: 2,
    });
  });

  it("clamps performance values to supported limits", () => {
    expect(normalizePerformanceSettingValue("workerConcurrency", 100)).toBe(24);
    expect(normalizePerformanceSettingValue("artifactRetentionDays", 1)).toBe(2);
    expect(normalizePerformanceSettingValue("historyRetentionDays", 999)).toBe(365);
    expect(normalizePerformanceSettingValue("queuedRunTimeoutMinutes", 5)).toBe(10);
    expect(normalizePerformanceSettingValue("runningRunTimeoutMinutes", 500)).toBe(240);
    expect(normalizePerformanceSettingValue("testSessionTimeoutMinutes", 5)).toBe(10);
  });
});
