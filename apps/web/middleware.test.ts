import { describe, expect, it } from "vitest";

import { config, isTraceViewerArtifactRequest } from "./middleware";

describe("middleware config", () => {
  it("protects application routes and leaves auth/static routes public", () => {
    expect(config.matcher).toEqual([
      "/((?!api/auth|api/setup|setup|login|_next/static|_next/image|favicon.ico).*)",
    ]);
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
