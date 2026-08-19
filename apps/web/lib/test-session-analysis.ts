export type TestSessionFailureCategoryKey =
  | "screenshot"
  | "timeout"
  | "locator"
  | "element"
  | "other";

export type TestSessionFailureInput = {
  checkId?: string;
  checkKey: string;
  checkName: string;
  errorMessage?: string | null;
  projectSlug: string;
  result?: unknown;
  runId: string;
  status: string;
};

export type TestSessionFailureItem = Omit<TestSessionFailureInput, "result"> & {
  category: TestSessionFailureCategoryKey;
};

export type TestSessionFailureCategory = {
  count: number;
  description: string;
  key: TestSessionFailureCategoryKey;
  label: string;
  tests: TestSessionFailureItem[];
};

export type TestSessionFailureSummary = {
  categories: TestSessionFailureCategory[];
  failedCount: number;
};

export const TEST_SESSION_FAILURE_CLASSIFIER_VERSION = 2;

const CATEGORY_DEFINITIONS: Array<
  Pick<TestSessionFailureCategory, "description" | "key" | "label">
> = [
  {
    description: "Visual or reference screenshot differences.",
    key: "screenshot",
    label: "Screenshots",
  },
  {
    description: "Execution, assertion, navigation, or waiting timeouts.",
    key: "timeout",
    label: "Timeouts",
  },
  {
    description: "Selectors or locators resolved to an unexpected target.",
    key: "locator",
    label: "Locator mismatch",
  },
  {
    description: "The expected element was missing, detached, or not visible.",
    key: "element",
    label: "Element not found",
  },
  {
    description: "Failures that do not match the common categories above.",
    key: "other",
    label: "Other",
  },
];

const SCREENSHOT_PATTERN =
  /\b(tohavescreenshot|screenshot|snapshot|visual (?:comparison|difference|regression)|pixel(?:s|match)?|baseline image|image comparison)\b/i;
const SCREENSHOT_MISMATCH_PATTERNS = [
  /\btohavescreenshot\b/i,
  /\b(?:screenshot|image) (?:comparison )?(?:failed|mismatch|differ(?:ed|ence|ent|s)?)\b/i,
  /\bpixels?\b[^\n]{0,160}\b(?:different|differ(?:ed|ent|s)?)\b/i,
  /\bexpected an image\b[^\n]{0,160}\breceived\b/i,
  /\bbaseline image\b[^\n]{0,160}\b(?:different|differ(?:ed|ent|s)?|mismatch)\b/i,
];
const TIMEOUT_PATTERN =
  /\b(timeout|timed out|time limit|test timeout|exceeded.*(?:ms|seconds?|minutes?))\b/i;
const LOCATOR_PATTERN =
  /\b(strict mode violation|locator mismatch|locator resolved to|selector mismatch|selector engine|unexpected locator|invalid selector)\b/i;
const ELEMENT_PATTERN =
  /\b(element(?:\(s\)|s)? (?:was |were )?not found|no element|unable to find|could not find|failed to find|not attached|detached from|not visible|waiting for (?:an? )?(?:element|selector|locator))\b/i;

export function summarizeTestSessionFailures(
  failures: TestSessionFailureInput[],
): TestSessionFailureSummary {
  const items = failures.map((failure) => ({
    checkId: failure.checkId,
    checkKey: failure.checkKey,
    checkName: failure.checkName,
    errorMessage: failure.errorMessage,
    projectSlug: failure.projectSlug,
    runId: failure.runId,
    status: failure.status,
    category: classifyTestSessionFailure(failure),
  }));

  return {
    categories: CATEGORY_DEFINITIONS.map((definition) => {
      const tests = items
        .filter((item) => item.category === definition.key)
        .sort((left, right) =>
          `${left.projectSlug}/${left.checkName}`.localeCompare(
            `${right.projectSlug}/${right.checkName}`,
          ),
        );

      return {
        ...definition,
        count: tests.length,
        tests,
      };
    }),
    failedCount: items.length,
  };
}

export function classifyTestSessionFailure(
  failure: TestSessionFailureInput,
): TestSessionFailureCategoryKey {
  const resultText = stringifyResultWithoutAiAnalysis(failure.result);
  const evidence = `${failure.errorMessage ?? ""}\n${resultText}`;

  if (SCREENSHOT_MISMATCH_PATTERNS.some((pattern) => pattern.test(evidence))) {
    return "screenshot";
  }

  if (failure.status === "TIMED_OUT" || TIMEOUT_PATTERN.test(evidence)) {
    return "timeout";
  }

  if (SCREENSHOT_PATTERN.test(evidence)) {
    return "screenshot";
  }

  if (LOCATOR_PATTERN.test(evidence)) {
    return "locator";
  }

  if (ELEMENT_PATTERN.test(evidence)) {
    return "element";
  }

  return "other";
}

function stringifyResultWithoutAiAnalysis(result: unknown) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return stringifyUnknown(result);
  }

  const { aiAnalysis: _aiAnalysis, ...failureResult } = result as Record<
    string,
    unknown
  >;

  return stringifyUnknown(failureResult);
}

function stringifyUnknown(value: unknown) {
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return "";
  }
}
