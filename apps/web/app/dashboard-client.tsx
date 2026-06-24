"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownUp,
  CalendarDays,
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
  DashboardStatus,
  DashboardSummary,
} from "@/lib/dashboard-types";

type Status = DashboardStatus;
type StatusFilter = Status | "all";
type TagFilter = "all" | "api" | "regress";
type TypeFilter = "all" | "api" | "browser";
type DateRange = "24h" | "7d" | "all";
type TraceFilter = "all" | "with-traces";

type NavItem = {
  active?: boolean;
  icon: LucideIcon;
  label: string;
};

type CheckRow = DashboardCheckRow;
type GroupRow = DashboardGroupRow;
type FilterOption<T extends string> = {
  label: string;
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
  { label: statusFilterLabels.all, value: "all" },
  { label: statusFilterLabels.passing, value: "passing" },
  { label: statusFilterLabels.degraded, value: "degraded" },
  { label: statusFilterLabels.failing, value: "failing" },
] satisfies Array<FilterOption<StatusFilter>>;

const typeFilterOptions = [
  { label: typeFilterLabels.all, value: "all" },
  { label: typeFilterLabels.api, value: "api" },
  { label: typeFilterLabels.browser, value: "browser" },
] satisfies Array<FilterOption<TypeFilter>>;

const tagFilterOptions = [
  { label: tagFilterLabels.all, value: "all" },
  { label: tagFilterLabels.api, value: "api" },
  { label: tagFilterLabels.regress, value: "regress" },
] satisfies Array<FilterOption<TagFilter>>;

const traceFilterOptions = [
  { label: traceFilterLabels.all, value: "all" },
  { label: traceFilterLabels["with-traces"], value: "with-traces" },
] satisfies Array<FilterOption<TraceFilter>>;

export default function DashboardClient({
  initialGroups,
  initialSummary,
}: {
  initialGroups: GroupRow[];
  initialSummary: DashboardSummary;
}) {
  const groups = initialGroups;
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
  const summaryCards = useMemo(
    () =>
      [
        {
          label: "PASSING",
          status: "passing",
          tone: "border-emerald-950/80 bg-emerald-950/75 text-emerald-400 shadow-emerald-950/20",
          value: String(initialSummary.passing),
        },
        {
          label: "DEGRADED",
          status: "degraded",
          tone: "border-amber-950/80 bg-amber-950/75 text-amber-400 shadow-amber-950/20",
          value: String(initialSummary.degraded),
        },
        {
          label: "FAILING",
          status: "failing",
          tone: "border-red-950/80 bg-red-950/75 text-red-400 shadow-red-950/20",
          value: String(initialSummary.failing),
        },
      ] satisfies Array<{
        label: string;
        status: Status;
        tone: string;
        value: string;
      }>,
    [initialSummary],
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
              <FilterSelect
                active={dateRange !== "24h"}
                ariaLabel="Time range"
                className="w-40"
                icon={CalendarDays}
                onChange={setDateRange}
                options={dateRangeOptions}
                value={dateRange}
              />
              <FilterSelect
                active={statusFilter !== "all"}
                ariaLabel="Status"
                className="w-36"
                icon={CheckCircle2}
                onChange={setStatusFilter}
                options={statusFilterOptions}
                value={statusFilter}
              />
              <FilterSelect
                active={typeFilter !== "all"}
                ariaLabel="Check type"
                className="w-44"
                icon={Zap}
                onChange={setTypeFilter}
                options={typeFilterOptions}
                value={typeFilter}
              />
              <FilterSelect
                active={tagFilter !== "all"}
                ariaLabel="Tags"
                className="w-32"
                icon={Tag}
                onChange={setTagFilter}
                options={tagFilterOptions}
                value={tagFilter}
              />
              <FilterSelect
                active={traceOnly}
                ariaLabel="Traces"
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

function FilterSelect<T extends string>({
  active,
  ariaLabel,
  className,
  icon: Icon,
  onChange,
  options,
  value,
}: {
  active?: boolean;
  ariaLabel: string;
  className?: string;
  icon: LucideIcon;
  onChange: (value: T) => void;
  options: Array<FilterOption<T>>;
  value: T;
}) {
  return (
    <div className={cn("relative h-9", className)}>
      <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <select
        aria-label={ariaLabel}
        className={cn(
          "h-full w-full appearance-none rounded-md border pl-9 pr-9 text-sm font-medium outline-none transition",
          "hover:border-slate-600 hover:bg-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20",
          active
            ? "border-blue-500/60 bg-blue-500/10 text-blue-300"
            : "border-slate-700 bg-[#111821] text-slate-300",
        )}
        onChange={(event) => onChange(event.target.value as T)}
        value={value}
      >
        {options.map((option) => (
          <option
            className="bg-[#111821] text-slate-200"
            key={option.value}
            value={option.value}
          >
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
    </div>
  );
}

function ChecksTable({
  activeActionMenu,
  groups: visibleGroups,
  onActionMenuToggle,
  onGroupToggle,
  onNotice,
}: {
  activeActionMenu: string | null;
  groups: GroupRow[];
  onActionMenuToggle: (key: string) => void;
  onGroupToggle: (groupName: string) => void;
  onNotice: (notice: string) => void;
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
}: {
  activeActionMenu: string | null;
  group: GroupRow;
  onActionMenuToggle: (key: string) => void;
  onGroupToggle: (groupName: string) => void;
  onNotice: (notice: string) => void;
}) {
  const actionKey = `group:${group.name}`;

  return (
    <>
      <tr
        className={cn(
          "border-b border-slate-800 text-slate-300",
          group.expanded ? "bg-[#202832]" : "bg-[#11161d]",
        )}
      >
        <td className="px-5 py-4">
          <button
            aria-label={`${group.expanded ? "Collapse" : "Expand"} ${group.name}`}
            className="flex items-center gap-3 text-left"
            onClick={() => onGroupToggle(group.name)}
            type="button"
          >
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
          </button>
        </td>
        <td className="px-4 py-4">
          <Folder className="h-5 w-5 text-slate-500" />
        </td>
        <td className="px-4 py-4" />
        <td className="px-4 py-4" />
        <td className="px-4 py-4" />
        <td className="px-4 py-4" />
        <td className="px-4 py-4" />
        <td className="relative px-4 py-4">
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
}: {
  activeActionMenu: string | null;
  check: CheckRow;
  onActionMenuToggle: (key: string) => void;
  onNotice: (notice: string) => void;
}) {
  const actionKey = `check:${check.name}`;

  return (
    <tr className="border-b border-slate-800 bg-[#141a21] text-slate-300 hover:bg-[#18202a]">
      <td className="px-5 py-3">
        <div className="flex items-center gap-4 pl-9">
          <CheckStatus status={check.status} />
          <div className="min-w-0">
            <div className="truncate font-semibold text-slate-200">{check.name}</div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-slate-500">
              <span>{check.time}</span>
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
      <td className="relative px-4 py-3">
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
}: {
  name: string;
  onClose: () => void;
  onNotice: (notice: string) => void;
  onOpen: () => void;
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

function CheckStatus({ status }: { status: Status }) {
  if (status === "degraded") {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-400 text-amber-950">
        <CircleAlert className="h-5 w-5" />
      </span>
    );
  }

  if (status === "failing") {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-500 text-white">
        <CircleX className="h-5 w-5" />
      </span>
    );
  }

  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-emerald-950">
      <CheckCircle2 className="h-5 w-5" />
    </span>
  );
}

function SparkBars({ bars }: { bars: CheckRow["bars"] }) {
  return (
    <div className="flex h-10 items-end gap-1">
      {bars.map((bar, index) => (
        <span
          className={cn(
            "w-1 rounded-sm",
            bar.tone === "warn" ? "bg-amber-400" : "bg-emerald-400",
          )}
          key={`${bar.value}-${index}`}
          style={{ height: `${bar.value}px` }}
        />
      ))}
    </div>
  );
}
