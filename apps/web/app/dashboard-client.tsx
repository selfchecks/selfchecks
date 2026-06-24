"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownUp,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleX,
  Folder,
  Home,
  MoreVertical,
  Route,
  Search,
  Settings2,
  Tag,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type {
  DashboardCheckRow,
  DashboardGroupRow,
  DashboardRunState,
  DashboardStatus,
  DashboardSummary,
} from "@/lib/dashboard-types";

type Status = DashboardStatus;
type StatusFilter = Status | "all";
type TagFilter = "all" | "api" | "regress";
type TypeFilter = "all" | "api" | "browser";
type DateRange = "24h" | "7d" | "all";
type TraceFilter = "all" | "with-traces";
type DashboardSnapshot = {
  groups: GroupRow[];
  summary: DashboardSummary;
};

type NavItem = {
  active?: boolean;
  icon: LucideIcon;
  label: string;
};

type CheckRow = DashboardCheckRow;
type GroupRow = DashboardGroupRow;
type FilterOption<T extends string> = {
  label: string;
  menuLabel?: string;
  value: T;
};

const sidebarItems: NavItem[] = [{ active: true, icon: Home, label: "Home" }];

const dateRangeLabels: Record<DateRange, string> = {
  "24h": "Last 24 hours",
  "7d": "Last 7 days",
  all: "All time",
};

const statusFilterLabels: Record<StatusFilter, string> = {
  all: "Status",
  degraded: "Degraded",
  failing: "Failing",
  passing: "Passing",
};

const runStateTooltipContent: Record<
  DashboardRunState,
  { description: string; title: string }
> = {
  cancelled: {
    description: "The latest run was cancelled before completion.",
    title: "Cancelled",
  },
  failed: {
    description: "The latest run failed.",
    title: "Failing",
  },
  not_run: {
    description: "This check has no recorded runs yet.",
    title: "Not run yet",
  },
  passed: {
    description: "The latest run passed.",
    title: "Passing",
  },
  queued: {
    description: "This check has been placed in the worker queue.",
    title: "Queued",
  },
  running: {
    description: "The worker is executing this check now.",
    title: "Running",
  },
  timed_out: {
    description: "The latest run timed out.",
    title: "Timed out",
  },
};

const tagFilterLabels: Record<TagFilter, string> = {
  all: "Tags",
  api: "api",
  regress: "regress",
};

const typeFilterLabels: Record<TypeFilter, string> = {
  all: "Check type",
  api: "API checks",
  browser: "Browser checks",
};

const traceFilterLabels: Record<TraceFilter, string> = {
  all: "Traces",
  "with-traces": "With traces",
};

const dateRangeOptions = [
  { label: dateRangeLabels["24h"], value: "24h" },
  { label: dateRangeLabels["7d"], value: "7d" },
  { label: dateRangeLabels.all, value: "all" },
] satisfies Array<FilterOption<DateRange>>;

const statusFilterOptions = [
  { label: statusFilterLabels.all, menuLabel: "All statuses", value: "all" },
  { label: statusFilterLabels.passing, value: "passing" },
  { label: statusFilterLabels.degraded, value: "degraded" },
  { label: statusFilterLabels.failing, value: "failing" },
] satisfies Array<FilterOption<StatusFilter>>;

const typeFilterOptions = [
  { label: typeFilterLabels.all, menuLabel: "All check types", value: "all" },
  { label: typeFilterLabels.api, value: "api" },
  { label: typeFilterLabels.browser, value: "browser" },
] satisfies Array<FilterOption<TypeFilter>>;

const tagFilterOptions = [
  { label: tagFilterLabels.all, menuLabel: "All tags", value: "all" },
  { label: tagFilterLabels.api, value: "api" },
  { label: tagFilterLabels.regress, value: "regress" },
] satisfies Array<FilterOption<TagFilter>>;

const traceFilterOptions = [
  { label: traceFilterLabels.all, menuLabel: "All traces", value: "all" },
  { label: traceFilterLabels["with-traces"], value: "with-traces" },
] satisfies Array<FilterOption<TraceFilter>>;

export default function DashboardClient({
  initialGroups,
  initialSummary,
}: {
  initialGroups: GroupRow[];
  initialSummary: DashboardSummary;
}) {
  const [dashboard, setDashboard] = useState<DashboardSnapshot>(() => ({
    groups: initialGroups,
    summary: initialSummary,
  }));
  const { groups, summary } = dashboard;
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [activeActionMenu, setActiveActionMenu] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>("24h");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(groups.map((group) => [group.name, Boolean(group.expanded)])),
  );
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [tagFilter, setTagFilter] = useState<TagFilter>("all");
  const [traceOnly, setTraceOnly] = useState(false);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const hasActiveRuns = useMemo(
    () =>
      groups.some((group) =>
        group.children?.some((check) => ["queued", "running"].includes(check.runState)),
      ),
    [groups],
  );
  const summaryCards = useMemo(
    () =>
      [
        {
          label: "PASSING",
          status: "passing",
          tone: "border-emerald-950/80 bg-emerald-950/75 text-emerald-400 shadow-emerald-950/20",
          value: String(summary.passing),
        },
        {
          label: "DEGRADED",
          status: "degraded",
          tone: "border-amber-950/80 bg-amber-950/75 text-amber-400 shadow-amber-950/20",
          value: String(summary.degraded),
        },
        {
          label: "FAILING",
          status: "failing",
          tone: "border-red-950/80 bg-red-950/75 text-red-400 shadow-red-950/20",
          value: String(summary.failing),
        },
      ] satisfies Array<{
        label: string;
        status: Status;
        tone: string;
        value: string;
      }>,
    [summary],
  );

  useEffect(() => {
    function handleKeyboard(event: KeyboardEvent) {
      if (
        event.key === "/" &&
        document.activeElement instanceof HTMLElement &&
        !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)
      ) {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    }

    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
  }, []);

  useEffect(() => {
    if (!activeActionMenu) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (
        event.target instanceof Element &&
        event.target.closest("[data-action-menu-root]")
      ) {
        return;
      }

      setActiveActionMenu(null);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setActiveActionMenu(null);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [activeActionMenu]);

  useEffect(() => {
    if (!hasActiveRuns) {
      return;
    }

    let cancelled = false;

    async function refreshActiveRuns() {
      try {
        const nextDashboard = await fetchDashboardSnapshot();

        if (!cancelled) {
          setDashboard(nextDashboard);
        }
      } catch {
        if (!cancelled) {
          setNotice("Unable to refresh run status.");
        }
      }
    }

    const intervalId = window.setInterval(() => {
      void refreshActiveRuns();
    }, 1000);

    void refreshActiveRuns();

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [hasActiveRuns]);

  const filteredGroups = useMemo<GroupRow[]>(() => {
    const nextGroups: GroupRow[] = [];

    for (const group of groups) {
      const filteredChildren = group.children?.filter((check) =>
        doesCheckMatchFilters(check, {
          query,
          statusFilter,
          tagFilter,
          traceOnly,
          typeFilter,
        }),
      );
      const groupMatches =
        doesGroupMatchSearch(group, query) &&
        doesStatusMatch(group.status, statusFilter) &&
        !traceOnly &&
        tagFilter === "all";

      if (group.children) {
        if (filteredChildren?.length) {
          nextGroups.push({
            ...group,
            children: filteredChildren,
            checks: `${filteredChildren.length} checks`,
            expanded: expandedGroups[group.name] ?? false,
          });
          continue;
        }

        if (groupMatches) {
          nextGroups.push({
            ...group,
            expanded: expandedGroups[group.name] ?? false,
          });
        }

        continue;
      }

      if (groupMatches) {
        nextGroups.push({
          ...group,
          expanded: expandedGroups[group.name] ?? false,
        });
      }
    }

    return nextGroups;
  }, [expandedGroups, groups, query, statusFilter, tagFilter, traceOnly, typeFilter]);

  function resetDashboard() {
    setDateRange("24h");
    setExpandedGroups(
      Object.fromEntries(groups.map((group) => [group.name, Boolean(group.expanded)])),
    );
    setNotice("Dashboard filters reset.");
    setQuery("");
    setStatusFilter("all");
    setTagFilter("all");
    setTraceOnly(false);
    setTypeFilter("all");
  }

  function toggleGroup(groupName: string) {
    setExpandedGroups((current) => ({
      ...current,
      [groupName]: !current[groupName],
    }));
  }

  async function runCheckNow(check: CheckRow) {
    try {
      const response = await fetch(`/api/checks/${encodeURIComponent(check.id)}/run`, {
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        runId?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to queue check run.");
      }

      setDashboard((current) => {
        const nextGroups = markCheckQueued(current.groups, check.id);

        return {
          groups: nextGroups,
          summary: summarizeDashboardGroups(nextGroups),
        };
      });
      setNotice("");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      setNotice(`Failed to queue ${check.name}: ${message}`);
    }
  }

  return (
    <main className="min-h-screen bg-[#0d1117] text-slate-200">
      <h1 className="sr-only">Synthetic checks dashboard</h1>
      <Sidebar onHomeClick={resetDashboard} />

      <div className="min-h-screen xl:pl-72">
        <Topbar
          accountMenuOpen={accountMenuOpen}
          onAccountMenuToggle={() => setAccountMenuOpen((open) => !open)}
        />

        <section className="mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
          <div className="grid gap-4 lg:grid-cols-3">
            {summaryCards.map((card) => (
              <button
                aria-pressed={statusFilter === card.status}
                className={cn(
                  "rounded-md border px-5 py-4 text-left shadow-lg transition",
                  "shadow-black/10",
                  card.tone,
                  statusFilter === card.status && "ring-2 ring-blue-500/70",
                )}
                key={card.label}
                onClick={() =>
                  setStatusFilter((current) =>
                    current === card.status ? "all" : card.status,
                  )
                }
                type="button"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold uppercase">{card.label}</span>
                  <Settings2 className="h-4 w-4 opacity-60" />
                </div>
                <div className="mt-1 text-3xl font-semibold leading-none">
                  {card.value}
                </div>
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
              <input
                ref={searchInputRef}
                aria-label="Search checks"
                className="h-12 w-full rounded-md border border-slate-700 bg-[#111821] pl-11 pr-12 text-sm text-slate-200 outline-none placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by name, request url..."
                type="search"
                value={query}
              />
              <kbd className="pointer-events-none absolute right-3 top-1/2 flex h-7 min-w-7 -translate-y-1/2 items-center justify-center rounded bg-slate-700 px-2 text-xs text-slate-400">
                /
              </kbd>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <FilterDropdown
                active={dateRange !== "24h"}
                className="w-40"
                icon={CalendarDays}
                onChange={setDateRange}
                options={dateRangeOptions}
                value={dateRange}
              />
              <FilterDropdown
                active={statusFilter !== "all"}
                className="w-36"
                icon={CheckCircle2}
                onChange={setStatusFilter}
                options={statusFilterOptions}
                value={statusFilter}
              />
              <FilterDropdown
                active={typeFilter !== "all"}
                className="w-44"
                icon={Zap}
                onChange={setTypeFilter}
                options={typeFilterOptions}
                value={typeFilter}
              />
              <FilterDropdown
                active={tagFilter !== "all"}
                className="w-32"
                icon={Tag}
                onChange={setTagFilter}
                options={tagFilterOptions}
                value={tagFilter}
              />
              <FilterDropdown
                active={traceOnly}
                className="w-36"
                icon={Route}
                onChange={(value) => setTraceOnly(value === "with-traces")}
                options={traceFilterOptions}
                value={traceOnly ? "with-traces" : "all"}
              />
            </div>

            {notice ? (
              <div className="text-sm text-slate-400" role="status">
                {notice}
              </div>
            ) : null}
          </div>

          <ChecksTable
            activeActionMenu={activeActionMenu}
            groups={filteredGroups}
            onActionMenuToggle={(key) =>
              setActiveActionMenu((current) => (current === key ? null : key))
            }
            onGroupToggle={toggleGroup}
            onNotice={setNotice}
            onRunCheckNow={(check) => void runCheckNow(check)}
          />
        </section>
      </div>
    </main>
  );
}

function doesStatusMatch(status: Status, statusFilter: StatusFilter) {
  return statusFilter === "all" || status === statusFilter;
}

function doesGroupMatchSearch(group: GroupRow, query: string) {
  if (!query.trim()) {
    return true;
  }

  return group.name.toLowerCase().includes(query.trim().toLowerCase());
}

function doesCheckMatchFilters(
  check: CheckRow,
  filters: {
    query: string;
    statusFilter: StatusFilter;
    tagFilter: TagFilter;
    traceOnly: boolean;
    typeFilter: TypeFilter;
  },
) {
  const query = filters.query.trim().toLowerCase();
  const matchesQuery =
    !query ||
    check.name.toLowerCase().includes(query) ||
    check.tags.some((tag) => tag.toLowerCase().includes(query));

  return (
    matchesQuery &&
    doesStatusMatch(check.status, filters.statusFilter) &&
    (filters.tagFilter === "all" || check.tags.includes(filters.tagFilter)) &&
    (!filters.traceOnly || check.hasTrace) &&
    (filters.typeFilter === "all" || check.type === filters.typeFilter)
  );
}

async function fetchDashboardSnapshot(): Promise<DashboardSnapshot> {
  const response = await fetch("/api/dashboard", {
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as Partial<
    DashboardSnapshot & { error: string }
  >;

  if (!response.ok || !payload.groups || !payload.summary) {
    throw new Error(payload.error ?? "Unable to load dashboard data.");
  }

  return {
    groups: payload.groups,
    summary: payload.summary,
  };
}

function markCheckQueued(groups: GroupRow[], checkId: string): GroupRow[] {
  return groups.map((group) => {
    if (!group.children) {
      return group;
    }

    const children = group.children.map((check) =>
      check.id === checkId ? markQueuedCheck(check) : check,
    );

    return {
      ...group,
      children,
      status: summarizeDashboardStatus(children.map((check) => check.status)),
      updated: children.some((check) => check.id === checkId)
        ? "queued"
        : group.updated,
    };
  });
}

function markQueuedCheck(check: CheckRow): CheckRow {
  const queuedBar = {
    duration: "-",
    occurredAt: "Queued",
    runner: "Local runner",
    runState: "queued" as const,
    status: "degraded" as const,
    tone: "warn" as const,
    value: 18,
  };

  return {
    ...check,
    avg: "-",
    ava: check.ava === "-" ? "-" : check.ava,
    bars: [...check.bars.slice(-23), queuedBar],
    delta: "-",
    p95: "-",
    runState: "queued",
    status: "degraded",
    time: "queued",
  };
}

function summarizeDashboardGroups(groups: GroupRow[]): DashboardSummary {
  return groups
    .flatMap((group) => group.children ?? [])
    .reduce<DashboardSummary>(
      (summary, check) => ({
        ...summary,
        [check.status]: summary[check.status] + 1,
      }),
      {
        degraded: 0,
        failing: 0,
        passing: 0,
      },
    );
}

function summarizeDashboardStatus(statuses: Status[]): Status {
  if (statuses.includes("failing")) {
    return "failing";
  }

  if (statuses.includes("degraded")) {
    return "degraded";
  }

  return "passing";
}

function Sidebar({ onHomeClick }: { onHomeClick: () => void }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 flex-col border-r border-slate-800 bg-[#12171f] xl:flex">
      <div className="flex h-16 items-center gap-3 border-b border-slate-800 px-5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-600 text-white">
          <Zap className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-100">
            selfchecks
          </div>
          <div className="truncate text-xs text-slate-500">Synthetic monitoring</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-4 py-5">
        <div className="mb-2 px-1 text-xs font-semibold uppercase text-slate-500">
          Available now
        </div>
        <div className="space-y-1">
          {sidebarItems.map((item) => {
            const Icon = item.icon;

            return (
              <button
                className={cn(
                  "flex h-9 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-medium",
                  item.active
                    ? "bg-slate-700 text-slate-100"
                    : "text-slate-400 hover:bg-slate-800 hover:text-slate-200",
                )}
                key={item.label}
                onClick={onHomeClick}
                type="button"
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </aside>
  );
}

function Topbar({
  accountMenuOpen,
  onAccountMenuToggle,
}: {
  accountMenuOpen: boolean;
  onAccountMenuToggle: () => void;
}) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-800 bg-[#12171f]/95 px-4 backdrop-blur sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-600 text-white xl:hidden">
          <Zap className="h-5 w-5" />
        </div>
      </div>

      <div className="relative flex items-center">
        <button
          aria-expanded={accountMenuOpen}
          aria-label="Open account menu"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-lime-600/70 text-sm font-semibold text-lime-50 hover:bg-lime-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          onClick={onAccountMenuToggle}
          type="button"
        >
          AL
        </button>

        {accountMenuOpen ? (
          <div className="absolute right-0 top-12 z-30 w-64 rounded-md border border-slate-700 bg-[#12171f] p-3 text-sm shadow-xl shadow-black/30">
            <div className="font-medium text-slate-100">nikolaev@iprojects.ru</div>
            <div className="mt-1 text-xs text-slate-500">Signed in locally</div>
            <a
              className="mt-3 block rounded-md px-2 py-2 text-slate-300 hover:bg-slate-800"
              href="/api/auth/signout"
            >
              Sign out
            </a>
          </div>
        ) : null}
      </div>
    </header>
  );
}

function FilterDropdown<T extends string>({
  active,
  className,
  icon: Icon,
  onChange,
  options,
  value,
}: {
  active?: boolean;
  className?: string;
  icon: LucideIcon;
  onChange: (value: T) => void;
  options: Array<FilterOption<T>>;
  value: T;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selectedOption = options.find((option) => option.value === value) ?? options[0];
  const selectedLabel = selectedOption?.label ?? "";

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Element && rootRef.current?.contains(event.target)) {
        return;
      }

      setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className={cn("relative h-9", className)} ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          "flex h-full w-full items-center gap-2 rounded-md border px-3 text-sm font-medium outline-none transition",
          "hover:border-slate-600 hover:bg-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20",
          active || open
            ? "border-blue-500/60 bg-blue-500/10 text-blue-300"
            : "border-slate-700 bg-[#111821] text-slate-300",
        )}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <Icon className="h-4 w-4 shrink-0 text-slate-400" />
        <span className="min-w-0 flex-1 truncate text-left">{selectedLabel}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-slate-500 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <div
          className="absolute left-0 top-11 z-40 w-max min-w-full rounded-md border border-slate-600/80 bg-[#202832] p-1 shadow-2xl shadow-black/40"
          role="listbox"
        >
          {options.map((option) => {
            const selected = option.value === value;

            return (
              <button
                aria-selected={selected}
                className={cn(
                  "flex h-9 w-full min-w-44 items-center gap-2 rounded px-3 text-left text-sm font-medium text-slate-200 outline-none",
                  "hover:bg-slate-700 focus:bg-slate-700",
                  selected &&
                    "bg-blue-600 text-white hover:bg-blue-600 focus:bg-blue-600",
                )}
                key={option.value}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                role="option"
                type="button"
              >
                <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                  {selected ? <Check className="h-4 w-4" /> : null}
                </span>
                <span className="whitespace-nowrap">
                  {option.menuLabel ?? option.label}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function ChecksTable({
  activeActionMenu,
  groups: visibleGroups,
  onActionMenuToggle,
  onGroupToggle,
  onNotice,
  onRunCheckNow,
}: {
  activeActionMenu: string | null;
  groups: GroupRow[];
  onActionMenuToggle: (key: string) => void;
  onGroupToggle: (groupName: string) => void;
  onNotice: (notice: string) => void;
  onRunCheckNow: (check: CheckRow) => void;
}) {
  return (
    <section className="overflow-hidden rounded-md border border-slate-800 bg-[#11161d]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1120px] table-fixed text-left text-sm">
          <thead className="border-b border-slate-700 bg-[#121820] text-xs font-semibold uppercase text-slate-400">
            <tr>
              <th className="w-[46%] px-5 py-3">
                <span className="inline-flex items-center gap-2">
                  Name
                  <ArrowDownUp className="h-3.5 w-3.5 text-slate-600" />
                </span>
              </th>
              <th className="w-[8%] px-4 py-3">
                <span className="inline-flex items-center gap-2">
                  Type
                  <ArrowDownUp className="h-3.5 w-3.5 text-slate-600" />
                </span>
              </th>
              <th className="w-[18%] px-4 py-3">
                <span className="border-b border-dotted border-slate-500">
                  Last results
                </span>
              </th>
              <th className="w-[6%] px-4 py-3">
                <span className="border-b border-dotted border-slate-500">AVA</span>
              </th>
              <th className="w-[6%] px-4 py-3">
                <span className="border-b border-dotted border-slate-500">AVG</span>
              </th>
              <th className="w-[6%] px-4 py-3">
                <span className="border-b border-dotted border-slate-500">P95</span>
              </th>
              <th className="w-[6%] px-4 py-3">
                <span className="inline-flex items-center gap-2 border-b border-dotted border-slate-500">
                  DT
                  <ArrowDownUp className="h-3.5 w-3.5 text-slate-600" />
                </span>
              </th>
              <th className="w-[4%] px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {visibleGroups.map((group) => (
              <GroupBlock
                activeActionMenu={activeActionMenu}
                group={group}
                key={group.name}
                onActionMenuToggle={onActionMenuToggle}
                onGroupToggle={onGroupToggle}
                onNotice={onNotice}
                onRunCheckNow={onRunCheckNow}
              />
            ))}
            {visibleGroups.length === 0 ? (
              <tr>
                <td className="px-5 py-8 text-slate-500" colSpan={8}>
                  No checks match the current filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function GroupBlock({
  activeActionMenu,
  group,
  onActionMenuToggle,
  onGroupToggle,
  onNotice,
  onRunCheckNow,
}: {
  activeActionMenu: string | null;
  group: GroupRow;
  onActionMenuToggle: (key: string) => void;
  onGroupToggle: (groupName: string) => void;
  onNotice: (notice: string) => void;
  onRunCheckNow: (check: CheckRow) => void;
}) {
  const actionKey = `group:${group.name}`;
  const toggleLabel = `${group.expanded ? "Collapse" : "Expand"} ${group.name}`;

  return (
    <>
      <tr
        aria-expanded={group.expanded}
        aria-label={toggleLabel}
        className={cn(
          "cursor-pointer border-b border-slate-800 text-slate-300 outline-none transition",
          "hover:bg-[#202832] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500/50",
          group.expanded ? "bg-[#202832]" : "bg-[#11161d]",
        )}
        onClick={() => onGroupToggle(group.name)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onGroupToggle(group.name);
          }
        }}
        role="button"
        tabIndex={0}
      >
        <td className="px-5 py-4">
          <div className="flex items-center gap-3 text-left">
            {group.expanded ? (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronRight className="h-4 w-4 text-slate-400" />
            )}
            <GroupStatus status={group.status} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-200">{group.name}</span>
                <span className="text-sm text-slate-400">{group.checks}</span>
                <span className="text-sm text-slate-500">{group.updated}</span>
              </div>
            </div>
          </div>
        </td>
        <td className="px-4 py-4">
          <Folder className="h-5 w-5 text-slate-500" />
        </td>
        <td className="px-4 py-4" />
        <td className="px-4 py-4" />
        <td className="px-4 py-4" />
        <td className="px-4 py-4" />
        <td className="px-4 py-4" />
        <td
          className="relative px-4 py-4"
          data-action-menu-root
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <button
            aria-label={`${group.name} actions`}
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-800 hover:text-slate-200"
            onClick={() => onActionMenuToggle(actionKey)}
            type="button"
          >
            <MoreVertical className="h-5 w-5" />
          </button>
          {activeActionMenu === actionKey ? (
            <ActionMenu
              name={group.name}
              onClose={() => onActionMenuToggle(actionKey)}
              onNotice={onNotice}
              onOpen={() => onGroupToggle(group.name)}
            />
          ) : null}
        </td>
      </tr>

      {group.expanded
        ? group.children?.map((check) => (
            <CheckTableRow
              activeActionMenu={activeActionMenu}
              check={check}
              key={check.name}
              onActionMenuToggle={onActionMenuToggle}
              onNotice={onNotice}
              onRunCheckNow={onRunCheckNow}
            />
          ))
        : null}
    </>
  );
}

function CheckTableRow({
  activeActionMenu,
  check,
  onActionMenuToggle,
  onNotice,
  onRunCheckNow,
}: {
  activeActionMenu: string | null;
  check: CheckRow;
  onActionMenuToggle: (key: string) => void;
  onNotice: (notice: string) => void;
  onRunCheckNow: (check: CheckRow) => void;
}) {
  const actionKey = `check:${check.name}`;

  return (
    <tr className="border-b border-slate-800 bg-[#141a21] text-slate-300 hover:bg-[#18202a]">
      <td className="px-5 py-3">
        <div className="flex items-center gap-4 pl-9">
          <CheckStatus runState={check.runState} status={check.status} />
          <div className="min-w-0">
            <div className="truncate font-semibold text-slate-200">{check.name}</div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-slate-500">
              <span
                className={cn(
                  check.runState === "queued" && "font-medium text-amber-300",
                  check.runState === "running" && "font-medium text-blue-300",
                )}
              >
                {check.time}
              </span>
              {check.tags.map((tag) => (
                <span
                  className="rounded bg-slate-700 px-1.5 py-0.5 text-xs font-semibold text-slate-300"
                  key={tag}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <span className="inline-flex h-5 items-center rounded border border-slate-500 px-1 text-[10px] font-bold uppercase text-slate-400">
          {check.type}
        </span>
      </td>
      <td className="px-4 py-3">
        <SparkBars bars={check.bars} />
      </td>
      <td className="px-4 py-3 text-slate-300">{check.ava}</td>
      <td className="px-4 py-3 text-slate-300">{check.avg}</td>
      <td className="px-4 py-3 text-slate-300">{check.p95}</td>
      <td className="px-4 py-3 text-slate-300">{check.delta}</td>
      <td className="relative px-4 py-3" data-action-menu-root>
        <button
          aria-label={`${check.name} actions`}
          className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-800 hover:text-slate-200"
          onClick={() => onActionMenuToggle(actionKey)}
          type="button"
        >
          <MoreVertical className="h-5 w-5" />
        </button>
        {activeActionMenu === actionKey ? (
          <ActionMenu
            name={check.name}
            onClose={() => onActionMenuToggle(actionKey)}
            onNotice={onNotice}
            onOpen={() => onNotice(`Selected ${check.name}.`)}
            onRunNow={() => onRunCheckNow(check)}
          />
        ) : null}
      </td>
    </tr>
  );
}

function ActionMenu({
  name,
  onClose,
  onNotice,
  onOpen,
  onRunNow,
}: {
  name: string;
  onClose: () => void;
  onNotice: (notice: string) => void;
  onOpen: () => void;
  onRunNow?: () => void;
}) {
  async function copyName() {
    await navigator.clipboard?.writeText(name);
    onNotice(`Copied ${name}.`);
    onClose();
  }

  return (
    <div className="absolute right-3 top-10 z-20 w-40 rounded-md border border-slate-700 bg-[#12171f] p-1 shadow-xl shadow-black/30">
      <button
        className="block w-full rounded px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-800"
        onClick={() => {
          onOpen();
          onClose();
        }}
        type="button"
      >
        Open
      </button>
      {onRunNow ? (
        <button
          className="block w-full rounded px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-800"
          onClick={() => {
            onRunNow();
            onClose();
          }}
          type="button"
        >
          Run now
        </button>
      ) : null}
      <button
        className="block w-full rounded px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-800"
        onClick={() => void copyName()}
        type="button"
      >
        Copy name
      </button>
    </div>
  );
}

function GroupStatus({ status }: { status: Status }) {
  return (
    <span
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-[5px]",
        status === "passing" && "border-emerald-500",
        status === "degraded" && "border-emerald-500 border-t-amber-400",
        status === "failing" && "border-red-500",
      )}
    />
  );
}

function CheckStatus({
  runState,
  status,
}: {
  runState: DashboardRunState;
  status: Status;
}) {
  if (status === "degraded") {
    return (
      <StatusTooltip runState={runState}>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-400 text-amber-950">
          <CircleAlert className="h-5 w-5" />
        </span>
      </StatusTooltip>
    );
  }

  if (status === "failing") {
    return (
      <StatusTooltip runState={runState}>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-500 text-white">
          <CircleX className="h-5 w-5" />
        </span>
      </StatusTooltip>
    );
  }

  return (
    <StatusTooltip runState={runState}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-emerald-950">
        <CheckCircle2 className="h-5 w-5" />
      </span>
    </StatusTooltip>
  );
}

function StatusTooltip({
  children,
  runState,
}: {
  children: ReactNode;
  runState: DashboardRunState;
}) {
  const content = runStateTooltipContent[runState];

  return (
    <span
      aria-label={`${content.title}: ${content.description}`}
      className="group/status relative inline-flex shrink-0 outline-none"
      tabIndex={0}
    >
      {children}
      <span
        className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-3 hidden w-64 -translate-x-1/2 rounded-md border border-slate-500/20 bg-slate-600 px-3 py-2 text-left text-sm text-slate-100 shadow-2xl shadow-black/40 group-hover/status:block group-focus/status:block"
        role="tooltip"
      >
        <span className="block font-semibold text-slate-50">{content.title}</span>
        <span className="mt-1 block text-slate-200">{content.description}</span>
        <span className="absolute left-1/2 top-full h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-slate-600" />
      </span>
    </span>
  );
}

function SparkBars({ bars }: { bars: CheckRow["bars"] }) {
  return (
    <div className="flex h-12 items-end gap-1 overflow-visible py-1">
      {bars.map((bar, index) => {
        const tooltipContent = runStateTooltipContent[bar.runState];

        return (
          <span
            aria-label={`${tooltipContent.title} ${bar.runner} ${bar.duration} ${bar.occurredAt}`}
            className="group relative flex h-11 w-2 items-end justify-center outline-none hover:z-20 focus-visible:ring-2 focus-visible:ring-blue-400/60 focus-within:z-20"
            key={`${bar.occurredAt}-${bar.value}-${index}`}
            tabIndex={0}
          >
            <span
              aria-hidden="true"
              className={cn(
                "block w-1 rounded-sm transition",
                bar.tone === "active" && "bg-blue-400",
                bar.tone === "warn" && "bg-amber-400",
                (!bar.tone || bar.tone === "good") && "bg-emerald-400",
              )}
              style={{ height: `${bar.value}px` }}
            />
            <span
              className={cn(
                "pointer-events-none absolute bottom-full left-1/2 z-30 mb-3 hidden w-max min-w-64 -translate-x-1/2 rounded-md border border-slate-500/20 bg-slate-600 px-4 py-3 text-left shadow-2xl shadow-black/40",
                "group-hover:block group-focus-within:block",
              )}
              role="tooltip"
            >
              <span className="flex items-center gap-2 text-base font-semibold text-slate-50">
                <ResultTooltipStatus runState={bar.runState} status={bar.status} />
                {tooltipContent.title}
              </span>
              <span className="mt-2 flex items-center gap-6 text-sm text-slate-100">
                <span>{bar.runner}</span>
                <span>{bar.duration}</span>
                <span>{bar.occurredAt}</span>
              </span>
              <span className="absolute left-1/2 top-full h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-slate-600" />
            </span>
          </span>
        );
      })}
    </div>
  );
}

function ResultTooltipStatus({
  runState,
  status,
}: {
  runState: DashboardRunState;
  status: Status;
}) {
  if (runState === "running") {
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-blue-950">
        <Zap className="h-4 w-4" />
      </span>
    );
  }

  if (status === "failing") {
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white">
        <CircleX className="h-4 w-4" />
      </span>
    );
  }

  if (status === "degraded") {
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-400 text-amber-950">
        <CircleAlert className="h-4 w-4" />
      </span>
    );
  }

  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-emerald-950">
      <CheckCircle2 className="h-4 w-4" />
    </span>
  );
}
