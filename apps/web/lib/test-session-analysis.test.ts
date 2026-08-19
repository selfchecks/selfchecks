import { describe, expect, it } from "vitest";

import {
  classifyTestSessionFailure,
  summarizeTestSessionFailures,
  type TestSessionFailureInput,
} from "./test-session-analysis";

describe("test session failure analysis", () => {
  it.each([
    ["TIMED_OUT", "locator.waitFor: Timeout 30000ms exceeded", "timeout"],
    ["FAILED", "Screenshot comparison failed: 219 pixels are different", "screenshot"],
    ["FAILED", "strict mode violation: locator resolved to 2 elements", "locator"],
    ["FAILED", "Expected element was not found in the document", "element"],
    ["FAILED", "expect(locator).toBeVisible() failed: element(s) not found", "element"],
    ["CANCELLED", "Test session was cancelled by the client", "other"],
  ])("classifies %s failure as %s", (status, errorMessage, expected) => {
    expect(classifyTestSessionFailure(createFailure({ errorMessage, status }))).toBe(
      expected,
    );
  });

  it.each([
    [
      "FAILED",
      "expect(page).toHaveScreenshot: Timeout 30000ms exceeded. 12212 pixels (ratio 0.01 of all image pixels) are different.",
    ],
    ["TIMED_OUT", "Expected an image 1400px by 870px, received 1400px by 918px."],
  ])(
    "prioritizes an explicit screenshot mismatch over a %s timeout signal",
    (status, errorMessage) => {
      expect(classifyTestSessionFailure(createFailure({ errorMessage, status }))).toBe(
        "screenshot",
      );
    },
  );

  it("does not treat a screenshot artifact as a screenshot mismatch", () => {
    expect(
      classifyTestSessionFailure(
        createFailure({
          errorMessage: "locator.waitFor: Timeout 30000ms exceeded",
          result: {
            artifacts: [{ path: "test-results/failure-screenshot.png" }],
          },
          status: "TIMED_OUT",
        }),
      ),
    ).toBe("timeout");
  });

  it("uses result details but ignores a previous per-test AI analysis", () => {
    expect(
      classifyTestSessionFailure(
        createFailure({
          errorMessage: "Assertion failed",
          result: {
            aiAnalysis: { content: "This might be a screenshot problem." },
            failure: "baseline image differs from actual image",
          },
        }),
      ),
    ).toBe("screenshot");

    expect(
      classifyTestSessionFailure(
        createFailure({
          errorMessage: "Assertion failed",
          result: {
            aiAnalysis: { content: "This was caused by a screenshot mismatch." },
          },
        }),
      ),
    ).toBe("other");
  });

  it("returns authoritative counts and test names for every category", () => {
    const summary = summarizeTestSessionFailures([
      createFailure({
        checkKey: "visual-header",
        checkName: "Visual header",
        errorMessage: "toHaveScreenshot comparison failed",
      }),
      createFailure({
        checkKey: "slow-page",
        checkName: "Slow page",
        errorMessage: "Timeout 10000ms exceeded",
      }),
      createFailure({
        checkKey: "unknown",
        checkName: "Unknown failure",
        errorMessage: "Process exited with code 137",
      }),
    ]);

    expect(summary.failedCount).toBe(3);
    expect(
      Object.fromEntries(
        summary.categories.map((category) => [category.key, category.count]),
      ),
    ).toEqual({
      element: 0,
      locator: 0,
      other: 1,
      screenshot: 1,
      timeout: 1,
    });
    expect(
      summary.categories.find((category) => category.key === "screenshot")?.tests,
    ).toEqual([
      expect.objectContaining({
        checkKey: "visual-header",
        checkName: "Visual header",
      }),
    ]);
  });
});

function createFailure(
  overrides: Partial<TestSessionFailureInput> = {},
): TestSessionFailureInput {
  return {
    checkId: "check_checkout",
    checkKey: "checkout",
    checkName: "Checkout",
    errorMessage: "Assertion failed",
    projectSlug: "account",
    runId: "run_1",
    status: "FAILED",
    ...overrides,
  };
}
