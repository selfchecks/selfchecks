import {
  CheckCircle2,
  CircleAlert,
  CircleX,
  Clock3,
  ExternalLink,
  History,
} from "lucide-react";
import Link from "next/link";

import { AppSidebar } from "@/components/app-sidebar";
import { ServiceMark } from "@/components/service-mark";
import {
  getJournalData,
  type JournalData,
  type JournalRangeFilter,
  type JournalRunRow,
  type JournalRunStatusFilter,
  type JournalRunTypeFilter,
} from "@/lib/dashboard-data";
import type { DashboardRunState, DashboardStatus } from "@/lib/dashboard-types";
import { getDashboardSettingsData } from "@/lib/settings-data";
import { cn } from "@/lib/utils";
import { JournalFilters } from "./journal-filters";

export const dynamic = "force-dynamic";

type JournalPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
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

export default async function JournalPage({ searchParams }: JournalPageProps) {
  const params = searchParams ? await searchParams : {};
  const journal = await getJournalData("default", {
    page: readNumberParam(params.page),
    pageSize: readNumberParam(params.pageSize),
    query: readStringParam(params.q),
    range: readStringParam(params.range) as JournalRangeFilter | undefined,
    status: readStringParam(params.status) as JournalRunStatusFilter | undefined,
    type: readStringParam(params.type) as JournalRunTypeFilter | undefined,
  });
  const settings = await getDashboardSettingsData(journal.projectSlug);

  return (
    <main className="min-h-screen bg-[#0d1117] text-slate-200">
      <AppSidebar activeItem="journal" />

      <div className="min-h-screen xl:pl-72">
        <header className="sticky top-0 z-30 border-b border-slate-800 bg-[#12171f]/95 backdrop-blur">
          <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3 text-sm text-slate-400">
              <ServiceMark className="h-9 w-9 shrink-0 rounded-md xl:hidden" />
              <span className="hidden truncate sm:inline">
                {settings.basic.login || "Admin"}
              </span>
              <span className="hidden text-slate-600 sm:inline">/</span>
              <span className="inline-flex min-w-0 items-center gap-2 truncate text-slate-200">
                <History className="h-4 w-4 shrink-0" />
                Journal
              </span>
            </div>
            <div className="hidden text-sm text-slate-500 sm:block">
              Project {journal.projectSlug}
            </div>
          </div>
        </header>

        <section className="mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
          <div>
            <h1 className="text-3xl font-semibold text-slate-100">Journal</h1>
            <p className="mt-1 text-sm text-slate-500">
              {formatPaginationSummary(journal.pagination)}
            </p>
          </div>

          <JournalFilters filters={journal.filters} />
          <JournalTable runs={journal.runs} />
          <JournalPagination journal={journal} />
        </section>
      </div>
    </main>
  );
}

function JournalTable({ runs }: { runs: JournalRunRow[] }) {
  return (
    <section className="overflow-hidden rounded-md border border-slate-800 bg-[#111821]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="bg-[#121820] text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Run</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Check</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Schedule</th>
              <th className="px-4 py-3">Duration</th>
              <th className="px-4 py-3" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {runs.length > 0 ? (
              runs.map((run) => <JournalRunRowView key={run.id} run={run} />)
            ) : (
              <tr>
                <td className="px-4 py-8 text-center text-slate-500" colSpan={7}>
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

function JournalRunRowView({ run }: { run: JournalRunRow }) {
  return (
    <tr className="border-t border-slate-800 align-top hover:bg-slate-900/40">
      <td className="px-4 py-3">
        <Link
          className="inline-flex max-w-48 flex-col text-blue-300 hover:text-blue-200"
          href={run.runHref}
        >
          <span className="truncate font-medium">{run.createdAtLabel}</span>
          <span className="mt-1 truncate text-xs text-slate-500">{run.id}</span>
        </Link>
      </td>
      <td className="px-4 py-3">
        <RunStateBadge runState={run.runState} status={run.status} />
      </td>
      <td className="px-4 py-3">
        <div className="min-w-0 max-w-72">
          <Link
            className="block truncate font-medium text-slate-100 hover:text-blue-200"
            href={run.checkHref}
            title={run.checkName}
          >
            {run.checkName}
          </Link>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="truncate">{run.groupName}</span>
            <span className="text-slate-700">/</span>
            <span className="truncate">{run.checkKey}</span>
          </div>
          {run.checkTags.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {run.checkTags.slice(0, 3).map((tag) => (
                <span
                  className="rounded bg-slate-700 px-1.5 py-0.5 text-[11px] font-semibold text-slate-300"
                  key={tag}
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </td>
      <td className="px-4 py-3">
        <span className="inline-flex rounded border border-slate-700 px-2 py-1 text-xs font-bold uppercase text-slate-300">
          {run.checkType}
        </span>
      </td>
      <td className="px-4 py-3 text-slate-300">
        {run.schedule === "manual" ? "Manual" : `Every ${run.schedule}`}
        {run.sessionName ? (
          <div className="mt-1 max-w-40 truncate text-xs text-slate-500">
            {run.sessionName}
          </div>
        ) : null}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-slate-300">{run.duration}</td>
      <td className="px-4 py-3">
        <Link
          aria-label={`Open run ${run.id}`}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-100"
          href={run.runHref}
          title="Open run"
        >
          <ExternalLink className="h-4 w-4" />
        </Link>
      </td>
    </tr>
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
      <RunStateIcon runState={runState} status={status} />
      {runStateLabels[runState]}
    </span>
  );
}

function RunStateIcon({
  runState,
  status,
}: {
  runState: DashboardRunState;
  status: DashboardStatus;
}) {
  if (runState === "running") {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500 text-white">
        <Clock3 className="h-3.5 w-3.5" />
      </span>
    );
  }

  if (runState === "queued" || status === "degraded") {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-400 text-amber-950">
        <CircleAlert className="h-3.5 w-3.5" />
      </span>
    );
  }

  if (status === "failing") {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-500 text-white">
        <CircleX className="h-3.5 w-3.5" />
      </span>
    );
  }

  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-emerald-950">
      <CheckCircle2 className="h-3.5 w-3.5" />
    </span>
  );
}

function JournalPagination({ journal }: { journal: JournalData }) {
  const { pagination } = journal;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-400">
      <div>{formatPaginationSummary(pagination)}</div>
      <div className="flex items-center gap-2">
        <PaginationLink
          disabled={!pagination.hasPrevious}
          href={buildJournalHref(journal, { page: pagination.page - 1 })}
        >
          Previous
        </PaginationLink>
        <span className="inline-flex h-9 items-center rounded-md border border-slate-800 px-3 text-slate-300">
          Page {pagination.page} of {pagination.totalPages}
        </span>
        <PaginationLink
          disabled={!pagination.hasNext}
          href={buildJournalHref(journal, { page: pagination.page + 1 })}
        >
          Next
        </PaginationLink>
      </div>
    </div>
  );
}

function PaginationLink({
  children,
  disabled,
  href,
}: {
  children: string;
  disabled: boolean;
  href: string;
}) {
  if (disabled) {
    return (
      <span className="inline-flex h-9 cursor-not-allowed items-center rounded-md border border-slate-800 px-3 text-slate-600">
        {children}
      </span>
    );
  }

  return (
    <Link
      className="inline-flex h-9 items-center rounded-md border border-slate-700 px-3 font-semibold text-slate-300 hover:bg-slate-800 hover:text-slate-100"
      href={href}
    >
      {children}
    </Link>
  );
}

function buildJournalHref(journal: JournalData, overrides: { page: number }) {
  const params = new URLSearchParams();
  const { filters } = journal;

  setSearchParam(params, "q", filters.query);
  setSearchParam(params, "status", filters.status === "all" ? "" : filters.status);
  setSearchParam(params, "type", filters.type === "all" ? "" : filters.type);
  setSearchParam(params, "range", filters.range === "7d" ? "" : filters.range);
  setSearchParam(
    params,
    "pageSize",
    filters.pageSize === 20 ? "" : String(filters.pageSize),
  );
  setSearchParam(params, "page", overrides.page === 1 ? "" : String(overrides.page));

  const query = params.toString();

  return query ? `/journal?${query}` : "/journal";
}

function setSearchParam(params: URLSearchParams, key: string, value: string) {
  if (value) {
    params.set(key, value);
  }
}

function formatPaginationSummary(pagination: JournalData["pagination"]) {
  if (pagination.total === 0) {
    return "0 runs";
  }

  return `${pagination.from}-${pagination.to} of ${pagination.total} runs`;
}

function readStringParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function readNumberParam(value: string | string[] | undefined) {
  const rawValue = readStringParam(value);

  if (!rawValue) {
    return undefined;
  }

  const parsedValue = Number.parseInt(rawValue, 10);

  return Number.isSafeInteger(parsedValue) ? parsedValue : undefined;
}
