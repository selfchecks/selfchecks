import { ArrowRight, ExternalLink, ScrollText } from "lucide-react";
import Link from "next/link";
import { Suspense, use } from "react";

import { AppSidebar } from "@/components/app-sidebar";
import { ServiceMark } from "@/components/service-mark";
import {
  getStatusLogsData,
  type StatusLogRow,
  type StatusLogsData,
} from "@/lib/dashboard-data";
import type { DashboardStatus } from "@/lib/dashboard-types";
import { getDashboardAccountLabel } from "@/lib/settings-data";
import { cn } from "@/lib/utils";

import { StatusLogsContentSkeleton } from "./logs-skeleton";

export const dynamic = "force-dynamic";

type LogsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type StatusLogsDataPromise = ReturnType<typeof getStatusLogsData>;

const statusLabels: Record<DashboardStatus, string> = {
  degraded: "Degraded",
  failing: "Failed",
  passing: "Passing",
};

export default async function LogsPage({ searchParams }: LogsPageProps) {
  const params = searchParams ? await searchParams : {};
  const page = readNumberParam(params.page);
  const pageSize = readNumberParam(params.pageSize);
  const dataPromise = getStatusLogsData("default", { page, pageSize });
  const accountLabel = getDashboardAccountLabel();

  return (
    <main className="min-h-screen bg-[#0d1117] text-slate-200">
      <AppSidebar accountLabel={accountLabel} activeItem="logs" projectSlug="all" />

      <div className="min-h-screen xl:pl-72">
        <header className="sticky top-0 z-30 border-b border-slate-800 bg-[#12171f]/95 backdrop-blur">
          <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3 text-sm text-slate-400">
              <ServiceMark className="h-9 w-9 shrink-0 rounded-md xl:hidden" />
              <span className="hidden truncate sm:inline">{accountLabel}</span>
              <span className="hidden text-slate-600 sm:inline">/</span>
              <span className="inline-flex min-w-0 items-center gap-2 truncate text-slate-200">
                <ScrollText className="h-4 w-4 shrink-0" />
                Logs
              </span>
            </div>
            <div className="hidden text-sm text-slate-500 sm:block">All projects</div>
          </div>
        </header>

        <section className="mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
          <div>
            <h1 className="text-3xl font-semibold text-slate-100">Logs</h1>
            <p className="mt-1 text-sm text-slate-500">
              Test status changes from completed dashboard runs. Queued and running
              states are excluded.
            </p>
          </div>

          <Suspense
            fallback={<StatusLogsContentSkeleton />}
            key={`${page ?? 1}:${pageSize ?? 20}`}
          >
            <StatusLogsContent dataPromise={dataPromise} />
          </Suspense>
        </section>
      </div>
    </main>
  );
}

function StatusLogsContent({ dataPromise }: { dataPromise: StatusLogsDataPromise }) {
  const data = use(dataPromise);

  return (
    <>
      <StatusLogsTable logs={data.logs} />
      <StatusLogsPagination data={data} />
    </>
  );
}

function StatusLogsTable({ logs }: { logs: StatusLogRow[] }) {
  return (
    <section className="overflow-hidden rounded-md border border-slate-800 bg-[#111821]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="bg-[#121820] text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Changed at</th>
              <th className="px-4 py-3">Status change</th>
              <th className="px-4 py-3">Check</th>
              <th className="px-4 py-3">Project</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {logs.length > 0 ? (
              logs.map((log) => <StatusLogRowView key={log.id} log={log} />)
            ) : (
              <tr>
                <td className="px-4 py-8 text-center text-slate-500" colSpan={6}>
                  No status changes recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function StatusLogRowView({ log }: { log: StatusLogRow }) {
  return (
    <tr className="border-t border-slate-800 align-middle hover:bg-slate-900/40">
      <td className="whitespace-nowrap px-4 py-3 text-slate-300">
        {log.createdAtLabel}
      </td>
      <td className="px-4 py-3">
        <StatusTransition from={log.fromStatus} to={log.toStatus} />
      </td>
      <td className="px-4 py-3">
        <div className="min-w-0 max-w-80">
          <Link
            className="block truncate font-medium text-slate-100 hover:text-blue-200"
            href={log.checkHref}
            title={log.checkName}
          >
            {log.checkName}
          </Link>
          <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-slate-500">
            <span className="truncate">{log.groupName}</span>
            <span className="text-slate-700">/</span>
            <span className="truncate">{log.checkKey}</span>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-slate-300">{log.projectSlug}</td>
      <td className="px-4 py-3">
        <span className="inline-flex rounded border border-slate-700 px-2 py-1 text-xs font-bold uppercase text-slate-300">
          {log.checkType}
        </span>
      </td>
      <td className="px-4 py-3">
        <Link
          aria-label={`Open run ${log.id}`}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-100"
          href={log.runHref}
          title="Open run"
        >
          <ExternalLink className="h-4 w-4" />
        </Link>
      </td>
    </tr>
  );
}

function StatusTransition({
  from,
  to,
}: {
  from: DashboardStatus;
  to: DashboardStatus;
}) {
  return (
    <span
      aria-label={`Status changed from ${statusLabels[from]} to ${statusLabels[to]}`}
      className="inline-flex items-center gap-2"
    >
      <StatusBadge status={from} />
      <ArrowRight className="h-4 w-4 shrink-0 text-slate-600" />
      <StatusBadge status={to} />
    </span>
  );
}

function StatusBadge({ status }: { status: DashboardStatus }) {
  return (
    <span
      className={cn(
        "inline-flex h-8 items-center gap-2 whitespace-nowrap rounded-md border px-2 text-xs font-semibold",
        status === "passing" && "border-emerald-700/60 text-emerald-300",
        status === "degraded" && "border-amber-700/60 text-amber-300",
        status === "failing" && "border-red-700/60 text-red-300",
      )}
    >
      <span
        className={cn(
          "h-2 w-2 rounded-full",
          status === "passing" && "bg-emerald-400",
          status === "degraded" && "bg-amber-400",
          status === "failing" && "bg-red-400",
        )}
      />
      {statusLabels[status]}
    </span>
  );
}

function StatusLogsPagination({ data }: { data: StatusLogsData }) {
  const { pagination } = data;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-400">
      <div>{formatPaginationSummary(pagination)}</div>
      <div className="flex items-center gap-2">
        <PaginationLink
          disabled={!pagination.hasPrevious}
          href={buildLogsHref(pagination.page - 1, pagination.pageSize)}
        >
          Previous
        </PaginationLink>
        <span className="inline-flex h-9 items-center rounded-md border border-slate-800 px-3 text-slate-300">
          Page {pagination.page} of {pagination.totalPages}
        </span>
        <PaginationLink
          disabled={!pagination.hasNext}
          href={buildLogsHref(pagination.page + 1, pagination.pageSize)}
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

function formatPaginationSummary(pagination: StatusLogsData["pagination"]) {
  if (pagination.total === 0) {
    return "0 status changes";
  }

  return `${pagination.from}-${pagination.to} of ${pagination.total} status changes`;
}

function buildLogsHref(page: number, pageSize: number) {
  const params = new URLSearchParams();

  if (page > 1) {
    params.set("page", String(page));
  }

  if (pageSize !== 20) {
    params.set("pageSize", String(pageSize));
  }

  const query = params.toString();

  return query ? `/logs?${query}` : "/logs";
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
