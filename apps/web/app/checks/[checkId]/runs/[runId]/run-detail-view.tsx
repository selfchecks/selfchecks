import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  CircleX,
  Download,
  ExternalLink,
  FileArchive,
  FileImage,
  FileJson,
  FileText,
  Folder,
  History,
  Play,
  Video,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import type { RunDetailData } from "@/lib/dashboard-data";
import type {
  DashboardRunArtifact,
  DashboardRunState,
  DashboardStatus,
} from "@/lib/dashboard-types";
import { cn } from "@/lib/utils";
import { DetailSidebar } from "@/app/checks/detail-sidebar";

import {
  ScreenshotComparisonPanel,
  type ScreenshotComparison,
} from "./screenshot-comparison-slider";
import { ArtifactTextPreview } from "./artifact-text-preview";

type RunDetailViewProps = {
  accountLabel: string;
  detail: RunDetailData;
};

type PageNavigationEntry = {
  id: string;
  method?: string;
  requestBody?: string;
  responseBody?: string;
  statusCode?: string;
  statusText?: string;
  tone: DashboardStatus;
  url: string;
};

const runStateLabels: Record<DashboardRunState, string> = {
  cancelled: "Cancelled",
  failed: "Failed",
  not_run: "Not run",
  passed: "Passed",
  queued: "Queued",
  running: "Running",
  timed_out: "Timed out",
};

export function RunDetailView({ accountLabel, detail }: RunDetailViewProps) {
  const { check, run } = detail;
  const checkHref = `/checks/${encodeURIComponent(check.id)}`;
  const statusCode = getResultField(run.resultFields, "Status");
  const statusText = getResultField(run.resultFields, "Status Text");
  const command = getResultField(run.resultFields, "Command");
  const navigationEntries = buildPageNavigations(run);
  const failedAttemptCount = run.failedAttempts;
  const totalAttemptCount = Math.max(run.maxAttempts, run.attempts.length);
  const showResultData =
    check.type === "api" && (Boolean(run.response) || !run.aiAnalysis);
  const showDataPanels = Boolean(run.request) || showResultData;
  const target = run.request
    ? `${run.request.method} ${run.request.url}`
    : (command ?? check.settings.entrypoint ?? "No request data recorded");

  return (
    <main className="min-h-screen bg-[#0d1117] text-slate-200">
      <DetailSidebar accountLabel={accountLabel} projectSlug={detail.projectSlug} />

      <div className="min-h-screen xl:pl-72">
        <header className="sticky top-0 z-30 border-b border-slate-800 bg-[#12171f]/95 backdrop-blur">
          <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3 text-sm text-slate-400">
              <Link
                aria-label="Back to check"
                className="flex h-9 w-9 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                href={checkHref}
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <span className="hidden truncate sm:inline">{accountLabel}</span>
              <span className="text-slate-600">/</span>
              <span className="inline-flex min-w-0 items-center gap-2 truncate">
                <Folder className="h-4 w-4 shrink-0" />
                {detail.groupName}
              </span>
              <span className="text-slate-600">/</span>
              <Link
                className="inline-flex min-w-0 items-center gap-2 truncate text-slate-300 hover:text-slate-100"
                href={checkHref}
              >
                <span className="rounded border border-slate-600 px-1 text-[10px] font-bold uppercase">
                  {check.type}
                </span>
                {check.name}
              </Link>
              <span className="text-slate-600">/</span>
              <span className="truncate text-slate-200">Check run</span>
            </div>
            <Link
              className="hidden h-10 items-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-500 sm:inline-flex"
              href={checkHref}
            >
              Open check
            </Link>
          </div>
        </header>

        <div className="grid min-h-[calc(100vh-4rem)] lg:grid-cols-[20rem_minmax(0,1fr)]">
          <aside className="border-b border-slate-800 bg-[#10151c] lg:border-b-0 lg:border-r">
            <div className="sticky top-16">
              <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
                <div className="text-xs font-semibold uppercase text-slate-500">
                  Check report
                </div>
                <History className="h-4 w-4 text-slate-500" />
              </div>
              <div className="grid">
                {run.attempts.map((attempt) => (
                  <Link
                    aria-current={attempt.isCurrent ? "page" : undefined}
                    className={cn(
                      "flex min-w-0 items-center gap-3 border-b border-slate-800 px-5 py-4 text-left text-sm",
                      attempt.isCurrent
                        ? "border-l-4 border-l-blue-500 bg-slate-800/60 pl-4 text-slate-100"
                        : "border-l-4 border-l-transparent text-slate-300 hover:bg-slate-800/50 hover:text-slate-100",
                    )}
                    href={attempt.href}
                    key={attempt.id}
                  >
                    <CheckStatusIcon
                      compact
                      runState={attempt.runState}
                      status={attempt.status}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">
                        {attempt.label}
                      </span>
                      <span className="mt-1 block truncate text-xs text-slate-500">
                        {attempt.createdAtLabel}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-slate-500">
                      {attempt.duration}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </aside>

          <section className="min-w-0 px-4 py-6 sm:px-6 lg:px-8">
            <div className="mx-auto flex max-w-[1440px] flex-col gap-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-4">
                  <CheckStatusIcon runState={run.runState} status={run.status} />
                  <div className="min-w-0">
                    <div className="mb-2 inline-flex rounded border border-slate-700 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-400">
                      {check.type}
                    </div>
                    <h1 className="truncate text-3xl font-semibold text-slate-100">
                      {check.name}
                    </h1>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-base text-slate-400">
                      <span>
                        {runStateLabels[run.runState]} at {run.createdAtLabel}
                      </span>
                      <span className="text-slate-600">•</span>
                      <span>{run.runner}</span>
                      {check.tags.map((tag) => (
                        <span
                          className="rounded bg-slate-700 px-2 py-1 text-xs font-semibold text-slate-300"
                          key={tag}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="min-w-0 text-right text-sm text-slate-400">
                  <div>Project {detail.projectSlug}</div>
                  <div className="mt-1 flex flex-wrap items-center justify-end gap-2">
                    <span>
                      {failedAttemptCount}/{totalAttemptCount} failed
                    </span>
                    <span className="rounded-md border border-slate-700 px-3 py-1 text-slate-200">
                      Attempt #{run.attemptNumber} of {totalAttemptCount}
                    </span>
                  </div>
                </div>
              </div>

              <section>
                <div className="flex flex-wrap items-center gap-3 rounded-md border border-slate-700 bg-slate-800 px-4 py-3">
                  {run.request ? (
                    <span className="rounded bg-blue-600 px-2 py-1 text-xs font-bold uppercase text-white">
                      {run.request.method}
                    </span>
                  ) : null}
                  <span
                    className="min-w-0 flex-1 truncate text-slate-100"
                    title={target}
                  >
                    {target}
                  </span>
                  {statusCode ? (
                    <span
                      className={cn(
                        "rounded px-2 py-1 text-xs font-bold",
                        run.status === "passing"
                          ? "bg-emerald-700 text-emerald-100"
                          : "bg-red-700 text-red-100",
                      )}
                    >
                      {statusCode}
                    </span>
                  ) : null}
                  {statusText ? (
                    <span className="text-sm text-slate-400">{statusText}</span>
                  ) : null}
                  <span className="text-sm font-semibold text-slate-200">
                    {run.duration}
                  </span>
                </div>
              </section>

              <RunSummaryMetrics run={run} />

              {run.errorMessage ? (
                <section className="rounded-md border border-red-900/70 bg-red-950/20 p-5">
                  <h2 className="text-lg font-semibold text-red-100">Error</h2>
                  <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded bg-[#0b0f14] p-4 text-sm text-red-100">
                    {run.errorMessage}
                  </pre>
                </section>
              ) : null}

              {run.aiAnalysis ? <AiAnalysisPanel analysis={run.aiAnalysis} /> : null}

              <PlaywrightReportPanel
                checkName={check.name}
                checkType={check.type}
                run={run}
              />
              {check.type === "api" ? (
                <PageNavigationsPanel entries={navigationEntries} />
              ) : null}
              {run.request?.assertions.length ? (
                <AssertionsTable assertions={run.request.assertions} />
              ) : null}

              {showDataPanels ? (
                <section
                  className={cn(
                    "grid min-w-0 gap-5",
                    run.request ? "xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" : "",
                  )}
                >
                  {run.request ? <RequestDataPanel request={run.request} /> : null}
                  {showResultData ? (
                    <ResponseDataPanel
                      response={run.response}
                      resultFields={run.resultFields}
                      resultJson={run.resultJson}
                    />
                  ) : null}
                </section>
              ) : null}

              {run.jobLog ? (
                <section className="rounded-md border border-slate-800 bg-[#111821]">
                  <div className="border-b border-slate-800 px-4 py-3 text-sm font-semibold text-slate-100">
                    Job log
                  </div>
                  <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-words p-4 text-sm text-slate-300">
                    {run.jobLog}
                  </pre>
                </section>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function AiAnalysisPanel({
  analysis,
}: {
  analysis: NonNullable<RunDetailData["run"]["aiAnalysis"]>;
}) {
  const meta = [
    analysis.model,
    analysis.responseLanguage,
    analysis.apiEndpoint,
    analysis.createdAt,
  ].filter(Boolean);

  return (
    <section
      className={cn(
        "rounded-md border bg-[#111821] p-5",
        analysis.status === "completed" ? "border-cyan-900/70" : "border-amber-900/70",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-100">
            <Bot className="h-5 w-5 text-cyan-300" />
            AI analysis
          </h2>
          {meta.length > 0 ? (
            <div className="mt-1 break-all text-xs text-slate-500">
              {meta.join(" · ")}
            </div>
          ) : null}
        </div>
        <span
          className={cn(
            "rounded px-2 py-1 text-xs font-semibold uppercase",
            analysis.status === "completed"
              ? "bg-cyan-950 text-cyan-200"
              : "bg-amber-950 text-amber-200",
          )}
        >
          {analysis.status}
        </span>
      </div>

      {analysis.content ? (
        <pre className="mt-4 max-h-[32rem] overflow-auto whitespace-pre-wrap break-words rounded bg-[#0b0f14] p-4 text-sm text-slate-200">
          {analysis.content}
        </pre>
      ) : (
        <div className="mt-4 rounded bg-[#0b0f14] p-4 text-sm text-amber-100">
          {analysis.error}
        </div>
      )}
    </section>
  );
}

function RunSummaryMetrics({ run }: { run: RunDetailData["run"] }) {
  const errorCounts = run.performance?.errors;

  return (
    <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
      <ReportMetric label="Check Duration" value={run.duration} />
      <ReportMetric
        label="Console Errors"
        value={String(errorCounts?.consoleErrors ?? 0)}
      />
      <ReportMetric
        label="Network Errors"
        value={String(errorCounts?.networkErrors ?? 0)}
      />
      <ReportMetric
        label="Script Errors"
        value={String(errorCounts?.scriptErrors ?? 0)}
      />
    </section>
  );
}

function ReportMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-sm font-medium text-slate-500">
        {label}
        <span
          aria-hidden="true"
          className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-600 text-[10px] font-bold"
        >
          ?
        </span>
      </div>
      <div
        className="mt-2 truncate text-3xl font-semibold text-slate-100"
        title={value}
      >
        {value}
      </div>
    </div>
  );
}

function PlaywrightReportPanel({
  checkName,
  checkType,
  run,
}: {
  checkName: string;
  checkType: RunDetailData["check"]["type"];
  run: RunDetailData["run"];
}) {
  const hasBrowserArtifacts = run.artifacts.some((artifact) =>
    ["screenshot", "trace", "video"].includes(artifact.type),
  );
  const screenshotComparisons = buildScreenshotComparisons(run.artifacts);
  const title =
    checkType === "browser" || hasBrowserArtifacts
      ? "Playwright test report"
      : "Run report";

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-3 text-xl font-semibold text-slate-100">
          <FileText className="h-5 w-5 text-emerald-400" />
          {title}
        </h2>
      </div>

      <details
        className="group overflow-hidden rounded-md border border-slate-700 bg-[#111821]"
        open
      >
        <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-4 hover:bg-slate-800/60">
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-500 transition-transform group-open:rotate-90" />
          <CheckStatusIcon compact runState={run.runState} status={run.status} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-semibold text-slate-100">
              {checkName}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span>{run.startedAt}</span>
              <span className="text-slate-700">•</span>
              <span>{run.runner}</span>
            </div>
          </div>
          <span className="shrink-0 text-sm font-medium text-slate-400">
            {run.duration}
          </span>
        </summary>
        <div className="grid gap-4 border-t border-slate-800 px-4 py-4">
          <div className="grid gap-3 text-sm md:grid-cols-3">
            <DetailRow label="Started" value={run.startedAt} />
            <DetailRow label="Finished" value={run.finishedAt} />
            <DetailRow label="Run" value={run.id} />
          </div>
          <ScreenshotComparisonPanel comparisons={screenshotComparisons} />
          <ArtifactList artifacts={run.artifacts} />
        </div>
      </details>
    </section>
  );
}

function PageNavigationsPanel({ entries }: { entries: PageNavigationEntry[] }) {
  return (
    <section className="grid gap-4">
      <h2 className="text-xl font-semibold text-slate-100">Page navigations</h2>
      <div className="grid gap-3">
        {entries.length > 0 ? (
          entries.map((entry) => (
            <details
              className="group overflow-hidden rounded-md border border-slate-700 bg-[#111821]"
              key={entry.id}
            >
              <summary
                aria-label={`Toggle navigation ${entry.url}`}
                className="flex cursor-pointer list-none items-center gap-3 px-4 py-4 hover:bg-slate-800/60"
              >
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-500 transition-transform group-open:rotate-90" />
                <CheckStatusIcon compact runState="passed" status={entry.tone} />
                <span
                  className="min-w-0 flex-1 truncate text-slate-300"
                  title={entry.url}
                >
                  {entry.url}
                </span>
                {entry.statusCode ? (
                  <span
                    className={cn(
                      "shrink-0 rounded px-2 py-1 text-xs font-bold",
                      entry.tone === "passing"
                        ? "bg-emerald-700 text-emerald-100"
                        : "bg-red-800 text-red-100",
                    )}
                  >
                    {entry.statusCode}
                  </span>
                ) : null}
              </summary>
              <div className="grid gap-4 border-t border-slate-800 px-4 py-4 text-sm md:grid-cols-2">
                <div className="grid gap-3">
                  <DetailRow label="URL" value={entry.url} />
                  {entry.method ? (
                    <DetailRow label="Method" value={entry.method} />
                  ) : null}
                  {entry.requestBody ? (
                    <CodeBlock label="Request body" value={entry.requestBody} />
                  ) : null}
                </div>
                <div className="grid gap-3">
                  {entry.statusCode ? (
                    <DetailRow
                      label="Status"
                      value={
                        entry.statusText
                          ? `${entry.statusCode} ${entry.statusText}`
                          : entry.statusCode
                      }
                    />
                  ) : null}
                  {entry.responseBody ? (
                    <CodeBlock label="Response body" value={entry.responseBody} />
                  ) : (
                    <div className="text-slate-500">No response body recorded.</div>
                  )}
                </div>
              </div>
            </details>
          ))
        ) : (
          <div className="rounded-md border border-slate-800 bg-[#111821] px-4 py-5 text-sm text-slate-500">
            No page navigations recorded for this run.
          </div>
        )}
      </div>
    </section>
  );
}

function AssertionsTable({
  assertions,
}: {
  assertions: NonNullable<RunDetailData["run"]["request"]>["assertions"];
}) {
  return (
    <section className="overflow-hidden rounded-md border border-slate-800 bg-[#111821]">
      <div className="border-b border-slate-800 px-4 py-3 text-sm font-semibold text-slate-100">
        Assertions
      </div>
      {assertions.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-[#121820] text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Comparison</th>
                <th className="px-4 py-3">Target</th>
                <th className="px-4 py-3">Actual</th>
              </tr>
            </thead>
            <tbody>
              {assertions.map((assertion, index) => (
                <tr
                  className="border-t border-slate-800"
                  key={`${assertion.source}-${index}`}
                >
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-3 text-slate-200">
                      <AssertionStatusIcon passed={assertion.passed} />
                      {assertion.source}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-300">{assertion.comparison}</td>
                  <td className="px-4 py-3 text-slate-300">{assertion.target}</td>
                  <td className="px-4 py-3 text-slate-300">{assertion.actual}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="px-4 py-5 text-sm text-slate-500">
          No assertions recorded for this run.
        </div>
      )}
    </section>
  );
}

function RequestDataPanel({ request }: { request: RunDetailData["run"]["request"] }) {
  return (
    <section className="min-w-0 rounded-md border border-slate-800 bg-[#111821]">
      <div className="border-b border-slate-800 px-4 py-3 text-sm font-semibold text-slate-100">
        Request data
      </div>
      {request ? (
        <div className="grid min-w-0 gap-5 p-4 text-sm">
          <DetailRow label="URL" value={request.url} />
          <DetailRow label="Method" value={request.method} />
          <KeyValueList
            emptyLabel="No headers."
            items={request.headers}
            title="Headers"
          />
          <KeyValueList
            emptyLabel="No query params."
            items={request.queryParams}
            title="Query params"
          />
          <CodeBlock label="Body" value={request.body ?? "No request body."} />
        </div>
      ) : (
        <div className="px-4 py-5 text-sm text-slate-500">
          No request data recorded for this run.
        </div>
      )}
    </section>
  );
}

function ResponseDataPanel({
  response,
  resultFields,
  resultJson,
}: {
  response: RunDetailData["run"]["response"];
  resultFields: RunDetailData["run"]["resultFields"];
  resultJson: string;
}) {
  if (response) {
    const statusValue =
      response.status && response.statusText
        ? `${response.status} ${response.statusText}`
        : (response.status ?? response.statusText);

    return (
      <section className="min-w-0 rounded-md border border-slate-800 bg-[#111821]">
        <div className="border-b border-slate-800 px-4 py-3 text-sm font-semibold text-slate-100">
          Response data
        </div>
        <div className="grid min-w-0 gap-5 p-4 text-sm">
          {response.url ? <DetailRow label="URL" value={response.url} /> : null}
          {statusValue ? <DetailRow label="Status" value={statusValue} /> : null}
          <KeyValueList
            emptyLabel="No response headers."
            items={response.headers}
            title="Headers"
          />
          <CodeBlock label="Body" value={response.body ?? "No response body."} />
          <CodeBlock label="Raw result" value={resultJson} />
        </div>
      </section>
    );
  }

  return (
    <section className="min-w-0 rounded-md border border-slate-800 bg-[#111821]">
      <div className="border-b border-slate-800 px-4 py-3 text-sm font-semibold text-slate-100">
        Result data
      </div>
      <div className="grid min-w-0 gap-5 p-4 text-sm">
        {resultFields.length > 0 ? (
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            {resultFields.map((field) => (
              <DetailRow key={field.label} label={field.label} value={field.value} />
            ))}
          </div>
        ) : (
          <div className="text-slate-500">No result fields recorded.</div>
        )}
        <CodeBlock label="Raw result" value={resultJson} />
      </div>
    </section>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs font-semibold uppercase text-slate-500">{label}</div>
      <div className="mt-1 truncate text-slate-200" title={value}>
        {value}
      </div>
    </div>
  );
}

function KeyValueList({
  emptyLabel,
  items,
  title,
}: {
  emptyLabel: string;
  items: Array<{ name: string; value: string }>;
  title: string;
}) {
  return (
    <div className="min-w-0">
      <div className="text-xs font-semibold uppercase text-slate-500">{title}</div>
      {items.length > 0 ? (
        <dl className="mt-2 grid min-w-0 gap-2">
          {items.map((item) => (
            <div
              className="grid min-w-0 gap-2 rounded border border-slate-800 bg-[#0f151d] px-3 py-2 sm:grid-cols-[12rem_minmax(0,1fr)]"
              key={item.name}
            >
              <dt
                className="min-w-0 truncate font-medium text-slate-300"
                title={item.name}
              >
                {item.name}
              </dt>
              <dd className="min-w-0 truncate text-slate-400" title={item.value}>
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <div className="mt-2 text-slate-500">{emptyLabel}</div>
      )}
    </div>
  );
}

function CodeBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs font-semibold uppercase text-slate-500">{label}</div>
      <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded bg-[#0b0f14] p-4 text-sm text-slate-300">
        {value}
      </pre>
    </div>
  );
}

function ArtifactList({ artifacts }: { artifacts: DashboardRunArtifact[] }) {
  if (artifacts.length === 0) {
    return (
      <span className="text-sm text-slate-500">
        No artifacts recorded for this run.
      </span>
    );
  }

  const groups = groupArtifacts(artifacts);

  return (
    <div className="grid gap-5">
      {groups.traces.length > 0 ? (
        <ArtifactGroup title="Traces">
          <div className="grid gap-2">
            {groups.traces.map((artifact) => (
              <ArtifactRow artifact={artifact} key={artifact.id}>
                <a
                  aria-label={`Open trace ${artifact.name}`}
                  className="inline-flex h-8 shrink-0 items-center justify-center rounded-md bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-500"
                  href={artifact.viewUrl}
                >
                  Open trace
                </a>
                <ArtifactDownloadLink artifact={artifact} />
              </ArtifactRow>
            ))}
          </div>
        </ArtifactGroup>
      ) : null}

      {groups.screenshots.length > 0 ? (
        <ArtifactGroup title="Screenshots">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {groups.screenshots.map((artifact) => (
              <div
                className="min-w-0 overflow-hidden rounded-md border border-slate-700 bg-[#0f151d] text-sm text-slate-300"
                key={artifact.id}
              >
                <a
                  aria-label={`Open screenshot ${artifact.name} in new tab`}
                  className="relative block aspect-video overflow-hidden bg-[#0b0f14]"
                  href={artifact.viewUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  <Image
                    alt={artifact.name}
                    className="object-cover transition-transform hover:scale-[1.02]"
                    fill
                    sizes="(min-width: 1280px) 25vw, (min-width: 640px) 40vw, 90vw"
                    src={artifact.viewUrl}
                    unoptimized
                  />
                </a>
                <div className="flex items-center gap-3 px-3 py-2">
                  <ArtifactMetadata artifact={artifact} />
                  <ArtifactDownloadLink artifact={artifact} />
                </div>
              </div>
            ))}
          </div>
        </ArtifactGroup>
      ) : null}

      {groups.logs.length > 0 ? (
        <ArtifactGroup title="Logs">
          <div className="grid gap-3">
            {groups.logs.map((artifact) => (
              <div
                className="grid min-w-0 gap-3 rounded-md border border-slate-700 bg-[#0f151d] p-3 text-sm text-slate-300"
                key={artifact.id}
              >
                <div className="flex items-center gap-3">
                  <FileText className="h-4 w-4 shrink-0 text-slate-500" />
                  <ArtifactMetadata artifact={artifact} />
                </div>
                <ArtifactTextPreview name={artifact.name} viewUrl={artifact.viewUrl} />
                <div className="flex justify-end gap-1">
                  <ArtifactViewLink artifact={artifact} />
                  <ArtifactDownloadLink artifact={artifact} />
                </div>
              </div>
            ))}
          </div>
        </ArtifactGroup>
      ) : null}

      {groups.other.length > 0 ? (
        <ArtifactGroup title="Other">
          <div className="grid gap-2">
            {groups.other.map((artifact) => (
              <ArtifactRow artifact={artifact} key={artifact.id}>
                <ArtifactViewLink artifact={artifact} />
                <ArtifactDownloadLink artifact={artifact} />
              </ArtifactRow>
            ))}
          </div>
        </ArtifactGroup>
      ) : null}
    </div>
  );
}

function ArtifactGroup({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <section className="grid gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </h3>
      {children}
    </section>
  );
}

function ArtifactRow({
  artifact,
  children,
}: {
  artifact: DashboardRunArtifact;
  children: React.ReactNode;
}) {
  const Icon = getArtifactIcon(artifact.type);

  return (
    <div className="flex max-w-full items-center gap-3 rounded-md border border-slate-700 bg-[#0f151d] px-3 py-2 text-sm text-slate-300">
      <Icon className="h-4 w-4 shrink-0 text-slate-500" />
      <ArtifactMetadata artifact={artifact} />
      {children}
    </div>
  );
}

function ArtifactMetadata({ artifact }: { artifact: DashboardRunArtifact }) {
  const label = getArtifactTypeLabel(artifact.type);

  return (
    <div className="min-w-0 flex-1">
      <div className="truncate font-medium text-slate-200" title={artifact.name}>
        {artifact.name}
      </div>
      <div className="mt-0.5 text-xs text-slate-500">
        {label}
        {artifact.size !== "-" ? ` · ${artifact.size}` : ""}
      </div>
    </div>
  );
}

function ArtifactViewLink({ artifact }: { artifact: DashboardRunArtifact }) {
  return (
    <a
      aria-label={`View ${artifact.name}`}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-800 hover:text-slate-100"
      href={artifact.viewUrl}
      rel="noreferrer"
      target="_blank"
      title="View"
    >
      {artifact.type === "video" ? (
        <Play className="h-4 w-4" />
      ) : (
        <ExternalLink className="h-4 w-4" />
      )}
    </a>
  );
}

function ArtifactDownloadLink({ artifact }: { artifact: DashboardRunArtifact }) {
  return (
    <a
      aria-label={`Download ${artifact.name}`}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-800 hover:text-slate-100"
      download
      href={artifact.downloadUrl}
      title="Download"
    >
      <Download className="h-4 w-4" />
    </a>
  );
}

function groupArtifacts(artifacts: DashboardRunArtifact[]) {
  const groups = {
    logs: [] as DashboardRunArtifact[],
    other: [] as DashboardRunArtifact[],
    screenshots: [] as DashboardRunArtifact[],
    traces: [] as DashboardRunArtifact[],
  };

  for (const artifact of artifacts) {
    if (artifact.type === "trace") {
      groups.traces.push(artifact);
    } else if (artifact.type === "screenshot") {
      groups.screenshots.push(artifact);
    } else if (isTextArtifact(artifact)) {
      groups.logs.push(artifact);
    } else {
      groups.other.push(artifact);
    }
  }

  return groups;
}

function isTextArtifact(artifact: DashboardRunArtifact) {
  if (["json", "log", "request_response"].includes(artifact.type)) {
    return true;
  }

  const mimeType = artifact.mimeType?.toLowerCase() ?? "";

  if (
    mimeType.startsWith("text/") ||
    ["json", "javascript", "xml", "yaml"].some((type) => mimeType.includes(type))
  ) {
    return true;
  }

  return /\.(?:css|csv|html?|jsx?|log|md|mjs|text|tsv|tsx?|txt|xml|ya?ml)$/i.test(
    artifact.name,
  );
}

type ScreenshotComparisonPart = "actual" | "diff" | "expected";

type ScreenshotComparisonGroup = {
  actual?: DashboardRunArtifact;
  diff?: DashboardRunArtifact;
  expected?: DashboardRunArtifact;
  id: string;
  label: string;
  order: number;
};

function buildScreenshotComparisons(
  artifacts: DashboardRunArtifact[],
): ScreenshotComparison[] {
  const groups = new Map<string, ScreenshotComparisonGroup>();

  for (const artifact of artifacts) {
    if (artifact.type !== "screenshot") {
      continue;
    }

    const part = parseScreenshotComparisonPart(artifact.name);

    if (!part) {
      continue;
    }

    const group = groups.get(part.key) ?? {
      id: part.key,
      label: part.label,
      order: groups.size,
    };

    group[part.type] = artifact;
    groups.set(part.key, group);
  }

  return [...groups.values()]
    .sort((first, second) => first.order - second.order)
    .flatMap((group) => {
      if (!group.actual || !group.expected) {
        return [];
      }

      return [
        {
          actual: group.actual,
          ...(group.diff ? { diff: group.diff } : {}),
          expected: group.expected,
          id: group.id,
          label: group.label,
        },
      ];
    });
}

function parseScreenshotComparisonPart(
  name: string,
): { key: string; label: string; type: ScreenshotComparisonPart } | undefined {
  const extension = name.match(/\.[^.]+$/)?.[0] ?? "";
  const stem = name.slice(0, name.length - extension.length);
  const match = stem.match(/^(.*?)[-_.](actual|diff|expected)$/i);

  if (!match?.[1] || !match[2]) {
    return undefined;
  }

  const key = match[1].toLowerCase();

  return {
    key,
    label: formatScreenshotComparisonLabel(match[1]),
    type: match[2].toLowerCase() as ScreenshotComparisonPart,
  };
}

function formatScreenshotComparisonLabel(value: string) {
  const label = value
    .replace(/^[-_.]+|[-_.]+$/g, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return label || "Screenshot";
}

function AssertionStatusIcon({ passed }: { passed?: boolean }) {
  if (passed === true) {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-emerald-950">
        <CheckCircle2 className="h-3.5 w-3.5" />
      </span>
    );
  }

  if (passed === false) {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-500 text-white">
        <CircleX className="h-3.5 w-3.5" />
      </span>
    );
  }

  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-600 text-slate-200">
      <CircleAlert className="h-3.5 w-3.5" />
    </span>
  );
}

function CheckStatusIcon({
  compact,
  runState,
  status,
}: {
  compact?: boolean;
  runState: DashboardRunState;
  status: DashboardStatus;
}) {
  const sizeClass = compact ? "h-5 w-5" : "h-9 w-9";
  const iconClass = compact ? "h-3.5 w-3.5" : "h-5 w-5";

  if (runState === "running" || runState === "queued" || status === "degraded") {
    return (
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full bg-amber-400 text-amber-950",
          sizeClass,
        )}
      >
        <CircleAlert className={iconClass} />
      </span>
    );
  }

  if (status === "failing") {
    return (
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full bg-red-500 text-white",
          sizeClass,
        )}
      >
        <CircleX className={iconClass} />
      </span>
    );
  }

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-emerald-500 text-emerald-950",
        sizeClass,
      )}
    >
      <CheckCircle2 className={iconClass} />
    </span>
  );
}

function getArtifactIcon(type: DashboardRunArtifact["type"]): LucideIcon {
  if (type === "screenshot") {
    return FileImage;
  }

  if (type === "video") {
    return Video;
  }

  if (type === "trace") {
    return FileArchive;
  }

  if (type === "json" || type === "request_response") {
    return FileJson;
  }

  return FileText;
}

function getArtifactTypeLabel(type: DashboardRunArtifact["type"]) {
  if (type === "request_response") {
    return "Request/response";
  }

  return type.charAt(0).toUpperCase() + type.slice(1);
}

function getResultField(fields: RunDetailData["run"]["resultFields"], label: string) {
  return fields.find((field) => field.label === label)?.value;
}

function buildPageNavigations(run: RunDetailData["run"]): PageNavigationEntry[] {
  const urls = [run.request?.url, run.response?.url, ...extractUrls(run.jobLog ?? "")];
  const uniqueUrls = [...new Set(urls.filter((url): url is string => Boolean(url)))];
  const statusCode = run.response?.status ?? getResultField(run.resultFields, "Status");

  return uniqueUrls.map((url, index) => ({
    id: `${index}-${url}`,
    method: index === 0 ? run.request?.method : undefined,
    requestBody: index === 0 ? run.request?.body : undefined,
    responseBody: index === 0 ? run.response?.body : undefined,
    statusCode: index === 0 ? statusCode : undefined,
    statusText: index === 0 ? run.response?.statusText : undefined,
    tone: statusCode && Number.parseInt(statusCode, 10) >= 400 ? "failing" : "passing",
    url,
  }));
}

function extractUrls(value: string): string[] {
  return (value.match(/https?:\/\/[^\s"')\]}]+/g) ?? []).map((url) =>
    url.replace(/[.,;:]+$/, ""),
  );
}
