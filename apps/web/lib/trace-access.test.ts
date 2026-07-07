import { afterEach, describe, expect, it, vi } from "vitest";

import { createTraceAccessToken, verifyTraceAccessToken } from "./trace-access";

describe("trace access tokens", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("creates tokens that verify until their expiry time", () => {
    vi.stubEnv("NEXTAUTH_SECRET", "trace-secret");
    const now = Date.UTC(2026, 6, 7, 10, 0, 0);

    const token = createTraceAccessToken("run_1", "artifact_1", now);

    expect(verifyTraceAccessToken("run_1", "artifact_1", token, now)).toBe(true);
    expect(
      verifyTraceAccessToken("run_1", "artifact_1", token, now + 15 * 60 * 1000),
    ).toBe(true);
    expect(
      verifyTraceAccessToken("run_1", "artifact_1", token, now + 15 * 60 * 1000 + 1),
    ).toBe(false);
  });

  it("rejects malformed and mismatched tokens", () => {
    vi.stubEnv("NEXTAUTH_SECRET", "trace-secret");
    const token = createTraceAccessToken("run_1", "artifact_1", 1000);

    expect(verifyTraceAccessToken("run_2", "artifact_1", token, 1000)).toBe(false);
    expect(verifyTraceAccessToken("run_1", "artifact_2", token, 1000)).toBe(false);
    expect(verifyTraceAccessToken("run_1", "artifact_1", null, 1000)).toBe(false);
    expect(verifyTraceAccessToken("run_1", "artifact_1", "bad.token.extra", 1000)).toBe(
      false,
    );
    expect(verifyTraceAccessToken("run_1", "artifact_1", "abc.signature", 1000)).toBe(
      false,
    );
  });

  it("fails closed when the signing secret is missing", () => {
    vi.stubEnv("NEXTAUTH_SECRET", "trace-secret");
    const token = createTraceAccessToken("run_1", "artifact_1", 1000);
    vi.unstubAllEnvs();

    expect(() => createTraceAccessToken("run_1", "artifact_1", 1000)).toThrow(
      "NEXTAUTH_SECRET is required to open trace artifacts.",
    );
    expect(verifyTraceAccessToken("run_1", "artifact_1", token, 1000)).toBe(false);
  });
});
