import { describe, expect, it } from "vitest";

import { getArtifactFileName } from "./artifact-names";

describe("artifact names", () => {
  it("uses the Playwright test output directory for trace names", () => {
    expect(
      getArtifactFileName({
        path: "/tmp/artifacts/run_1/test-results/paid-content-email-draft-creation-chromium/trace.zip",
        type: "TRACE",
      }),
    ).toBe("paid-content-email-draft-creation-chromium.trace.zip");
  });

  it("keeps regular artifact basenames unchanged", () => {
    expect(
      getArtifactFileName({
        path: "/tmp/artifacts/run_1/test-results/paid-content-email-draft-creation-chromium/screenshot.png",
        type: "SCREENSHOT",
      }),
    ).toBe("screenshot.png");
  });

  it("falls back to the trace basename when the path is not a Playwright result path", () => {
    expect(
      getArtifactFileName({
        path: "/tmp/trace.zip",
        type: "TRACE",
      }),
    ).toBe("trace.zip");
  });
});
