"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  Bot,
  CheckSquare2,
  FlaskConical,
  LoaderCircle,
  RotateCcw,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";

import { CopyAnalysisButton } from "@/components/copy-analysis-button";
import type { DashboardRunState } from "@/lib/dashboard-types";
import type {
  TestSessionFailureCategory,
  TestSessionFailureSummary,
} from "@/lib/test-session-analysis";

type ProjectOption = {
  checkCount: number;
  name: string;
  slug: string;
};

type SessionAction = "full-regression" | "rerun-failed" | "rerun-session";

type SessionAnalysis = TestSessionFailureSummary & {
  analysis: {
    content?: string;
    createdAt?: string;
    error?: string;
    model?: string;
    responseLanguage?: string;
    status: "completed" | "failed" | "unavailable";
  };
};

export function SessionActions({
  attemptCount,
  failedCount,
  runState,
  sessionId,
}: {
  attemptCount: number;
  failedCount: number;
  runState: DashboardRunState;
  sessionId: string;
}) {
  const router = useRouter();
  const [actionInFlight, setActionInFlight] = useState<SessionAction | null>(null);
  const [analysis, setAnalysis] = useState<SessionAnalysis>();
  const [analysisError, setAnalysisError] = useState("");
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [expectedAttemptCount, setExpectedAttemptCount] = useState<number | null>(null);
  const [fullRegressionOpen, setFullRegressionOpen] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (expectedAttemptCount === null) {
      return;
    }

    const active = runState === "queued" || runState === "running";

    if (attemptCount >= expectedAttemptCount && !active) {
      setExpectedAttemptCount(null);
      return;
    }

    const interval = window.setInterval(() => router.refresh(), 2_500);

    return () => window.clearInterval(interval);
  }, [attemptCount, expectedAttemptCount, router, runState]);

  async function runAction(action: Exclude<SessionAction, "full-regression">) {
    setActionInFlight(action);
    setNotice("");

    try {
      const payload = await postSessionAction(sessionId, { action });

      setAnalysis(undefined);
      setExpectedAttemptCount(attemptCount + payload.runCount);
      setNotice(formatQueuedNotice(payload.runCount));
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setActionInFlight(null);
    }
  }

  async function openAnalysis() {
    setAnalysisOpen(true);

    if (analysis || analysisLoading) {
      return;
    }

    setAnalysisError("");
    setAnalysisLoading(true);

    try {
      setAnalysis(await loadSessionAnalysis(sessionId));
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : String(error));
    } finally {
      setAnalysisLoading(false);
    }
  }

  const analysisUnavailableReason =
    runState === "queued" || runState === "running"
      ? "AI analysis is available after every test in the session finishes."
      : failedCount === 0
        ? "This session has no failed tests to analyze."
        : undefined;

  return (
    <>
      <div className="flex max-w-full flex-wrap items-center justify-end gap-2">
        <button
          className="inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-cyan-900/80 bg-cyan-950/20 px-3 text-sm font-medium text-cyan-200 transition-colors hover:border-cyan-700 hover:bg-cyan-950/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 disabled:pointer-events-none disabled:opacity-45"
          disabled={Boolean(analysisUnavailableReason) || actionInFlight !== null}
          onClick={() => void openAnalysis()}
          title={analysisUnavailableReason}
          type="button"
        >
          {analysisLoading ? (
            <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" />
          ) : (
            <Bot className="h-4 w-4" />
          )}
          AI Analysis
        </button>
        <ActionButton
          disabled={actionInFlight !== null}
          icon={RotateCcw}
          loading={actionInFlight === "rerun-session"}
          onClick={() => void runAction("rerun-session")}
        >
          Rerun tests-session
        </ActionButton>
        <ActionButton
          disabled={failedCount === 0 || actionInFlight !== null}
          icon={AlertCircle}
          loading={actionInFlight === "rerun-failed"}
          onClick={() => void runAction("rerun-failed")}
          title={failedCount === 0 ? "This session has no failed tests." : undefined}
        >
          Rerun failed tests
        </ActionButton>
        <button
          className="inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-blue-600 px-3 text-sm font-medium text-white transition-colors hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:pointer-events-none disabled:opacity-50"
          disabled={actionInFlight !== null}
          onClick={() => setFullRegressionOpen(true)}
          type="button"
        >
          <FlaskConical className="h-4 w-4" />
          Make full regress
        </button>
      </div>

      {notice
        ? createPortal(
            <div
              className="fixed bottom-4 right-4 z-[60] max-w-md rounded-md border border-slate-700 bg-[#12171f] px-4 py-3 text-sm text-slate-300 shadow-xl shadow-black/30"
              role="status"
            >
              {notice}
            </div>,
            document.body,
          )
        : null}

      {fullRegressionOpen ? (
        <FullRegressionDialog
          onClose={() => setFullRegressionOpen(false)}
          onQueued={(runCount, nextSessionId) => {
            setFullRegressionOpen(false);
            setNotice(formatQueuedNotice(runCount));
            router.push(`/test-sessions/${encodeURIComponent(nextSessionId)}`);
          }}
          sessionId={sessionId}
        />
      ) : null}

      {analysisOpen ? (
        <SessionAnalysisDrawer
          analysis={analysis}
          error={analysisError}
          loading={analysisLoading}
          onClose={() => setAnalysisOpen(false)}
          sessionId={sessionId}
        />
      ) : null}
    </>
  );
}

function ActionButton({
  children,
  disabled = false,
  icon: Icon,
  loading,
  onClick,
  title,
}: {
  children: string;
  disabled?: boolean;
  icon: typeof RotateCcw;
  loading: boolean;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      className="inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-slate-700 bg-[#111821] px-3 text-sm font-medium text-slate-200 transition-colors hover:border-slate-600 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:pointer-events-none disabled:opacity-45"
      disabled={disabled || loading}
      onClick={onClick}
      title={title}
      type="button"
    >
      {loading ? (
        <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" />
      ) : (
        <Icon className="h-4 w-4" />
      )}
      {children}
    </button>
  );
}

function SessionAnalysisDrawer({
  analysis,
  error,
  loading,
  onClose,
  sessionId,
}: {
  analysis?: SessionAnalysis;
  error: string;
  loading: boolean;
  onClose: () => void;
  sessionId: string;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const meta = [
    analysis?.analysis.model,
    analysis?.analysis.responseLanguage,
    analysis?.analysis.createdAt
      ? new Date(analysis.analysis.createdAt).toLocaleString()
      : undefined,
  ].filter(Boolean);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/65 backdrop-blur-[1px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <aside
        aria-labelledby="test-session-ai-analysis-title"
        aria-modal="true"
        className="flex h-full w-full flex-col border-l border-slate-700 bg-[#0d1117] shadow-2xl shadow-black/60 md:w-1/2"
        role="dialog"
      >
        <header className="flex items-start gap-3 border-b border-slate-800 px-6 py-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cyan-950 text-cyan-300">
            <Bot className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2
              className="text-lg font-semibold text-slate-100"
              id="test-session-ai-analysis-title"
            >
              AI analysis
            </h2>
            <div className="mt-0.5 text-sm text-slate-400">
              Failed tests in this test session
            </div>
          </div>
          {analysis ? (
            <CopyAnalysisButton text={formatAnalysisForCopy(analysis)} />
          ) : null}
          <button
            aria-label="Close AI analysis"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-100"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {loading ? (
            <div
              className="flex min-h-48 items-center justify-center gap-2 rounded-md border border-slate-800 bg-[#111821] text-sm text-slate-400"
              role="status"
            >
              <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" />
              Analyzing failed tests…
            </div>
          ) : error ? (
            <div
              className="rounded-md border border-red-900/70 bg-red-950/30 p-5 text-sm leading-6 text-red-100"
              role="alert"
            >
              {error}
            </div>
          ) : analysis ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-slate-300">
                  <span className="font-semibold text-slate-100">
                    {analysis.failedCount}
                  </span>{" "}
                  failed {analysis.failedCount === 1 ? "test" : "tests"}
                </div>
                <div className="break-all text-xs text-slate-500">
                  {meta.join(" · ")}
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-5">
                {analysis.categories.map((category) => (
                  <div
                    className="rounded-md border border-slate-800 bg-[#111821] p-3"
                    key={category.key}
                  >
                    <div className="text-2xl font-semibold text-slate-100">
                      {category.count}
                    </div>
                    <div className="mt-1 text-xs text-slate-400">{category.label}</div>
                  </div>
                ))}
              </div>

              {analysis.analysis.content ? (
                <pre className="mt-5 whitespace-pre-wrap break-words rounded-md border border-cyan-950/70 bg-[#111821] p-5 font-sans text-sm leading-6 text-slate-200">
                  {analysis.analysis.content}
                </pre>
              ) : analysis.analysis.error ? (
                <div className="mt-5 rounded-md border border-amber-900/70 bg-amber-950/30 p-4 text-sm leading-6 text-amber-100">
                  {analysis.analysis.error}
                </div>
              ) : null}

              <div className="mt-6 space-y-4">
                {analysis.categories
                  .filter((category) => category.count > 0)
                  .map((category) => (
                    <FailureCategorySection
                      category={category}
                      key={category.key}
                      sessionId={sessionId}
                    />
                  ))}
              </div>
            </>
          ) : null}
        </div>
      </aside>
    </div>,
    document.body,
  );
}

function FailureCategorySection({
  category,
  sessionId,
}: {
  category: TestSessionFailureCategory;
  sessionId: string;
}) {
  return (
    <section className="overflow-hidden rounded-md border border-slate-800 bg-[#111821]">
      <header className="border-b border-slate-800 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-medium text-slate-100">{category.label}</h3>
          <span className="rounded bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-300">
            {category.count}
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-500">{category.description}</p>
      </header>
      <ul className="divide-y divide-slate-800">
        {category.tests.map((test) => (
          <li className="px-4 py-3" key={test.runId}>
            <a
              className="text-sm font-medium text-blue-300 hover:text-blue-200"
              href={`/test-sessions/${encodeURIComponent(
                sessionId,
              )}/checks/${encodeURIComponent(test.checkId ?? test.checkKey)}`}
            >
              {test.checkName}
            </a>
            <div className="mt-0.5 text-xs text-slate-500">
              {test.projectSlug} · {test.status.toLowerCase().replaceAll("_", " ")}
            </div>
            {test.errorMessage ? (
              <div className="mt-2 line-clamp-3 whitespace-pre-wrap break-words text-xs leading-5 text-slate-400">
                {test.errorMessage}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function FullRegressionDialog({
  onClose,
  onQueued,
  sessionId,
}: {
  onClose: () => void;
  onQueued: (runCount: number, sessionId: string) => void;
  sessionId: string;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [running, setRunning] = useState(false);
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const controller = new AbortController();

    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleEscape);
    void loadProjects(sessionId, controller.signal)
      .then(setProjects)
      .catch((loadError) => {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => {
      controller.abort();
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose, sessionId]);

  function toggleProject(slug: string) {
    setSelectedProjects((current) =>
      current.includes(slug)
        ? current.filter((projectSlug) => projectSlug !== slug)
        : [...current, slug],
    );
    setError("");
  }

  async function runTests() {
    if (selectedProjects.length === 0) {
      setError("Select at least one project.");
      return;
    }

    setError("");
    setRunning(true);

    try {
      const payload = await postSessionAction(sessionId, {
        action: "full-regression",
        projectSlugs: selectedProjects,
      });

      onQueued(payload.runCount, payload.sessionId);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : String(runError));
      setRunning(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        aria-labelledby="full-regression-title"
        aria-modal="true"
        className="flex max-h-[min(42rem,calc(100vh-2rem))] w-full max-w-xl flex-col overflow-hidden rounded-lg border border-slate-700 bg-[#111821] shadow-2xl shadow-black/60"
        role="dialog"
      >
        <header className="flex items-start gap-4 border-b border-slate-800 px-6 py-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-blue-950 text-blue-300">
            <CheckSquare2 className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2
              className="text-lg font-semibold text-slate-100"
              id="full-regression-title"
            >
              Make full regress
            </h2>
            <p className="mt-1 text-sm leading-5 text-slate-400">
              Choose projects to run against this session&apos;s version and deployment.
            </p>
          </div>
          <button
            aria-label="Close full regression"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-100"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Projects
            </span>
            {projects.length > 0 ? (
              <button
                className="text-xs font-medium text-blue-300 hover:text-blue-200"
                onClick={() =>
                  setSelectedProjects(
                    selectedProjects.length === projects.length
                      ? []
                      : projects.map((project) => project.slug),
                  )
                }
                type="button"
              >
                {selectedProjects.length === projects.length
                  ? "Clear all"
                  : "Select all"}
              </button>
            ) : null}
          </div>

          {loading ? (
            <div className="flex min-h-36 items-center justify-center gap-2 rounded-md border border-slate-800 bg-[#0d141c] text-sm text-slate-400">
              <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" />
              Loading projects…
            </div>
          ) : projects.length > 0 ? (
            <div className="space-y-2">
              {projects.map((project) => (
                <label
                  className="flex cursor-pointer items-center gap-3 rounded-md border border-slate-800 bg-[#0d141c] px-4 py-3 transition-colors hover:border-slate-700 hover:bg-slate-900/70 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-400"
                  key={project.slug}
                >
                  <input
                    checked={selectedProjects.includes(project.slug)}
                    className="h-4 w-4 shrink-0 rounded border-slate-600 bg-slate-900 accent-blue-500 focus-visible:outline-none"
                    onChange={() => toggleProject(project.slug)}
                    type="checkbox"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-200">
                      {project.name}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500">
                      {project.slug}
                    </span>
                  </span>
                  <span className="shrink-0 rounded border border-slate-700 px-2 py-1 text-xs text-slate-400">
                    {project.checkCount} {project.checkCount === 1 ? "test" : "tests"}
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-slate-800 bg-[#0d141c] px-4 py-8 text-center text-sm text-slate-400">
              No projects with enabled tests were found.
            </div>
          )}

          {error ? (
            <div
              className="mt-4 flex items-start gap-2 rounded-md border border-red-900/80 bg-red-950/30 px-3 py-2.5 text-sm text-red-200"
              role="alert"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </div>
          ) : null}
        </div>

        <footer className="flex items-center justify-between gap-4 border-t border-slate-800 px-6 py-4">
          <span className="text-xs text-slate-500">
            {selectedProjects.length} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              className="inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-slate-100"
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:pointer-events-none disabled:opacity-45"
              disabled={
                loading ||
                running ||
                projects.length === 0 ||
                selectedProjects.length === 0
              }
              onClick={() => void runTests()}
              type="button"
            >
              {running ? (
                <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" />
              ) : null}
              Run tests
            </button>
          </div>
        </footer>
      </section>
    </div>,
    document.body,
  );
}

async function loadProjects(sessionId: string, signal: AbortSignal) {
  const response = await fetch(
    `/api/test-sessions/${encodeURIComponent(sessionId)}/runs`,
    { signal },
  );
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    projects?: ProjectOption[];
  };

  if (!response.ok) {
    throw new Error(payload.error ?? "Unable to load projects.");
  }

  return payload.projects ?? [];
}

async function loadSessionAnalysis(sessionId: string): Promise<SessionAnalysis> {
  const response = await fetch(
    `/api/test-sessions/${encodeURIComponent(sessionId)}/analysis`,
    { method: "POST" },
  );
  const payload = (await response.json().catch(() => ({}))) as Partial<
    SessionAnalysis & { error: string }
  >;

  if (
    !response.ok ||
    !payload.analysis ||
    !Array.isArray(payload.categories) ||
    typeof payload.failedCount !== "number"
  ) {
    throw new Error(payload.error ?? "Unable to analyze this test session.");
  }

  return payload as SessionAnalysis;
}

async function postSessionAction(
  sessionId: string,
  body:
    | { action: "full-regression"; projectSlugs: string[] }
    | { action: "rerun-failed" | "rerun-session" },
) {
  const response = await fetch(
    `/api/test-sessions/${encodeURIComponent(sessionId)}/runs`,
    {
      body: JSON.stringify(body),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    },
  );
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    runCount?: number;
    sessionId?: string;
  };

  if (!response.ok || !payload.sessionId || typeof payload.runCount !== "number") {
    throw new Error(payload.error ?? "Unable to queue tests.");
  }

  return {
    runCount: payload.runCount,
    sessionId: payload.sessionId,
  };
}

function formatQueuedNotice(runCount: number) {
  return `${runCount} ${runCount === 1 ? "test" : "tests"} queued.`;
}

function formatAnalysisForCopy(analysis: SessionAnalysis) {
  const categories = analysis.categories
    .map((category) => {
      const tests = category.tests
        .map((test) => `  - ${test.projectSlug}/${test.checkName}`)
        .join("\n");

      return `${category.label}: ${category.count}${tests ? `\n${tests}` : ""}`;
    })
    .join("\n");

  return [
    `Failed tests: ${analysis.failedCount}`,
    categories,
    analysis.analysis.content,
    analysis.analysis.error,
  ]
    .filter(Boolean)
    .join("\n\n");
}
