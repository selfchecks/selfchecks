"use client";

import { type ChangeEvent, type KeyboardEvent } from "react";
import {
  CalendarDays,
  CircleAlert,
  FolderKanban,
  Search,
  SlidersHorizontal,
  Zap,
  type LucideIcon,
} from "lucide-react";

import type {
  JournalData,
  JournalRangeFilter,
  JournalRunStatusFilter,
  JournalRunTypeFilter,
} from "@/lib/dashboard-data";

const rangeOptions: Array<{ label: string; value: JournalRangeFilter }> = [
  { label: "Last 24 hours", value: "24h" },
  { label: "Last 7 days", value: "7d" },
  { label: "Last 30 days", value: "30d" },
  { label: "All time", value: "all" },
];

const statusOptions: Array<{ label: string; value: JournalRunStatusFilter }> = [
  { label: "All statuses", value: "all" },
  { label: "Queued", value: "queued" },
  { label: "Running", value: "running" },
  { label: "Passed", value: "passed" },
  { label: "Failed", value: "failed" },
  { label: "Timed out", value: "timed_out" },
  { label: "Cancelled", value: "cancelled" },
];

const typeOptions: Array<{ label: string; value: JournalRunTypeFilter }> = [
  { label: "All check types", value: "all" },
  { label: "API checks", value: "api" },
  { label: "Browser checks", value: "browser" },
];

const pageSizeOptions = [10, 20, 50, 100];

export function JournalFilters({
  filters,
  projects = [],
}: {
  filters: JournalData["filters"];
  projects?: JournalData["projects"];
}) {
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
      action="/journal"
      className="rounded-md border border-slate-800 bg-[#111821] p-4"
      method="get"
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(18rem,1fr)_12rem_12rem_12rem_12rem_8rem]">
        <label className="relative min-w-0" htmlFor="journal-search">
          <span className="sr-only">Search runs</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            className="h-10 w-full rounded-md border border-slate-700 bg-[#0f151d] pl-10 pr-3 text-sm text-slate-200 outline-none placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            defaultValue={filters.query}
            id="journal-search"
            name="q"
            onKeyDown={submitOnSearchKeyDown}
            placeholder="Search by check, run id or error"
            type="search"
          />
        </label>

        <SelectFilter
          icon={FolderKanban}
          label="Project"
          name="project"
          onChange={submitOnSelectChange}
          options={[
            { label: "All projects", value: "all" },
            ...projects.map((project) => ({
              label: project.name,
              value: project.slug,
            })),
          ]}
          value={filters.project ?? "all"}
        />

        <SelectFilter
          icon={CircleAlert}
          label="Status"
          name="status"
          onChange={submitOnSelectChange}
          options={statusOptions}
          value={filters.status}
        />
        <SelectFilter
          icon={Zap}
          label="Check type"
          name="type"
          onChange={submitOnSelectChange}
          options={typeOptions}
          value={filters.type}
        />
        <SelectFilter
          icon={CalendarDays}
          label="Range"
          name="range"
          onChange={submitOnSelectChange}
          options={rangeOptions}
          value={filters.range}
        />
        <label className="relative min-w-0" htmlFor="journal-page-size">
          <span className="sr-only">Rows per page</span>
          <SlidersHorizontal className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <select
            aria-label="Rows per page"
            className="h-10 w-full appearance-none rounded-md border border-slate-700 bg-[#0f151d] pl-10 pr-3 text-sm font-medium text-slate-200 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            defaultValue={String(filters.pageSize)}
            id="journal-page-size"
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
    </form>
  );
}

function SelectFilter<TValue extends string>({
  icon: Icon,
  label,
  name,
  onChange,
  options,
  value,
}: {
  icon: LucideIcon;
  label: string;
  name: string;
  onChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  options: Array<{ label: string; value: TValue }>;
  value: TValue;
}) {
  return (
    <label className="relative min-w-0">
      <span className="sr-only">{label}</span>
      <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
      <select
        aria-label={label}
        className="h-10 w-full appearance-none rounded-md border border-slate-700 bg-[#0f151d] pl-10 pr-3 text-sm font-medium text-slate-200 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
        defaultValue={value}
        name={name}
        onChange={onChange}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
