"use client";

import { type CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  CircleX,
  Clock3,
  Download,
  ExternalLink,
  FileArchive,
  FileImage,
  FileJson,
  FileText,
  Folder,
  Gauge,
  History,
  RefreshCw,
  SlidersHorizontal,
  Video,
  Zap,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import type { CheckDetailData } from "@/lib/dashboard-data";
import type {
  DashboardRunArtifact,
  DashboardRunRow,
  DashboardRunState,
  DashboardStatus,
} from "@/lib/dashboard-types";
import { getRunResultTone, getRunResultToneClassName } from "@/lib/run-result-tone";
import { cn } from "@/lib/utils";
import { DetailSidebar } from "../detail-sidebar";

type CheckDetailClientProps = {
  accountLabel: string;
  detail: CheckDetailData;
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
const MAX_RUN_BAR_HEIGHT = 88;
const MIN_RUN_BAR_HEIGHT = 8;

type DateFilter = "7d" | "24h";
type StatusFilter = "all" | DashboardStatus;
type RunDataStatus = "error" | "loading" | "ready";
type RunStatsView = {
  averageDuration: string;
  availability: string;
  failedRuns: string;
  p95Duration: string;
  passedRuns: string;
  totalRuns: string;
};
type ChartPoint = {
  id: string;
  label: string;
  value?: number;
};
type ChartSeries = {
  color: string;
  label: string;
  points: ChartPoint[];
};
type PerformanceAnalyticsView = {
  duration: {
    p50: string;
    p95: string;
    p99: string;
    series: ChartSeries[];
  };
  errors: {
    consoleErrors: number;
    documentErrors: number;
    networkErrors: number;
    scriptErrors: number;
    series: ChartSeries[];
  };
  interactivity: {
    series: ChartSeries[];
    tbt: string;
  };
  loading: {
    dcl: string;
    fcp: string;
    lcp: string;
    loaded: string;
    series: ChartSeries[];
    ttfb: string;
  };
};

const DAY_MS = 24 * 60 * 60 * 1000;
const EMPTY_RUNS: DashboardRunRow[] = [];

export default function CheckDetailClient({
  accountLabel,
  detail,
}: CheckDetailClientProps) {
  const router = useRouter();
  const checkId = detail.check.id;
  const [loadedDetail, setLoadedDetail] = useState<CheckDetailData | null>(null);
  const [runDataStatus, setRunDataStatus] = useState<RunDataStatus>("loading");
  const [runDataError, setRunDataError] = useState("");
  const [notice, setNotice] = useState("");
  const [scheduling, setScheduling] = useState(false);
  const [dateFilter, setDateFilter] = useState<DateFilter>("7d");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [hasRetriesOnly, setHasRetriesOnly] = useState(false);
  const currentDetail = loadedDetail ?? detail;
  const { check } = currentDetail;
  const runs = loadedDetail?.check.runs ?? EMPTY_RUNS;
  const requestLabel = check.settings.request
    ? `${check.settings.request.method} ${check.settings.request.url}`
    : (check.settings.entrypoint ?? "No request configured");
  const hasActiveRuns =
    check.runState === "queued" ||
    check.runState === "running" ||
    runs.some((run) => run.runState === "queued" || run.runState === "running");
  const filteredRuns = useMemo(
    () =>
      filterRuns(runs, {
        dateFilter,
        hasRetriesOnly,
        statusFilter,
      }),
    [runs, dateFilter, hasRetriesOnly, statusFilter],
  );
  const filteredStats = useMemo(() => calculateRunStats(filteredRuns), [filteredRuns]);
  const isRunDataError = runDataStatus === "error";
  const isRunDataLoading = runDataStatus === "loading";
  const loadFullDetail = useCallback(
    async ({
      signal,
      silent = false,
    }: {
      signal?: AbortSignal;
      silent?: boolean;
    } = {}) => {
      if (!silent) {
        setRunDataStatus("loading");
        setRunDataError("");
      }

      try {
        const response = await fetch(
          `/api/checks/${encodeURIComponent(checkId)}/detail`,
          {
            cache: "no-store",
            signal,
          },
        );
        const payload = (await response.json().catch(() => null)) as
          | CheckDetailData
          | { error?: string }
          | null;

        if (!response.ok) {
          const message =
            payload && "error" in payload && payload.error
              ? payload.error
              : "Unable to load run history.";

          throw new Error(message);
        }

        if (!payload || !("check" in payload)) {
          throw new Error("Unable to load run history.");
        }

        setLoadedDetail(payload);
        setRunDataStatus("ready");
        setRunDataError("");
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }

        if (silent) {
          setRunDataError(error instanceof Error ? error.message : String(error));
          return;
        }

        setRunDataStatus("error");
        setRunDataError(error instanceof Error ? error.message : String(error));
      }
    },
    [checkId],
  );

  useEffect(() => {
    const controller = new AbortController();

    void loadFullDetail({ signal: controller.signal });

    return () => controller.abort();
  }, [loadFullDetail]);

  useEffect(() => {
    if (!hasActiveRuns) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void loadFullDetail({ silent: true });
    }, 2000);

    return () => window.clearInterval(intervalId);
  }, [hasActiveRuns, loadFullDetail]);

  function toggleStatusFilter(nextStatus: DashboardStatus) {
    setStatusFilter((currentStatus) =>
      currentStatus === nextStatus ? "all" : nextStatus,
    );
  }

  async function scheduleNow() {
    setScheduling(true);
    setNotice("");

    try {
      const response = await fetch(`/api/checks/${encodeURIComponent(checkId)}/run`, {
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to queue check run.");
      }

      setNotice("Check run queued.");
      await loadFullDetail({ silent: true });
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setScheduling(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#0d1117] text-slate-200">
      <DetailSidebar />

      <div className="min-h-screen xl:pl-72">
        <header className="sticky top-0 z-30 border-b border-slate-800 bg-[#12171f]/95 backdrop-blur">
          <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3 text-sm text-slate-400">
              <Link
                aria-label="Back to dashboard"
                className="flex h-9 w-9 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                href="/"
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <span className="hidden truncate sm:inline">{accountLabel}</span>
              <span className="text-slate-600">/</span>
              <span className="inline-flex min-w-0 items-center gap-2 truncate">
                <Folder className="h-4 w-4 shrink-0" />
                {currentDetail.groupName}
              </span>
              <span className="text-slate-600">/</span>
              <span className="inline-flex min-w-0 items-center gap-2 truncate text-slate-200">
                <span className="rounded border border-slate-600 px-1 text-[10px] font-bold uppercase">
                  {check.type}
                </span>
                {check.name}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="inline-flex h-10 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={scheduling}
                onClick={() => void scheduleNow()}
                type="button"
              >
                <Zap className="h-4 w-4" />
                {scheduling ? "Scheduling..." : "Schedule now"}
              </button>
            </div>
          </div>
        </header>

        <div className="grid min-h-[calc(100vh-4rem)] lg:grid-cols-[minmax(0,1fr)_24rem]">
          <section className="min-w-0 px-4 py-6 sm:px-6 lg:px-8">
            <div className="mx-auto flex max-w-[1440px] flex-col gap-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-4">
                  <CheckStatusIcon runState={check.runState} status={check.status} />
                  <div className="min-w-0">
                    <h1 className="truncate text-3xl font-semibold text-slate-100">
                      {check.name}
                    </h1>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-lg text-slate-400">
                      <span>Check is {formatStatusLabel(check.status)}</span>
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
                <div className="text-right text-sm text-slate-400">
                  <div>Updated {currentDetail.updated}</div>
                  <div>Project {currentDetail.projectSlug}</div>
                </div>
              </div>

              {notice ? (
                <div
                  className="rounded-md border border-slate-700 bg-[#111821] px-4 py-3 text-sm text-slate-300"
                  role="status"
                >
                  {notice}
                </div>
              ) : null}

              <section className="rounded-md border border-slate-700 bg-[#111821] p-5">
                <dl className="grid gap-4 text-sm md:grid-cols-[6rem_minmax(0,1fr)]">
                  <dt className="text-slate-500">Request</dt>
                  <dd
                    className="min-w-0 truncate text-base text-slate-200"
                    title={requestLabel}
                  >
                    {requestLabel}
                  </dd>
                  <dt className="text-slate-500">Settings</dt>
                  <dd className="flex flex-wrap items-center gap-2 text-base text-slate-200">
                    <span>
                      {check.settings.frequency === "manual"
                        ? "Manual runs"
                        : `Runs every ${check.settings.frequency}`}
                    </span>
                    <span className="text-slate-600">•</span>
                    <span>{check.settings.enabled ? "Enabled" : "Disabled"}</span>
                  </dd>
                  <dt className="text-slate-500">Tags</dt>
                  <dd className="flex flex-wrap gap-2">
                    {check.tags.length > 0 ? (
                      check.tags.map((tag) => (
                        <span
                          className="rounded bg-slate-700 px-2 py-1 text-xs font-semibold text-slate-300"
                          key={tag}
                        >
                          {tag}
                        </span>
                      ))
                    ) : (
                      <span className="text-slate-500">No tags</span>
                    )}
                  </dd>
                </dl>
              </section>

              <div className="flex flex-wrap items-center gap-2">
                <SegmentButton
                  active={dateFilter === "7d"}
                  icon={CalendarDays}
                  label="Last 7 days"
                  onClick={() => setDateFilter("7d")}
                />
                <SegmentButton
                  active={dateFilter === "24h"}
                  icon={Clock3}
                  label="24hr"
                  onClick={() => setDateFilter("24h")}
                />
                <SegmentButton
                  active={statusFilter === "passing"}
                  icon={CheckCircle2}
                  label="Passed"
                  onClick={() => toggleStatusFilter("passing")}
                />
                <SegmentButton
                  active={statusFilter === "failing"}
                  icon={CircleX}
                  label="Failed"
                  onClick={() => toggleStatusFilter("failing")}
                />
                <SegmentButton
                  active={statusFilter === "degraded"}
                  icon={CircleAlert}
                  label="Degraded"
                  onClick={() => toggleStatusFilter("degraded")}
                />
                <SegmentButton
                  active={hasRetriesOnly}
                  icon={RefreshCw}
                  label="Has retries"
                  onClick={() => setHasRetriesOnly((currentValue) => !currentValue)}
                />
              </div>

              {isRunDataLoading ? (
                <RunOverviewSkeleton />
              ) : isRunDataError ? (
                <RunDataError
                  message={runDataError}
                  onRetry={() => void loadFullDetail()}
                />
              ) : (
                <section className="grid gap-5 rounded-md border border-slate-800 bg-[#11161d] p-5">
                  <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
                    <Metric label="Availability" value={filteredStats.availability} />
                    <Metric label="Runs" value={filteredStats.totalRuns} />
                    <Metric label="Passed" value={filteredStats.passedRuns} />
                    <Metric label="Failed" value={filteredStats.failedRuns} />
                    <Metric label="Average" value={filteredStats.averageDuration} />
                    <Metric label="P95" value={filteredStats.p95Duration} />
                  </div>
                  <ResultChart runs={filteredRuns} />
                </section>
              )}

              {isRunDataLoading ? (
                <PerformanceAnalyticsSkeleton />
              ) : isRunDataError ? null : (
                <PerformanceAnalytics runs={filteredRuns} />
              )}

              <section className="grid gap-5 xl:grid-cols-2">
                <SettingsPanel check={check} />
                {isRunDataLoading ? (
                  <RunStatsPanelSkeleton />
                ) : isRunDataError ? null : (
                  <RunStatsPanel stats={filteredStats} />
                )}
              </section>

              {isRunDataLoading ? (
                <RunHistoryTableSkeleton />
              ) : isRunDataError ? null : (
                <RunHistoryTable checkId={check.id} runs={filteredRuns} />
              )}
            </div>
          </section>

          <aside className="border-t border-slate-800 bg-[#10151c] lg:border-l lg:border-t-0">
            <div className="sticky top-16">
              <div className="border-b border-slate-800 px-5 py-5">
                <h2 className="text-xl font-semibold text-slate-100">Run results</h2>
                {isRunDataLoading ? (
                  <SkeletonLine className="mt-3 h-6 w-24" />
                ) : isRunDataError ? null : (
                  <span className="mt-2 inline-flex rounded bg-slate-700 px-2 py-1 text-xs font-semibold text-slate-300">
                    Last {filteredRuns.length || 0} runs
                  </span>
                )}
              </div>
              <div className="max-h-[calc(100vh-9rem)] overflow-y-auto">
                {isRunDataLoading ? (
                  <RunResultsSidebarSkeleton />
                ) : isRunDataError ? (
                  <div className="px-5 py-6 text-sm text-slate-500">
                    Unable to load run results.
                  </div>
                ) : filteredRuns.length > 0 ? (
                  filteredRuns.map((run) => (
                    <Link
                      aria-label={`Open run result ${run.occurredAt}`}
                      className="block border-b border-slate-800 px-5 py-4 text-sm hover:bg-slate-900/70"
                      href={getRunHref(check.id, run.id)}
                      key={run.id}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="mt-1 shrink-0">
                            <CheckStatusIcon
                              compact
                              runState={run.runState}
                              status={run.status}
                            />
                          </span>
                          <div className="min-w-0">
                            <div className="truncate text-base font-medium text-slate-200">
                              {run.runner}
                            </div>
                            <div className="mt-1 text-slate-400">{run.duration}</div>
                          </div>
                        </div>
                        <div className="shrink-0 text-right text-slate-500">
                          {run.occurredAt}
                        </div>
                      </div>
                    </Link>
                  ))
                ) : (
                  <div className="px-5 py-6 text-sm text-slate-500">
                    No runs match the current filters.
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

function SegmentButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active?: boolean;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={Boolean(active)}
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-semibold",
        active
          ? "border-slate-600 bg-slate-700 text-slate-100"
          : "border-slate-700 text-slate-300 hover:bg-slate-800",
      )}
      onClick={onClick}
      type="button"
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-sm font-medium text-slate-500">{label}</div>
      <div className="mt-1 truncate text-2xl font-semibold text-slate-100">{value}</div>
    </div>
  );
}

function SkeletonLine({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded bg-slate-800/80", className)}
      style={style}
    />
  );
}

function RunOverviewSkeleton() {
  return (
    <section
      aria-busy="true"
      aria-label="Loading run summary"
      className="grid gap-5 rounded-md border border-slate-800 bg-[#11161d] p-5"
    >
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        {["Availability", "Runs", "Passed", "Failed", "Average", "P95"].map((label) => (
          <div className="min-w-0" key={label}>
            <div className="text-sm font-medium text-slate-500">{label}</div>
            <SkeletonLine className="mt-2 h-8 w-20" />
          </div>
        ))}
      </div>
      <div className="h-48 min-w-0 overflow-hidden border-t border-slate-800 pt-5">
        <div
          className="grid h-full items-end gap-2"
          style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}
        >
          {Array.from({ length: 24 }, (_, index) => (
            <SkeletonLine
              className="w-full rounded-t-sm"
              key={index}
              style={{
                height: `${20 + (index % 6) * 12}px`,
              }}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function RunDataError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section className="rounded-md border border-red-950/80 bg-red-950/30 p-5 text-sm text-red-100">
      <div className="font-semibold">Unable to load run history.</div>
      <div className="mt-1 text-red-200/80">{message || "Please try again."}</div>
      <button
        className="mt-4 inline-flex h-9 items-center gap-2 rounded-md border border-red-800 px-3 font-semibold text-red-100 hover:bg-red-900/40"
        onClick={onRetry}
        type="button"
      >
        <RefreshCw className="h-4 w-4" />
        Retry
      </button>
    </section>
  );
}

function PerformanceAnalyticsSkeleton() {
  return (
    <section aria-busy="true" className="grid gap-4">
      <h2 className="text-xl font-semibold text-slate-100">Performance</h2>
      <div className="grid gap-4 xl:grid-cols-2">
        {["Check duration", "Loading", "Errors", "Interactivity"].map((title) => (
          <section
            className="rounded-md border border-slate-800 bg-[#111821] p-5"
            key={title}
          >
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-slate-100">{title}</h3>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-4">
              {Array.from({ length: 3 }, (_, index) => (
                <div className="min-w-0" key={index}>
                  <SkeletonLine className="h-4 w-12" />
                  <SkeletonLine className="mt-2 h-6 w-16" />
                </div>
              ))}
            </div>
            <SkeletonLine className="mt-6 h-48 w-full" />
          </section>
        ))}
      </div>
    </section>
  );
}

function RunStatsPanelSkeleton() {
  return (
    <section
      aria-busy="true"
      className="rounded-md border border-slate-800 bg-[#111821]"
    >
      <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3 text-sm font-semibold text-slate-100">
        <Gauge className="h-4 w-4 text-slate-500" />
        Run statistics
      </div>
      <div className="grid grid-cols-2 gap-4 p-4">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index}>
            <SkeletonLine className="h-4 w-20" />
            <SkeletonLine className="mt-2 h-5 w-16" />
          </div>
        ))}
      </div>
    </section>
  );
}

function RunHistoryTableSkeleton() {
  return (
    <section
      aria-busy="true"
      className="overflow-hidden rounded-md border border-slate-800 bg-[#111821]"
    >
      <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3 text-sm font-semibold text-slate-100">
        <History className="h-4 w-4 text-slate-500" />
        Run history
      </div>
      <div className="overflow-x-auto">
        <div className="w-full min-w-[55rem]">
          <div className="grid grid-cols-[13rem_10rem_7rem_minmax(25rem,1fr)] gap-4 bg-[#121820] px-4 py-3">
            {["Run", "Status", "Duration", "Artifacts"].map((label) => (
              <div
                className="text-xs font-semibold uppercase text-slate-500"
                key={label}
              >
                {label}
              </div>
            ))}
          </div>
          {Array.from({ length: 5 }, (_, rowIndex) => (
            <div
              className="grid grid-cols-[13rem_10rem_7rem_minmax(25rem,1fr)] gap-4 border-t border-slate-800 px-4 py-4"
              key={rowIndex}
            >
              <SkeletonLine className="h-5 w-32" />
              <SkeletonLine className="h-5 w-24" />
              <SkeletonLine className="h-5 w-16" />
              <div className="flex gap-2">
                <SkeletonLine className="h-8 w-28" />
                <SkeletonLine className="h-8 w-24" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function RunResultsSidebarSkeleton() {
  return (
    <div aria-busy="true">
      {Array.from({ length: 6 }, (_, index) => (
        <div className="border-b border-slate-800 px-5 py-4" key={index}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <SkeletonLine className="mt-1 h-4 w-4 rounded-full" />
              <div className="min-w-0 flex-1">
                <SkeletonLine className="h-5 w-28" />
                <SkeletonLine className="mt-2 h-4 w-16" />
              </div>
            </div>
            <SkeletonLine className="h-4 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ResultChart({ runs }: { runs: DashboardRunRow[] }) {
  const bars = buildRunBars(runs);
  const barGap = bars.length > 72 ? 2 : bars.length > 36 ? 4 : 8;

  return (
    <div className="h-48 min-w-0 overflow-hidden border-t border-slate-800 pt-5">
      {bars.length > 0 ? (
        <div
          aria-label="Run result chart"
          className="grid h-full min-w-0 items-end overflow-hidden"
          role="img"
          style={{
            columnGap: barGap,
            gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))`,
          }}
        >
          {bars.map((bar) => (
            <div
              aria-label={`${runStateLabels[bar.runState]} ${bar.duration} ${bar.occurredAt}`}
              className="group relative flex min-w-0 items-end justify-center"
              key={bar.id}
            >
              <span
                className={cn(
                  "block w-full max-w-4 rounded-t-sm",
                  getRunResultToneClassName(bar.tone),
                )}
                style={{ height: `${bar.value}px` }}
              />
              <span className="pointer-events-none absolute bottom-full mb-2 hidden w-max rounded-md bg-slate-700 px-2 py-1 text-xs text-slate-100 shadow-lg group-hover:block">
                {bar.duration} · {bar.occurredAt}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-slate-500">
          No runs match the current filters.
        </div>
      )}
    </div>
  );
}

function PerformanceAnalytics({ runs }: { runs: DashboardRunRow[] }) {
  const analytics = useMemo(() => buildPerformanceAnalytics(runs), [runs]);

  return (
    <section className="grid gap-4">
      <h2 className="text-xl font-semibold text-slate-100">Performance</h2>
      <div className="grid gap-4 xl:grid-cols-2">
        <AnalyticsPanel
          metrics={[
            { label: "P50", value: analytics.duration.p50 },
            { label: "P95", value: analytics.duration.p95 },
            { label: "P99", value: analytics.duration.p99 },
          ]}
          series={analytics.duration.series}
          title="Check duration"
        />
        <AnalyticsPanel
          metrics={[
            { label: "TTFB", value: analytics.loading.ttfb },
            { label: "FCP", value: analytics.loading.fcp },
            { label: "LCP", value: analytics.loading.lcp },
            { label: "Loaded", value: analytics.loading.loaded },
            { label: "DCL", value: analytics.loading.dcl },
          ]}
          series={analytics.loading.series}
          title="Loading"
        />
        <AnalyticsPanel
          chartType="bar"
          emptyLabel="No browser errors recorded for the selected runs."
          metrics={[
            { label: "Console", value: String(analytics.errors.consoleErrors) },
            { label: "Network", value: String(analytics.errors.networkErrors) },
            { label: "Script", value: String(analytics.errors.scriptErrors) },
            {
              label: "Document",
              value: String(analytics.errors.documentErrors),
            },
          ]}
          series={analytics.errors.series}
          title="Errors"
        />
        <AnalyticsPanel
          emptyLabel="No interactivity metrics recorded for the selected runs."
          metrics={[{ label: "TBT", value: analytics.interactivity.tbt }]}
          series={analytics.interactivity.series}
          title="Interactivity"
        />
      </div>
    </section>
  );
}

function AnalyticsPanel({
  chartType = "line",
  emptyLabel = "No performance metrics recorded for the selected runs.",
  metrics,
  series,
  title,
}: {
  chartType?: "bar" | "line";
  emptyLabel?: string;
  metrics: Array<{ label: string; value: string }>;
  series: ChartSeries[];
  title: string;
}) {
  return (
    <section className="rounded-md border border-slate-800 bg-[#111821] p-5">
      <div className="flex items-center gap-2">
        <h3 className="text-base font-semibold text-slate-100">{title}</h3>
        <span
          aria-hidden="true"
          className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-600 text-[10px] font-bold text-slate-500"
        >
          ?
        </span>
      </div>
      <div
        className="mt-4 grid gap-x-4"
        style={{
          gridTemplateColumns: `repeat(${metrics.length}, minmax(0, 1fr))`,
        }}
      >
        {metrics.map((metric) => (
          <div className="min-w-0" key={metric.label}>
            <div className="truncate text-sm font-medium text-slate-500">
              {metric.label}
            </div>
            <div className="mt-1 truncate text-lg font-semibold text-slate-100">
              {metric.value}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6">
        {chartType === "bar" ? (
          <StackedBarChart emptyLabel={emptyLabel} series={series} title={title} />
        ) : (
          <LineChart emptyLabel={emptyLabel} series={series} title={title} />
        )}
      </div>
      <ChartLegend series={series} />
    </section>
  );
}

function LineChart({
  emptyLabel,
  series,
  title,
}: {
  emptyLabel: string;
  series: ChartSeries[];
  title: string;
}) {
  const values = series.flatMap((item) =>
    item.points.flatMap((point) =>
      typeof point.value === "number" ? [point.value] : [],
    ),
  );

  if (values.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded bg-[#0f151d] text-sm text-slate-500">
        {emptyLabel}
      </div>
    );
  }

  const width = 520;
  const height = 180;
  const paddingX = 28;
  const paddingY = 18;
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const spread = Math.max(1, maxValue - minValue);
  const chartMin = Math.max(0, minValue - spread * 0.18);
  const chartMax = maxValue + spread * 0.18;
  const chartHeight = height - paddingY * 2;
  const chartWidth = width - paddingX * 2;

  function getPointCoordinates(point: ChartPoint, index: number, total: number) {
    const x =
      paddingX + (total <= 1 ? chartWidth / 2 : (index / (total - 1)) * chartWidth);
    const normalized =
      typeof point.value === "number"
        ? (point.value - chartMin) / Math.max(1, chartMax - chartMin)
        : 0;
    const y = height - paddingY - normalized * chartHeight;

    return `${x},${y}`;
  }

  return (
    <div className="overflow-hidden rounded bg-[#0f151d]">
      <svg
        aria-label={`${title} chart`}
        className="h-48 w-full"
        preserveAspectRatio="none"
        role="img"
        viewBox={`0 0 ${width} ${height}`}
      >
        {[0, 0.33, 0.66, 1].map((ratio) => (
          <line
            className="stroke-slate-700/80"
            key={ratio}
            strokeWidth="1"
            x1={paddingX}
            x2={width - paddingX}
            y1={paddingY + ratio * chartHeight}
            y2={paddingY + ratio * chartHeight}
          />
        ))}
        {series.map((item) => {
          const definedPoints = item.points.filter(
            (point) => typeof point.value === "number",
          );

          if (definedPoints.length === 0) {
            return null;
          }

          return (
            <polyline
              fill="none"
              key={item.label}
              points={item.points
                .map((point, index) =>
                  typeof point.value === "number"
                    ? getPointCoordinates(point, index, item.points.length)
                    : "",
                )
                .filter(Boolean)
                .join(" ")}
              stroke={item.color}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="3"
            />
          );
        })}
      </svg>
    </div>
  );
}

function StackedBarChart({
  emptyLabel,
  series,
  title,
}: {
  emptyLabel: string;
  series: ChartSeries[];
  title: string;
}) {
  const pointCount = Math.max(...series.map((item) => item.points.length), 0);
  const totals = Array.from({ length: pointCount }, (_, index) =>
    series.reduce((sum, item) => sum + (item.points[index]?.value ?? 0), 0),
  );
  const maxTotal = Math.max(...totals, 0);

  if (pointCount === 0 || maxTotal === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded bg-[#0f151d] text-sm text-slate-500">
        {emptyLabel}
      </div>
    );
  }

  const width = 520;
  const height = 180;
  const paddingX = 28;
  const paddingY = 18;
  const chartWidth = width - paddingX * 2;
  const chartHeight = height - paddingY * 2;
  const step = chartWidth / Math.max(1, pointCount);
  const barWidth = Math.min(16, step * 0.48);

  return (
    <div className="overflow-hidden rounded bg-[#0f151d]">
      <svg
        aria-label={`${title} chart`}
        className="h-48 w-full"
        preserveAspectRatio="none"
        role="img"
        viewBox={`0 0 ${width} ${height}`}
      >
        {[0, 0.5, 1].map((ratio) => (
          <line
            className="stroke-slate-700/80"
            key={ratio}
            strokeWidth="1"
            x1={paddingX}
            x2={width - paddingX}
            y1={paddingY + ratio * chartHeight}
            y2={paddingY + ratio * chartHeight}
          />
        ))}
        {totals.map((_, index) => {
          let y = height - paddingY;
          const x = paddingX + index * step + step / 2 - barWidth / 2;

          return series.map((item) => {
            const value = item.points[index]?.value ?? 0;
            const segmentHeight = (value / maxTotal) * chartHeight;

            y -= segmentHeight;

            return value > 0 ? (
              <rect
                fill={item.color}
                height={Math.max(2, segmentHeight)}
                key={`${item.label}-${index}`}
                rx="2"
                width={barWidth}
                x={x}
                y={y}
              />
            ) : null;
          });
        })}
      </svg>
    </div>
  );
}

function ChartLegend({ series }: { series: ChartSeries[] }) {
  const visibleSeries = series.filter((item) =>
    item.points.some((point) => typeof point.value === "number" && point.value > 0),
  );

  if (visibleSeries.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 flex flex-wrap gap-x-7 gap-y-2 text-sm text-slate-400">
      {visibleSeries.map((item) => (
        <span className="inline-flex items-center gap-2" key={item.label}>
          <span className="h-0.5 w-6 rounded" style={{ backgroundColor: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

function SettingsPanel({ check }: { check: CheckDetailData["check"] }) {
  return (
    <section className="rounded-md border border-slate-800 bg-[#111821]">
      <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3 text-sm font-semibold text-slate-100">
        <SlidersHorizontal className="h-4 w-4 text-slate-500" />
        Settings
      </div>
      <dl className="grid gap-4 p-4 text-sm md:grid-cols-2">
        <DetailValue label="Key" value={check.settings.key} />
        <DetailValue label="Schedule" value={check.settings.frequency} />
        <DetailValue label="Enabled" value={check.settings.enabled ? "yes" : "no"} />
        <DetailValue label="Type" value={check.type.toUpperCase()} />
        {check.settings.entrypoint ? (
          <DetailValue label="Entrypoint" value={check.settings.entrypoint} />
        ) : null}
        {check.settings.request ? (
          <>
            <DetailValue
              label="Request"
              value={`${check.settings.request.method} ${check.settings.request.url}`}
            />
            <DetailValue
              label="Assertions"
              value={String(check.settings.request.assertions)}
            />
            <DetailValue
              label="Headers"
              value={String(check.settings.request.headers)}
            />
            <DetailValue
              label="Body"
              value={check.settings.request.body ? "yes" : "no"}
            />
          </>
        ) : null}
      </dl>
    </section>
  );
}

function RunStatsPanel({ stats }: { stats: RunStatsView }) {
  return (
    <section className="rounded-md border border-slate-800 bg-[#111821]">
      <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3 text-sm font-semibold text-slate-100">
        <Gauge className="h-4 w-4 text-slate-500" />
        Run statistics
      </div>
      <dl className="grid grid-cols-2 gap-4 p-4 text-sm">
        <DetailValue label="Runs" value={stats.totalRuns} />
        <DetailValue label="Passed" value={stats.passedRuns} />
        <DetailValue label="Failed" value={stats.failedRuns} />
        <DetailValue label="Availability" value={stats.availability} />
        <DetailValue label="Average" value={stats.averageDuration} />
        <DetailValue label="P95" value={stats.p95Duration} />
      </dl>
    </section>
  );
}

function RunHistoryTable({
  checkId,
  runs,
}: {
  checkId: string;
  runs: DashboardRunRow[];
}) {
  return (
    <section className="overflow-hidden rounded-md border border-slate-800 bg-[#111821]">
      <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3 text-sm font-semibold text-slate-100">
        <History className="h-4 w-4 text-slate-500" />
        Run history
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[55rem] table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[13rem]" />
            <col className="w-[10rem]" />
            <col className="w-[7rem]" />
            <col />
          </colgroup>
          <thead className="bg-[#121820] text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Run</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Duration</th>
              <th className="px-4 py-3">Artifacts</th>
            </tr>
          </thead>
          <tbody>
            {runs.length > 0 ? (
              runs.map((run) => (
                <tr
                  className="border-t border-slate-800 align-top hover:bg-slate-900/40"
                  key={run.id}
                >
                  <td className="px-4 py-4">
                    <Link
                      aria-label={run.occurredAt}
                      className="inline-flex max-w-full flex-col text-blue-300 hover:text-blue-200"
                      href={getRunHref(checkId, run.id)}
                    >
                      <span className="truncate whitespace-nowrap font-medium">
                        {run.occurredAt}
                      </span>
                      <span className="mt-1 truncate text-xs text-slate-500">
                        {run.id}
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-4">
                    <RunStateBadge runState={run.runState} status={run.status} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-slate-300">
                    {run.duration}
                  </td>
                  <td className="px-4 py-4">
                    <ArtifactList artifacts={run.artifacts} />
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-4 py-5 text-slate-500" colSpan={4}>
                  No runs match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function filterRuns(
  runs: DashboardRunRow[],
  filters: {
    dateFilter: DateFilter;
    hasRetriesOnly: boolean;
    statusFilter: StatusFilter;
  },
) {
  const now = Date.now();
  const dateWindowMs = filters.dateFilter === "24h" ? DAY_MS : 7 * DAY_MS;
  const cutoff = now - dateWindowMs;

  return runs.filter((run) => {
    const createdAt = Date.parse(run.createdAt);

    if (Number.isFinite(createdAt) && createdAt < cutoff) {
      return false;
    }

    if (filters.statusFilter !== "all" && run.status !== filters.statusFilter) {
      return false;
    }

    if (filters.hasRetriesOnly && !run.hasRetries) {
      return false;
    }

    return true;
  });
}

function buildPerformanceAnalytics(runs: DashboardRunRow[]): PerformanceAnalyticsView {
  const chronologicalRuns = [...runs].reverse();
  const durationValues = chronologicalRuns
    .map((run) => run.durationMs)
    .filter((value): value is number => typeof value === "number");
  const ttfbValue = getLatestTimingValue(runs, "ttfbMs");
  const fcpValue = getLatestTimingValue(runs, "fcpMs");
  const lcpValue = getLatestTimingValue(runs, "lcpMs");
  const loadedValue = getLatestTimingValue(runs, "loadedMs");
  const dclValue = getLatestTimingValue(runs, "dclMs");
  const tbtValue = getLatestTimingValue(runs, "tbtMs");
  const consoleErrors = sumErrors(runs, "consoleErrors");
  const networkErrors = sumErrors(runs, "networkErrors");
  const scriptErrors = sumErrors(runs, "scriptErrors");
  const documentErrors = sumErrors(runs, "documentErrors");

  return {
    duration: {
      p50: formatAnalyticsDuration(percentile(durationValues, 0.5)),
      p95: formatAnalyticsDuration(percentile(durationValues, 0.95)),
      p99: formatAnalyticsDuration(percentile(durationValues, 0.99)),
      series: [
        {
          color: "#10b981",
          label: "P50",
          points: buildRollingPercentilePoints(chronologicalRuns, 0.5),
        },
        {
          color: "#3b82f6",
          label: "P95",
          points: buildRollingPercentilePoints(chronologicalRuns, 0.95),
        },
        {
          color: "#f59e0b",
          label: "P99",
          points: buildRollingPercentilePoints(chronologicalRuns, 0.99),
        },
      ],
    },
    errors: {
      consoleErrors,
      documentErrors,
      networkErrors,
      scriptErrors,
      series: [
        {
          color: "#10b981",
          label: "Console Errors",
          points: buildErrorPoints(chronologicalRuns, "consoleErrors"),
        },
        {
          color: "#3b82f6",
          label: "Network Errors",
          points: buildErrorPoints(chronologicalRuns, "networkErrors"),
        },
        {
          color: "#f59e0b",
          label: "Script Errors",
          points: buildErrorPoints(chronologicalRuns, "scriptErrors"),
        },
        {
          color: "#d946ef",
          label: "Document Errors",
          points: buildErrorPoints(chronologicalRuns, "documentErrors"),
        },
      ],
    },
    interactivity: {
      series: [
        {
          color: "#10b981",
          label: "TBT",
          points: buildTimingPoints(chronologicalRuns, "tbtMs"),
        },
      ],
      tbt: formatAnalyticsDuration(tbtValue),
    },
    loading: {
      dcl: formatAnalyticsDuration(dclValue),
      fcp: formatAnalyticsDuration(fcpValue),
      lcp: formatAnalyticsDuration(lcpValue),
      loaded: formatAnalyticsDuration(loadedValue),
      series: [
        {
          color: "#10b981",
          label: "TTFB",
          points: buildTimingPoints(chronologicalRuns, "ttfbMs"),
        },
        {
          color: "#3b82f6",
          label: "FCP",
          points: buildTimingPoints(chronologicalRuns, "fcpMs"),
        },
        {
          color: "#f59e0b",
          label: "LCP",
          points: buildTimingPoints(chronologicalRuns, "lcpMs"),
        },
        {
          color: "#d946ef",
          label: "Loaded",
          points: buildTimingPoints(chronologicalRuns, "loadedMs"),
        },
        {
          color: "#e11d48",
          label: "DOMContentLoaded",
          points: buildTimingPoints(chronologicalRuns, "dclMs"),
        },
      ],
      ttfb: formatAnalyticsDuration(ttfbValue),
    },
  };
}

function buildRollingPercentilePoints(
  runs: DashboardRunRow[],
  ratio: number,
): ChartPoint[] {
  const values: number[] = [];

  return runs.map((run) => {
    if (typeof run.durationMs === "number") {
      values.push(run.durationMs);
    }

    return {
      id: run.id,
      label: run.occurredAt,
      value: percentile(values, ratio),
    };
  });
}

function buildTimingPoints(
  runs: DashboardRunRow[],
  key: keyof NonNullable<NonNullable<DashboardRunRow["performance"]>["timings"]>,
): ChartPoint[] {
  return runs.map((run) => ({
    id: run.id,
    label: run.occurredAt,
    value: run.performance?.timings?.[key],
  }));
}

function buildErrorPoints(
  runs: DashboardRunRow[],
  key: keyof NonNullable<NonNullable<DashboardRunRow["performance"]>["errors"]>,
): ChartPoint[] {
  return runs.map((run) => ({
    id: run.id,
    label: run.occurredAt,
    value: run.performance?.errors?.[key] ?? 0,
  }));
}

function getLatestTimingValue(
  runs: DashboardRunRow[],
  key: keyof NonNullable<NonNullable<DashboardRunRow["performance"]>["timings"]>,
) {
  return runs.find((run) => typeof run.performance?.timings?.[key] === "number")
    ?.performance?.timings?.[key];
}

function sumErrors(
  runs: DashboardRunRow[],
  key: keyof NonNullable<NonNullable<DashboardRunRow["performance"]>["errors"]>,
) {
  return runs.reduce((sum, run) => sum + (run.performance?.errors?.[key] ?? 0), 0);
}

function calculateRunStats(runs: DashboardRunRow[]): RunStatsView {
  const durations = runs
    .map((run) => run.durationMs)
    .filter((duration): duration is number => typeof duration === "number");
  const passedRuns = runs.filter((run) => run.status === "passing").length;
  const failedRuns = runs.filter((run) => run.status === "failing").length;

  return {
    averageDuration: formatClientDuration(average(durations)),
    availability:
      runs.length > 0 ? `${Math.round((passedRuns / runs.length) * 100)}%` : "-",
    failedRuns: String(failedRuns),
    p95Duration: formatClientDuration(percentile(durations, 0.95)),
    passedRuns: String(passedRuns),
    totalRuns: String(runs.length),
  };
}

function buildRunBars(runs: DashboardRunRow[]) {
  const maxDurationMs = Math.max(
    0,
    ...runs
      .map((run) => run.durationMs)
      .filter((duration): duration is number => typeof duration === "number"),
  );

  return [...runs].reverse().map((run) => ({
    duration: run.duration,
    id: run.id,
    occurredAt: run.occurredAt,
    runState: run.runState,
    status: run.status,
    tone:
      run.tone ??
      getRunResultTone({
        runState: run.runState,
        status: run.status,
      }),
    value: getRelativeRunBarHeight(run.durationMs, maxDurationMs),
  }));
}

function getRelativeRunBarHeight(
  durationMs: number | undefined,
  maxDurationMs: number,
): number {
  if (typeof durationMs !== "number" || maxDurationMs <= 0) {
    return MIN_RUN_BAR_HEIGHT;
  }

  return Math.max(
    MIN_RUN_BAR_HEIGHT,
    Math.round((durationMs / maxDurationMs) * MAX_RUN_BAR_HEIGHT),
  );
}

function average(values: number[]): number | undefined {
  if (values.length === 0) {
    return undefined;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values: number[], ratio: number): number | undefined {
  if (values.length === 0) {
    return undefined;
  }

  const sortedValues = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sortedValues.length - 1,
    Math.ceil(sortedValues.length * ratio) - 1,
  );

  return sortedValues[index];
}

function formatClientDuration(value: number | undefined) {
  if (typeof value !== "number") {
    return "-";
  }

  if (value >= 1000) {
    return `${(value / 1000).toFixed(2)} s`;
  }

  return `${Math.round(value)} ms`;
}

function formatAnalyticsDuration(value: number | undefined) {
  if (typeof value !== "number") {
    return "-";
  }

  if (value >= 60_000) {
    return `${(value / 60_000).toFixed(2)} min`;
  }

  if (value >= 1000) {
    return `${(value / 1000).toFixed(2)} s`;
  }

  return `${Math.round(value)} ms`;
}

function getRunHref(checkId: string, runId: string) {
  return `/checks/${encodeURIComponent(checkId)}/runs/${encodeURIComponent(runId)}`;
}

function DetailValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase text-slate-500">{label}</dt>
      <dd className="mt-1 truncate text-slate-200" title={value}>
        {value}
      </dd>
    </div>
  );
}

function RunStateBadge({
  runState,
  status,
}: {
  runState: DashboardRunState;
  status: DashboardStatus;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-8 items-center gap-2 rounded-md border px-2 text-xs font-semibold",
        status === "passing" && "border-emerald-700/60 text-emerald-300",
        status === "degraded" && "border-amber-700/60 text-amber-300",
        status === "failing" && "border-red-700/60 text-red-300",
      )}
    >
      <CheckStatusIcon compact runState={runState} status={status} />
      {runStateLabels[runState]}
    </span>
  );
}

type ArtifactGroup = {
  artifacts: DashboardRunArtifact[];
  count: number;
  primary: DashboardRunArtifact;
  type: DashboardRunArtifact["type"];
};

function ArtifactList({ artifacts }: { artifacts: DashboardRunArtifact[] }) {
  if (artifacts.length === 0) {
    return <span className="text-slate-500">No artifacts</span>;
  }

  const artifactGroups = groupArtifactsByType(artifacts);

  return (
    <div className="flex max-w-full flex-wrap gap-2">
      {artifactGroups.map((group) => {
        const { primary } = group;
        const Icon = getArtifactIcon(group.type);
        const label = getArtifactTypeLabel(group.type);

        return (
          <span
            className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-slate-700 bg-[#0f151d] px-2 py-1 text-xs text-slate-300"
            key={group.type}
          >
            <Icon className="h-3.5 w-3.5 shrink-0 text-slate-500" />
            <span className="min-w-0 truncate" title={getArtifactGroupTitle(group)}>
              {label}
              {group.count > 1 ? ` × ${group.count}` : ""}
              {primary.size !== "-" ? ` · ${primary.size}` : ""}
            </span>
            <a
              aria-label={`View ${primary.name}`}
              className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-800 hover:text-slate-100"
              href={primary.viewUrl}
              rel={primary.type === "trace" ? undefined : "noreferrer"}
              target={primary.type === "trace" ? undefined : "_blank"}
              title="View"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <a
              aria-label={`Download ${primary.name}`}
              className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-800 hover:text-slate-100"
              download
              href={primary.downloadUrl}
              title="Download"
            >
              <Download className="h-3.5 w-3.5" />
            </a>
          </span>
        );
      })}
    </div>
  );
}

function groupArtifactsByType(artifacts: DashboardRunArtifact[]): ArtifactGroup[] {
  const groups = new Map<DashboardRunArtifact["type"], ArtifactGroup>();

  for (const artifact of artifacts) {
    const existingGroup = groups.get(artifact.type);

    if (existingGroup) {
      existingGroup.artifacts.push(artifact);
      existingGroup.count += 1;
      continue;
    }

    groups.set(artifact.type, {
      artifacts: [artifact],
      count: 1,
      primary: artifact,
      type: artifact.type,
    });
  }

  return [...groups.values()];
}

function getArtifactGroupTitle(group: ArtifactGroup) {
  if (group.count === 1) {
    return group.primary.name;
  }

  return `${getArtifactTypeLabel(group.type)} artifacts: ${group.artifacts
    .map((artifact) => artifact.name)
    .join(", ")}`;
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

  if (runState === "running" || runState === "queued") {
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

  if (status === "degraded") {
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

function formatStatusLabel(status: DashboardStatus) {
  if (status === "passing") {
    return "passing";
  }

  if (status === "failing") {
    return "failing";
  }

  return "degraded";
}
