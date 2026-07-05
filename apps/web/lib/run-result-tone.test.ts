import { describe, expect, it } from "vitest";

import { getRunResultTone, getRunResultToneClassName } from "./run-result-tone";

describe("run result tone", () => {
  it("uses separate tones and colors for degraded and queued runs", () => {
    expect(
      getRunResultTone({
        runState: "not_run",
        status: "degraded",
      }),
    ).toBe("warn");
    expect(getRunResultToneClassName("warn")).toBe("bg-orange-400");

    expect(
      getRunResultTone({
        runState: "queued",
        status: "degraded",
      }),
    ).toBe("queued");
    expect(getRunResultToneClassName("queued")).toBe("bg-yellow-400");
  });
});
