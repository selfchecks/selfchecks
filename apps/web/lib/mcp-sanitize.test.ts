import { describe, expect, it } from "vitest";
import { redactText, sanitize, summarizeMetrics } from "./mcp-sanitize";

describe("MCP evidence", () => {
  it("redacts credentials in structured headers, nested JSON bodies, URLs and logs", () => {
    const value = sanitize({
      headers: [{ name: "Authorization", value: "secret" }],
      body: JSON.stringify({
        password: "hidden",
        nested: { access_token: "hidden" },
        useful: "HTTP 500",
      }),
      url: "https://user:pass@example.com/?token=hidden&test=ok",
      log: "Authorization: Bearer secret\nCookie: session=hidden\nsck_abcdef",
    });
    expect(JSON.stringify(value)).not.toMatch(/hidden|secret|user:pass|sck_abcdef/);
    expect(JSON.stringify(value)).toContain("HTTP 500");
  });
  it("reports browser timing samples and recovery only within the same retry group", () => {
    const summary = summarizeMetrics([
      {
        status: "FAILED",
        durationMs: 100,
        result: null,
        retryGroupId: "g",
        attempt: 1,
      },
      {
        status: "PASSED",
        durationMs: 100,
        result: { performance: { timings: { lcpMs: 2200 } } },
        retryGroupId: "g",
        attempt: 2,
      },
      {
        status: "PASSED",
        durationMs: 100,
        result: null,
        retryGroupId: "other",
        attempt: 1,
      },
    ]);
    expect(summary.retryEvidence.recoveredRetryGroups).toBe(1);
    expect(summary.browserTimingMs.lcpMs).toEqual({ sampleCount: 1, p95: 2200 });
  });

  it("preserves long redacted logs for pagination", () => {
    expect(redactText("a".repeat(20_000)).length).toBe(20_000);
  });
  it("separates API latency from run duration and excludes unfinished/cancelled runs", () => {
    const summary = summarizeMetrics([
      { status: "PASSED", durationMs: 1000, result: { responseTimeMs: 100 } },
      { status: "FAILED", durationMs: 5000, result: { responseTimeMs: 400 } },
      { status: "RUNNING", durationMs: 90_000, result: null },
      { status: "CANCELLED", durationMs: 90_000, result: null },
    ]);
    expect(summary).toMatchObject({
      completedRuns: 2,
      checkPassRate: 0.5,
      checkDurationMs: { p95: 5000 },
      apiResponseTimeMs: { p95: 400 },
    });
    expect(summarizeMetrics([]).checkPassRate).toBeNull();
  });
});
