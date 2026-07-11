"use client";

import { type ChangeEvent, type KeyboardEvent, useEffect, useState } from "react";
import { Filter, Link2, Search, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";

import type { TestSessionRow, TestSessionsData } from "@/lib/dashboard-data";

import { RunStateBadge } from "./test-session-components";

const pageSizeOptions = [10, 20, 50, 100];
const LIVE_REFRESH_INTERVAL_MS = 2000;

export function TestSessionsClient({ initialData }: { initialData: TestSessionsData }) {
  const [data, setData] = useState(initialData);

  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  useEffect(() => {
    let cancelled = false;

    async function refreshSessions() {
      try {
        const nextData = await fetchTestSessionsData(initialData.filters);

        if (!cancelled) {
          setData(nextData);
        }
      } catch {
        // Keep the last good snapshot visible while the next poll retries.
      }
    }

    const intervalId = window.setInterval(() => {
      void refreshSessions();
    }, LIVE_REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [initialData.filters]);

  return (
    <>
      <div>
        <h1 className="text-3xl font-semibold text-slate-100">Test sessions</h1>
        <p className="mt-1 text-sm text-slate-500">
          {formatPaginationSummary(data.pagination)}
        </p>
      </div>

      <TestSessionsFilters filters={data.filters} />
      <TestSessionsTable filters={data.filters} sessions={data.sessions} />
      <TestSessionsPagination data={data} />
    </>
  );
}

function TestSessionsFilters({ filters }: { filters: TestSessionsData["filters"] }) {
  function submitForm(form: HTMLFormElement | null) {
    form?.requestSubmit();
  }

  function submitOnSelectChange(event: ChangeEvent<HTMLSelectElement>) {
    submitForm(event.currentTarget.form);
  }

  function submitOnSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    submitForm(event.currentTarget.form);
  }

  return (
    <form
      action="/test-sessions"
      className="rounded-md border border-slate-800 bg-[#111821] p-4"
      method="get"
    >
      {filters.sessionName ? (
        <input name="session" type="hidden" value={filters.sessionName} />
      ) : null}
      <div className="grid gap-3 lg:grid-cols-[minmax(18rem,1fr)_8rem]">
        <label className="relative min-w-0" htmlFor="test-sessions-search">
          <span className="sr-only">Search test sessions</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            className="h-10 w-full rounded-md border border-slate-700 bg-[#0f151d] pl-10 pr-3 text-sm text-slate-200 outline-none placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            defaultValue={filters.query}
            id="test-sessions-search"
            name="q"
            onKeyDown={submitOnSearchKeyDown}
            placeholder="Search by session, URL or check"
            type="search"
          />
        </label>

        <label className="relative min-w-0" htmlFor="test-sessions-page-size">
          <span className="sr-only">Rows per page</span>
          <SlidersHorizontal className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <select
            aria-label="Rows per page"
            className="h-10 w-full appearance-none rounded-md border border-slate-700 bg-[#0f151d] pl-10 pr-3 text-sm font-medium text-slate-200 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            defaultValue={String(filters.pageSize)}
            id="test-sessions-page-size"
            name="pageSize"
            onChange={submitOnSelectChange}
          >
            {pageSizeOptions.map((pageSize) => (
              <option key={pageSize} value={pageSize}>
                {pageSize}
              </option>
            ))}
          </select>
        </label>
      </div>

      {filters.sessionName ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex h-8 min-w-0 max-w-full items-center gap-2 rounded-md border border-blue-500/40 bg-blue-500/10 pl-2.5 pr-1 text-xs text-blue-200">
            <Filter className="h-3.5 w-3.5 shrink-0" />
            <span className="shrink-0 text-slate-400">Session:</span>
            <span className="truncate font-medium" title={filters.sessionName}>
              {filters.sessionName}
            </span>
            <Link
              aria-label="Clear session filter"
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-700 hover:text-slate-100"
              href={buildTestSessionsHref(filters, { sessionName: "" })}
              title="Clear session filter"
            >
              <X className="h-3.5 w-3.5" />
            </Link>
          </span>
        </div>
      ) : null}
    </form>
  );
}

function TestSessionsTable({
  filters,
  sessions,
}: {
  filters: TestSessionsData["filters"];
  sessions: TestSessionRow[];
}) {
  return (
    <section className="overflow-hidden rounded-md border border-slate-800 bg-[#111821]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1120px] text-left text-sm">
          <thead className="bg-[#121820] text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Session</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Passed</th>
              <th className="px-4 py-3">Failed</th>
              <th className="px-4 py-3">Running</th>
              <th className="px-4 py-3">Queued</th>
              <th className="px-4 py-3">Duration</th>
              <th className="px-4 py-3">URL</th>
            </tr>
          </thead>
          <tbody>
            {sessions.length > 0 ? (
              sessions.map((session) => (
                <TestSessionTableRow
                  filters={filters}
                  key={session.id}
                  session={session}
                />
              ))
            ) : (
              <tr>
                <td className="px-4 py-8 text-center text-slate-500" colSpan={9}>
                  No test sessions match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TestSessionTableRow({
  filters,
  session,
}: {
  filters: TestSessionsData["filters"];
  session: TestSessionRow;
}) {
  const sessionLabel = session.name || session.createdAtLabel;

  return (
    <tr className="border-t border-slate-800 align-top hover:bg-slate-900/40">
      <td className="px-4 py-3">
        <div className="flex w-72 max-w-full flex-col">
          <div className="flex min-w-0 items-center gap-1.5">
            <Link
              className="min-w-0 truncate font-medium text-blue-300 hover:text-blue-200"
              href={session.href}
              title={sessionLabel}
            >
              {sessionLabel}
            </Link>
            {session.name ? (
              <Link
                aria-label={`Filter sessions by ${session.name}`}
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-500 hover:bg-slate-800 hover:text-blue-300"
                href={buildTestSessionsHref(filters, {
                  sessionName: session.name,
                })}
                title={`Show all sessions named ${session.name}`}
              >
                <Filter className="h-3.5 w-3.5" />
              </Link>
            ) : null}
          </div>
          <span className="mt-1 truncate text-xs text-slate-500">
            {session.createdAtLabel}
          </span>
        </div>
      </td>
      <td className="px-4 py-3">
        <RunStateBadge runState={session.runState} status={session.status} />
      </td>
      <td className="px-4 py-3">
        <span className="font-semibold text-slate-300">{session.summary.total}</span>
      </td>
      <td className="px-4 py-3">
        <span className="font-semibold text-emerald-300">{session.summary.passed}</span>
      </td>
      <td className="px-4 py-3">
        <span className="font-semibold text-red-300">{session.summary.failed}</span>
      </td>
      <td className="px-4 py-3">
        <span className="font-semibold text-blue-300">{session.summary.running}</span>
      </td>
      <td className="px-4 py-3">
        <span className="font-semibold text-amber-300">{session.summary.queued}</span>
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-slate-300">{session.duration}</td>
      <td className="px-4 py-3">
        {session.targetUrl ? (
          <a
            className="inline-flex max-w-96 items-center gap-2 truncate text-blue-300 hover:text-blue-200"
            href={session.targetUrl}
            rel="noreferrer"
            target="_blank"
            title={session.targetUrl}
          >
            <Link2 className="h-4 w-4 shrink-0 text-slate-500" />
            <span className="truncate">{session.targetUrl}</span>
          </a>
        ) : (
          <span className="text-slate-600">-</span>
        )}
      </td>
    </tr>
  );
}

function TestSessionsPagination({ data }: { data: TestSessionsData }) {
  const { pagination } = data;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-400">
      <div>{formatPaginationSummary(pagination)}</div>
      <div className="flex items-center gap-2">
        <PaginationLink
          disabled={!pagination.hasPrevious}
          href={buildTestSessionsHref(data.filters, {
            page: pagination.page - 1,
          })}
        >
          Previous
        </PaginationLink>
        <span className="inline-flex h-9 items-center rounded-md border border-slate-800 px-3 text-slate-300">
          Page {pagination.page} of {pagination.totalPages}
        </span>
        <PaginationLink
          disabled={!pagination.hasNext}
          href={buildTestSessionsHref(data.filters, { page: pagination.page + 1 })}
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

function buildTestSessionsHref(
  filters: TestSessionsData["filters"],
  overrides: {
    page?: number;
    sessionName?: string;
  } = {},
) {
  const params = new URLSearchParams();
  const page = overrides.page ?? 1;
  const sessionName = overrides.sessionName ?? filters.sessionName;

  setSearchParam(params, "q", filters.query);
  setSearchParam(params, "session", sessionName);
  setSearchParam(
    params,
    "pageSize",
    filters.pageSize === 20 ? "" : String(filters.pageSize),
  );
  setSearchParam(params, "page", page === 1 ? "" : String(page));

  const query = params.toString();

  return query ? `/test-sessions?${query}` : "/test-sessions";
}

function setSearchParam(params: URLSearchParams, key: string, value: string) {
  if (value) {
    params.set(key, value);
  }
}

function formatPaginationSummary(pagination: TestSessionsData["pagination"]) {
  if (pagination.total === 0) {
    return "0 test sessions";
  }

  return `${pagination.from}-${pagination.to} of ${pagination.total} test sessions`;
}

async function fetchTestSessionsData(
  filters: TestSessionsData["filters"],
): Promise<TestSessionsData> {
  const params = new URLSearchParams();

  setSearchParam(params, "q", filters.query);
  setSearchParam(params, "session", filters.sessionName);
  setSearchParam(params, "page", String(filters.page));
  setSearchParam(params, "pageSize", String(filters.pageSize));

  const query = params.toString();
  const response = await fetch(
    query ? `/api/test-sessions?${query}` : "/api/test-sessions",
    {
      cache: "no-store",
    },
  );
  const payload = (await response.json().catch(() => ({}))) as Partial<
    TestSessionsData & { error: string }
  >;

  if (!response.ok || !payload.filters || !payload.pagination || !payload.sessions) {
    throw new Error(payload.error ?? "Unable to load test sessions.");
  }

  return payload as TestSessionsData;
}
