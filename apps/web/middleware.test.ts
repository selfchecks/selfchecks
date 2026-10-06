import { describe, expect, it } from "vitest";

import { config, isTraceViewerArtifactRequest } from "./middleware";

describe("middleware config", () => {
  it("protects application routes and leaves auth/static routes public", () => {
    const protectedRoute = new RegExp(`^${config.matcher[0]}$`);
    for (const pathname of [
      "/",
      "/settings",
      "/api/dashboard",
      "/mcp-admin",
      "/mcpx",
    ]) {
      expect(protectedRoute.test(pathname), pathname).toBe(true);
    }
    for (const pathname of [
      "/mcp",
      "/mcp/",
      "/login",
      "/api/auth/session",
      "/api/cli/triggers",
      "/_next/static/app.js",
    ]) {
      expect(protectedRoute.test(pathname), pathname).toBe(false);
    }
  });

  it("recognizes signed trace artifact requests for the embedded viewer", () => {
    expect(
      isTraceViewerArtifactRequest({
        nextUrl: new URL(
          "http://localhost/api/runs/run_1/artifacts/artifact_1?traceViewer=1&token=abc",
        ),
      }),
    ).toBe(true);
    expect(
      isTraceViewerArtifactRequest({
        nextUrl: new URL("http://localhost/api/runs/run_1/artifacts/artifact_1"),
      }),
    ).toBe(false);
    expect(
      isTraceViewerArtifactRequest({
        nextUrl: new URL(
          "http://localhost/api/checks/check_1/run?traceViewer=1&token=abc",
        ),
      }),
    ).toBe(false);
  });
});
