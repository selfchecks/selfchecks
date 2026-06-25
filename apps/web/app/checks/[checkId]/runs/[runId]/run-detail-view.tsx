import {
  ArrowLeft,
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
import Link from "next/link";

import type { RunDetailData } from "@/lib/dashboard-data";
import type {
  DashboardRunArtifact,
  DashboardRunState,
  DashboardStatus,
} from "@/lib/dashboard-types";
import { cn } from "@/lib/utils";
import { DetailSidebar } from "@/app/checks/detail-sidebar";

type RunDetailViewProps = {
  accountLabel: string;
  detail: RunDetailData;
};

type PageNavigationEntry = {
  id: string;
  statusCode?: string;
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
  const failedAttemptCount = run.status === "failing" ? 1 : 0;
  const target = run.request
    ? `${run.request.method} ${run.request.url}`
    : (command ?? check.settings.entrypoint ?? "No request data recorded");

  return (
    <main className="min-h-screen bg-[#0d1117] text-slate-200">
      <DetailSidebar />

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
              <div className="border-l-4 border-blue-500 bg-slate-800/60 px-5 py-4">
                <div className="flex items-center gap-3">
                  <CheckStatusIcon
                    compact
                    runState={run.runState}
                    status={run.status}
                  />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-100">
                      Check run
                    </div>
                    <div className="mt-1 truncate text-xs text-slate-500">
                      {run.createdAtLabel}
                    </div>
                  </div>
                </div>
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
                    <span>{failedAttemptCount}/1 failed</span>
                    <span className="rounded-md border border-slate-700 px-3 py-1 text-slate-200">
                      Attempt #1
                    </span>
                  </div>
                </div>
              </div>

              <section className="rounded-md border border-slate-700 bg-[#111821] p-5">
                <div className="flex flex-wrap items-center gap-3 rounded-md bg-slate-800 px-4 py-3">
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

              <PlaywrightReportPanel
                checkName={check.name}
                checkType={check.type}
                run={run}
              />
              <PageNavigationsPanel entries={navigationEntries} />
              {run.request?.assertions.length ? (
                <AssertionsTable assertions={run.request.assertions} />
              ) : null}

              <section
                className={cn("grid gap-5", run.request ? "xl:grid-cols-2" : "")}
              >
                {run.request ? <RequestDataPanel request={run.request} /> : null}
                <ResultPanel
                  resultFields={run.resultFields}
                  resultJson={run.resultJson}
                />
              </section>

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
        className="overflow-hidden rounded-md border border-slate-700 bg-[#111821]"
        open
      >
        <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-4 hover:bg-slate-800/60">
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
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
            <div
              className="flex items-center gap-3 rounded-md border border-slate-700 bg-[#111821] px-4 py-4"
              key={entry.id}
            >
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
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
            </div>
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
    <section className="rounded-md border border-slate-800 bg-[#111821]">
      <div className="border-b border-slate-800 px-4 py-3 text-sm font-semibold text-slate-100">
        Request data
      </div>
      {request ? (
        <div className="grid gap-5 p-4 text-sm">
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

function ResultPanel({
  resultFields,
  resultJson,
}: {
  resultFields: RunDetailData["run"]["resultFields"];
  resultJson: string;
}) {
  return (
    <section className="rounded-md border border-slate-800 bg-[#111821]">
      <div className="border-b border-slate-800 px-4 py-3 text-sm font-semibold text-slate-100">
        Result data
      </div>
      <div className="grid gap-5 p-4 text-sm">
        {resultFields.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
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
    <div>
      <div className="text-xs font-semibold uppercase text-slate-500">{title}</div>
      {items.length > 0 ? (
        <dl className="mt-2 grid gap-2">
          {items.map((item) => (
            <div
              className="grid gap-2 rounded border border-slate-800 bg-[#0f151d] px-3 py-2 sm:grid-cols-[12rem_minmax(0,1fr)]"
              key={item.name}
            >
              <dt className="truncate font-medium text-slate-300" title={item.name}>
                {item.name}
              </dt>
              <dd className="truncate text-slate-400" title={item.value}>
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
    <div>
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

  return (
    <div className="grid gap-2">
      {artifacts.map((artifact) => {
        const Icon = getArtifactIcon(artifact.type);
        const label = getArtifactTypeLabel(artifact.type);

        return (
          <div
            className="flex max-w-full items-center gap-3 rounded-md border border-slate-700 bg-[#0f151d] px-3 py-2 text-sm text-slate-300"
            key={artifact.id}
          >
            <Icon className="h-4 w-4 shrink-0 text-slate-500" />
            <div className="min-w-0 flex-1">
              <div
                className="truncate font-medium text-slate-200"
                title={artifact.name}
              >
                {artifact.name}
              </div>
              <div className="mt-0.5 text-xs text-slate-500">
                {label}
                {artifact.size !== "-" ? ` · ${artifact.size}` : ""}
              </div>
            </div>
            <a
              aria-label={`View ${artifact.name}`}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-800 hover:text-slate-100"
              href={artifact.viewUrl}
              rel={artifact.type === "trace" ? undefined : "noreferrer"}
              target={artifact.type === "trace" ? undefined : "_blank"}
              title="View"
            >
              {artifact.type === "video" ? (
                <Play className="h-4 w-4" />
              ) : (
                <ExternalLink className="h-4 w-4" />
              )}
            </a>
            <a
              aria-label={`Download ${artifact.name}`}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-800 hover:text-slate-100"
              download
              href={artifact.downloadUrl}
              title="Download"
            >
              <Download className="h-4 w-4" />
            </a>
          </div>
        );
      })}
    </div>
  );
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
  const urls = [
    run.request?.url,
    getResultField(run.resultFields, "Url"),
    ...extractUrls(run.jobLog ?? ""),
  ];
  const uniqueUrls = [...new Set(urls.filter((url): url is string => Boolean(url)))];
  const statusCode = getResultField(run.resultFields, "Status");

  return uniqueUrls.map((url, index) => ({
    id: `${index}-${url}`,
    statusCode: index === 0 ? statusCode : undefined,
    tone: statusCode && Number.parseInt(statusCode, 10) >= 400 ? "failing" : "passing",
    url,
  }));
}

function extractUrls(value: string): string[] {
  return (value.match(/https?:\/\/[^\s"')\]}]+/g) ?? []).map((url) =>
    url.replace(/[.,;:]+$/, ""),
  );
}
