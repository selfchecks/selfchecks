const SENSITIVE =
  /authorization|cookie|password|passwd|secret|token|api[-_]?key|credential/i;
const CAPTURE_TRUNCATION = /\n\.\.\. truncated \d+ chars \.\.\.$/;
const OMITTED = "[OMITTED]";

export function omitBodyFromRunError(message: string): string {
  // The runner interpolates the full text body into this message.
  return message.startsWith("TEXT_BODY expected ")
    ? "TEXT_BODY assertion failed. See assertion results."
    : message;
}

function advertisesJson(headers: unknown): boolean {
  if (!headers || typeof headers !== "object") return false;
  return Object.entries(headers).some(
    ([name, value]) =>
      name.toLowerCase() === "content-type" &&
      typeof value === "string" &&
      /(?:\/|\+)json(?:\s*;|\s*$)|\/(?:x-ndjson|json-seq)(?:\s*;|\s*$)/i.test(value),
  );
}

function unsafeResponseBody(value: unknown, expectsJson: boolean): boolean {
  if (typeof value !== "string") return false;
  if (CAPTURE_TRUNCATION.test(value)) return true;
  const body = value.trim();
  const looksLikeJson =
    body.startsWith("{") ||
    body.startsWith('"') ||
    /^\[\s*(?:[[\]{"0-9-]|true|false|null|$)/.test(body);
  if (!body || (!expectsJson && !looksLikeJson)) return false;
  try {
    JSON.parse(body);
    return false;
  } catch {
    return true;
  }
}

export function omitUnsafeResponseBodies<T>(result: T): T {
  if (!result || typeof result !== "object" || Array.isArray(result)) return result;
  const capture = result as Record<string, unknown>;
  const expectsJson =
    advertisesJson(capture.headers) || advertisesJson(capture.responseHeaders);
  const omitBody = unsafeResponseBody(capture.body, expectsJson);
  const omitLegacyBody = unsafeResponseBody(capture.responseBody, expectsJson);
  const assertions = Array.isArray(capture.assertions) ? capture.assertions : undefined;
  const safeAssertions = assertions?.map((value: unknown) => {
    if (!value || typeof value !== "object") return value;
    const assertion = value as Record<string, unknown>;
    if (
      assertion.source === "TEXT_BODY" &&
      typeof assertion.actual === "string" &&
      (omitBody || omitLegacyBody || unsafeResponseBody(assertion.actual, expectsJson))
    ) {
      return { ...assertion, actual: OMITTED };
    }
    return value;
  });
  return {
    ...result,
    ...(omitBody ? { body: OMITTED } : {}),
    ...(omitLegacyBody ? { responseBody: OMITTED } : {}),
    ...(safeAssertions ? { assertions: safeAssertions } : {}),
  };
}

export function redactText(text: string): string {
  return text
    .replace(/((?:authorization|set-cookie|cookie)\s*:\s*)[^\r\n]+/gi, "$1[REDACTED]")
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/-]+=*/gi, "$1 [REDACTED]")
    .replace(/\bsck_[A-Za-z0-9_-]+/g, "[REDACTED]")
    .replace(/\bsco_(?:access|refresh|secret|code)_[A-Za-z0-9_-]+/g, "[REDACTED]")
    .replace(
      /((?:authorization|set-cookie|cookie|password|passwd|secret|token|api[-_]?key|credential)[\w-]*["']?\s*[:=]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s&,;\n]+)/gi,
      "$1[REDACTED]",
    )
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/g, "$1[REDACTED]@");
}

export function sanitize(value: unknown, depth = 0, truncate = true): unknown {
  if (depth > 12) return "[OMITTED]";
  if (typeof value === "string") {
    // JSON bodies need key-based redaction, including nested objects.
    try {
      const parsed: unknown = JSON.parse(value.trim());
      if (parsed && typeof parsed === "object")
        return JSON.stringify(sanitize(parsed, depth + 1, truncate));
    } catch {
      /* Plain text. */
    }
    const redacted = redactText(value);
    return truncate && redacted.length > 16_000
      ? `${redacted.slice(0, 16_000)}\n[TRUNCATED]`
      : redacted;
  }
  if (Array.isArray(value))
    return (truncate ? value.slice(0, 100) : value).map((item) =>
      sanitize(item, depth + 1, truncate),
    );
  if (value && typeof value === "object") {
    if (value instanceof Date) return value.toISOString();
    const object = value as Record<string, unknown>;
    // Headers may be stored as {name, value} entries.
    if (
      typeof object.name === "string" &&
      SENSITIVE.test(object.name) &&
      "value" in object
    ) {
      return { name: object.name, value: "[REDACTED]" };
    }
    const entries = Object.entries(object);
    return Object.fromEntries(
      (truncate ? entries.slice(0, 100) : entries).map(([key, item]) => [
        key,
        ["path", "logsPath", "rootDir", "workspacePath", "artifactOutputDir"].includes(
          key,
        )
          ? "[OMITTED]"
          : SENSITIVE.test(key)
            ? "[REDACTED]"
            : sanitize(
                key === "errorMessage" && typeof item === "string"
                  ? omitBodyFromRunError(item)
                  : item,
                depth + 1,
                truncate,
              ),
      ]),
    );
  }
  return value;
}

export function summarizeMetrics(
  runs: Array<{
    status: string;
    durationMs: number | null;
    result: unknown;
    retryGroupId?: string | null;
    attempt?: number;
  }>,
) {
  const completed = runs.filter((run) =>
    ["PASSED", "FAILED", "TIMED_OUT"].includes(run.status),
  );
  const percentile = (values: number[]) => {
    values.sort((a, b) => a - b);
    return values.length
      ? values[Math.max(0, Math.ceil(values.length * 0.95) - 1)]
      : null;
  };
  const duration = completed.flatMap((run) =>
    run.durationMs === null ? [] : [run.durationMs],
  );
  const http = completed.flatMap((run) => {
    const result = run.result as { responseTimeMs?: unknown } | null;
    return typeof result?.responseTimeMs === "number" ? [result.responseTimeMs] : [];
  });
  const browserTimings = Object.fromEntries(
    ["dclMs", "fcpMs", "lcpMs", "loadedMs", "tbtMs", "ttfbMs"].map((name) => {
      const values = completed.flatMap((run) => {
        const data = run.result as {
          performance?: { timings?: Record<string, unknown> };
        } | null;
        const value = data?.performance?.timings?.[name];
        return typeof value === "number" && Number.isFinite(value) ? [value] : [];
      });
      return [name, { sampleCount: values.length, p95: percentile(values) }];
    }),
  );
  const groups = new Map<string, typeof completed>();
  for (const run of completed) {
    if (run.retryGroupId)
      groups.set(run.retryGroupId, [...(groups.get(run.retryGroupId) ?? []), run]);
  }
  const recoveredRetryGroups = [...groups.values()].filter((group) =>
    group.some(
      (run) =>
        run.status === "PASSED" &&
        group.some(
          (earlier) =>
            earlier.status !== "PASSED" && (earlier.attempt ?? 1) < (run.attempt ?? 1),
        ),
    ),
  ).length;
  const passed = completed.filter((run) => run.status === "PASSED").length;
  return {
    completedRuns: completed.length,
    passedRuns: passed,
    checkPassRate: completed.length ? passed / completed.length : null,
    checkDurationMs: { sampleCount: duration.length, p95: percentile(duration) },
    apiResponseTimeMs: {
      sampleCount: http.length,
      p95: percentile(http),
      meaning: "Time to receive response headers, not full body download.",
    },
    browserTimingMs: browserTimings,
    retryEvidence: {
      recoveredRetryGroups,
      meaning:
        "Retry groups with a failed attempt followed by a pass within this sample. This is evidence of instability, not a confirmed flaky-test diagnosis.",
    },
    definition:
      "Check pass rate excludes queued, running and cancelled runs; it is not time-weighted service availability.",
  };
}
