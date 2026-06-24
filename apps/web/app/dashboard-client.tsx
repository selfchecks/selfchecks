"use client";

import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowDownUp,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
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
  Gauge,
  Home,
  History,
  KeyRound,
  LockKeyhole,
  MoreVertical,
  Plus,
  Route,
  Save,
  Search,
  ServerCog,
  Settings2,
  SlidersHorizontal,
  Tag,
  Trash2,
  UserRound,
  Video,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import type {
  DashboardCheckRow,
  DashboardGroupRow,
  DashboardRunArtifact,
  DashboardRunState,
  DashboardStatus,
  DashboardSummary,
} from "@/lib/dashboard-types";
import type {
  DashboardSettingsData,
  RuntimeEnvironmentSettingsData,
} from "@/lib/settings-data";

type Status = DashboardStatus;
type ActiveView = "dashboard" | "settings";
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
  id: ActiveView;
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
type RuntimeVariableDraft = {
  id: string;
  name: string;
  value: string;
};
type RuntimeSecretDraft = {
  currentName?: string;
  hasValue: boolean;
  id: string;
  name: string;
  updatedAt?: string;
  value: string;
};

const sidebarItems: NavItem[] = [
  { icon: Home, id: "dashboard", label: "Home" },
  { icon: Settings2, id: "settings", label: "Settings" },
];

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
  initialSettings,
  initialSummary,
}: {
  initialGroups: GroupRow[];
  initialSettings: DashboardSettingsData;
  initialSummary: DashboardSummary;
}) {
  const [activeView, setActiveView] = useState<ActiveView>("dashboard");
  const [dashboard, setDashboard] = useState<DashboardSnapshot>(() => ({
    groups: initialGroups,
    summary: initialSummary,
  }));
  const [settings, setSettings] = useState<DashboardSettingsData>(initialSettings);
  const { groups, summary } = dashboard;
  const router = useRouter();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [activeActionMenu, setActiveActionMenu] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>("24h");
  const [expandedChecks, setExpandedChecks] = useState<Record<string, boolean>>({});
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
    setActiveView("dashboard");
    setDateRange("24h");
    setExpandedChecks({});
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

  function openSettings() {
    setActiveView("settings");
    setAccountMenuOpen(false);
    setActiveActionMenu(null);
  }

  function toggleGroup(groupName: string) {
    setExpandedGroups((current) => ({
      ...current,
      [groupName]: !current[groupName],
    }));
  }

  function toggleCheck(checkId: string) {
    router.push(`/checks/${encodeURIComponent(checkId)}`);
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
      <Sidebar
        activeView={activeView}
        onDashboardClick={resetDashboard}
        onSettingsClick={openSettings}
      />

      <div className="min-h-screen xl:pl-72">
        <Topbar
          accountMenuOpen={accountMenuOpen}
          accountLabel={settings.basic.login || "Admin"}
          onAccountMenuToggle={() => setAccountMenuOpen((open) => !open)}
          onSettingsClick={openSettings}
        />

        <section className="mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
          {activeView === "dashboard" ? (
            <>
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
                      <span className="text-xs font-semibold uppercase">
                        {card.label}
                      </span>
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
                expandedChecks={expandedChecks}
                groups={filteredGroups}
                onActionMenuToggle={(key) =>
                  setActiveActionMenu((current) => (current === key ? null : key))
                }
                onCheckToggle={toggleCheck}
                onGroupToggle={toggleGroup}
                onNotice={setNotice}
                onRunCheckNow={(check) => void runCheckNow(check)}
              />
            </>
          ) : (
            <SettingsScreen onSettingsChange={setSettings} settings={settings} />
          )}
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
  const queuedRun = {
    artifacts: [],
    createdAt: new Date().toISOString(),
    duration: "-",
    durationMs: undefined,
    hasRetries: false,
    id: `queued:${check.id}`,
    occurredAt: "Queued",
    runner: "Local runner",
    runState: "queued" as const,
    status: "degraded" as const,
  };

  return {
    ...check,
    avg: "-",
    ava: check.ava === "-" ? "-" : check.ava,
    bars: [...check.bars.slice(-23), queuedBar],
    delta: "-",
    p95: "-",
    runState: "queued",
    runs: [queuedRun, ...check.runs].slice(0, 24),
    stats: {
      ...check.stats,
      averageDuration: "-",
      p95Duration: "-",
      totalRuns: String(Number.parseInt(check.stats.totalRuns, 10) + 1 || 1),
    },
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

function Sidebar({
  activeView,
  onDashboardClick,
  onSettingsClick,
}: {
  activeView: ActiveView;
  onDashboardClick: () => void;
  onSettingsClick: () => void;
}) {
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
            const active = item.id === activeView;

            return (
              <button
                className={cn(
                  "flex h-9 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-medium",
                  active
                    ? "bg-slate-700 text-slate-100"
                    : "text-slate-400 hover:bg-slate-800 hover:text-slate-200",
                )}
                key={item.label}
                onClick={item.id === "dashboard" ? onDashboardClick : onSettingsClick}
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
  accountLabel,
  onAccountMenuToggle,
  onSettingsClick,
}: {
  accountMenuOpen: boolean;
  accountLabel: string;
  onAccountMenuToggle: () => void;
  onSettingsClick: () => void;
}) {
  const initials = getInitials(accountLabel);

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
          {initials}
        </button>

        {accountMenuOpen ? (
          <div className="absolute right-0 top-12 z-30 w-64 rounded-md border border-slate-700 bg-[#12171f] p-3 text-sm shadow-xl shadow-black/30">
            <div className="truncate font-medium text-slate-100">{accountLabel}</div>
            <div className="mt-1 text-xs text-slate-500">Signed in locally</div>
            <button
              className="mt-3 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-slate-300 hover:bg-slate-800"
              onClick={onSettingsClick}
              type="button"
            >
              <Settings2 className="h-4 w-4 text-slate-500" />
              <span>Settings</span>
            </button>
            <a
              className="mt-1 block rounded-md px-2 py-2 text-slate-300 hover:bg-slate-800"
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

function SettingsScreen({
  onSettingsChange,
  settings,
}: {
  onSettingsChange: (settings: DashboardSettingsData) => void;
  settings: DashboardSettingsData;
}) {
  const [basicDraft, setBasicDraft] = useState(() => ({
    domain: settings.basic.domain,
    login: settings.basic.login,
    notificationEmail: settings.basic.notificationEmail,
    password: "",
    passwordConfirm: "",
  }));
  const [notice, setNotice] = useState("");
  const [secretRows, setSecretRows] = useState<RuntimeSecretDraft[]>(() =>
    settings.environment.secrets.map(createSecretDraft),
  );
  const [savingBasic, setSavingBasic] = useState(false);
  const [savingRuntime, setSavingRuntime] = useState(false);
  const [variableRows, setVariableRows] = useState<RuntimeVariableDraft[]>(() =>
    settings.environment.variables.map(createVariableDraft),
  );

  useEffect(() => {
    setBasicDraft({
      domain: settings.basic.domain,
      login: settings.basic.login,
      notificationEmail: settings.basic.notificationEmail,
      password: "",
      passwordConfirm: "",
    });
  }, [settings.basic]);

  useEffect(() => {
    setSecretRows(settings.environment.secrets.map(createSecretDraft));
    setVariableRows(settings.environment.variables.map(createVariableDraft));
  }, [settings.environment]);

  async function saveBasic(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingBasic(true);
    setNotice("");

    try {
      const payload = await postSettingsJson<{
        error?: string;
        settings?: DashboardSettingsData["basic"];
      }>("/api/settings/basic", basicDraft);

      if (!payload.settings) {
        throw new Error("Basic settings were not returned.");
      }

      onSettingsChange({
        ...settings,
        basic: payload.settings,
      });
      setBasicDraft((current) => ({
        ...current,
        password: "",
        passwordConfirm: "",
      }));
      setNotice("Basic settings saved.");
    } catch (error) {
      setNotice(getErrorMessage(error));
    } finally {
      setSavingBasic(false);
    }
  }

  async function saveRuntime(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingRuntime(true);
    setNotice("");

    try {
      const payload = await postSettingsJson<{
        environment?: RuntimeEnvironmentSettingsData;
        error?: string;
      }>("/api/settings/runtime", {
        environmentName: settings.environment.name,
        projectSlug: settings.projectSlug,
        secrets: secretRows.map((row) => ({
          currentName: row.currentName,
          name: row.name,
          value: row.value,
        })),
        variables: variableRows.map((row) => ({
          name: row.name,
          value: row.value,
        })),
      });

      if (!payload.environment) {
        throw new Error("Runtime settings were not returned.");
      }

      onSettingsChange({
        ...settings,
        environment: payload.environment,
      });
      setNotice("Environment settings saved.");
    } catch (error) {
      setNotice(getErrorMessage(error));
    } finally {
      setSavingRuntime(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-blue-300">Settings</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-100">Administration</h2>
        </div>
        <div className="rounded-md border border-slate-700 bg-[#111821] px-3 py-2 text-sm text-slate-300">
          Project: {settings.projectSlug}
        </div>
      </div>

      {notice ? (
        <div
          className="rounded-md border border-slate-700 bg-[#111821] px-3 py-2 text-sm text-slate-300"
          role="status"
        >
          {notice}
        </div>
      ) : null}

      <form
        className="rounded-md border border-slate-800 bg-[#11161d]"
        onSubmit={(event) => void saveBasic(event)}
      >
        <div className="flex items-center gap-3 border-b border-slate-800 px-5 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-600/20 text-blue-300">
            <ServerCog className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-base font-semibold text-slate-100">Basic settings</h3>
            <div className="text-xs text-slate-500">Domain, login, password, email</div>
          </div>
        </div>

        <div className="grid gap-4 p-5 lg:grid-cols-2">
          <label
            className="grid gap-2 text-sm font-medium text-slate-200"
            htmlFor="settings-domain"
          >
            Domain
            <input
              className="h-10 rounded-md border border-slate-700 bg-[#0f151d] px-3 text-sm text-slate-100 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              id="settings-domain"
              onChange={(event) =>
                setBasicDraft((current) => ({
                  ...current,
                  domain: event.target.value,
                }))
              }
              required
              type="text"
              value={basicDraft.domain}
            />
          </label>

          <label
            className="grid gap-2 text-sm font-medium text-slate-200"
            htmlFor="settings-login"
          >
            Login
            <input
              autoComplete="username"
              className="h-10 rounded-md border border-slate-700 bg-[#0f151d] px-3 text-sm text-slate-100 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              id="settings-login"
              minLength={3}
              onChange={(event) =>
                setBasicDraft((current) => ({
                  ...current,
                  login: event.target.value,
                }))
              }
              required
              type="text"
              value={basicDraft.login}
            />
          </label>

          <label
            className="grid gap-2 text-sm font-medium text-slate-200"
            htmlFor="settings-password"
          >
            New password
            <input
              autoComplete="new-password"
              className="h-10 rounded-md border border-slate-700 bg-[#0f151d] px-3 text-sm text-slate-100 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              id="settings-password"
              minLength={8}
              onChange={(event) =>
                setBasicDraft((current) => ({
                  ...current,
                  password: event.target.value,
                }))
              }
              type="password"
              value={basicDraft.password}
            />
          </label>

          <label
            className="grid gap-2 text-sm font-medium text-slate-200"
            htmlFor="settings-password-confirm"
          >
            Confirm password
            <input
              autoComplete="new-password"
              className="h-10 rounded-md border border-slate-700 bg-[#0f151d] px-3 text-sm text-slate-100 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              id="settings-password-confirm"
              minLength={8}
              onChange={(event) =>
                setBasicDraft((current) => ({
                  ...current,
                  passwordConfirm: event.target.value,
                }))
              }
              type="password"
              value={basicDraft.passwordConfirm}
            />
          </label>

          <label
            className="grid gap-2 text-sm font-medium text-slate-200 lg:col-span-2"
            htmlFor="settings-notification-email"
          >
            Notification email
            <input
              autoComplete="email"
              className="h-10 rounded-md border border-slate-700 bg-[#0f151d] px-3 text-sm text-slate-100 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              id="settings-notification-email"
              onChange={(event) =>
                setBasicDraft((current) => ({
                  ...current,
                  notificationEmail: event.target.value,
                }))
              }
              required
              type="email"
              value={basicDraft.notificationEmail}
            />
          </label>
        </div>

        <div className="flex justify-end border-t border-slate-800 px-5 py-4">
          <button
            className="inline-flex h-10 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={savingBasic}
            type="submit"
          >
            <Save className="h-4 w-4" />
            {savingBasic ? "Saving..." : "Save basic settings"}
          </button>
        </div>
      </form>

      <form
        className="rounded-md border border-slate-800 bg-[#11161d]"
        onSubmit={(event) => void saveRuntime(event)}
      >
        <div className="flex items-center gap-3 border-b border-slate-800 px-5 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-emerald-600/20 text-emerald-300">
            <KeyRound className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-base font-semibold text-slate-100">
              Environment & secrets
            </h3>
            <div className="text-xs text-slate-500">
              {settings.environment.name} environment
            </div>
          </div>
        </div>

        <div className="grid gap-6 p-5 xl:grid-cols-2">
          <section className="min-w-0">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-100">
                <UserRound className="h-4 w-4 shrink-0 text-slate-500" />
                <span className="truncate">Variables</span>
              </div>
              <button
                className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-700 px-3 text-sm font-medium text-slate-200 hover:bg-slate-800"
                onClick={() =>
                  setVariableRows((current) => [...current, createVariableDraft()])
                }
                type="button"
              >
                <Plus className="h-4 w-4" />
                Add
              </button>
            </div>

            <div className="grid gap-2">
              {variableRows.map((row, index) => (
                <div
                  className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_2.5rem]"
                  key={row.id}
                >
                  <input
                    aria-label={`Variable ${index + 1} name`}
                    className="h-10 rounded-md border border-slate-700 bg-[#0f151d] px-3 text-sm text-slate-100 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    onChange={(event) =>
                      setVariableRows((current) =>
                        current.map((item) =>
                          item.id === row.id
                            ? { ...item, name: event.target.value }
                            : item,
                        ),
                      )
                    }
                    placeholder="NAME"
                    value={row.name}
                  />
                  <input
                    aria-label={`Variable ${index + 1} value`}
                    className="h-10 rounded-md border border-slate-700 bg-[#0f151d] px-3 text-sm text-slate-100 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    onChange={(event) =>
                      setVariableRows((current) =>
                        current.map((item) =>
                          item.id === row.id
                            ? { ...item, value: event.target.value }
                            : item,
                        ),
                      )
                    }
                    placeholder="value"
                    value={row.value}
                  />
                  <button
                    aria-label={`Remove variable ${row.name || index + 1}`}
                    className="flex h-10 w-10 items-center justify-center rounded-md border border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                    onClick={() =>
                      setVariableRows((current) =>
                        current.filter((item) => item.id !== row.id),
                      )
                    }
                    type="button"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="min-w-0">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-100">
                <LockKeyhole className="h-4 w-4 shrink-0 text-slate-500" />
                <span className="truncate">Secrets</span>
              </div>
              <button
                className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-700 px-3 text-sm font-medium text-slate-200 hover:bg-slate-800"
                onClick={() =>
                  setSecretRows((current) => [...current, createSecretDraft()])
                }
                type="button"
              >
                <Plus className="h-4 w-4" />
                Add
              </button>
            </div>

            <div className="grid gap-2">
              {secretRows.map((row, index) => (
                <div
                  className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_2.5rem]"
                  key={row.id}
                >
                  <input
                    aria-label={`Secret ${index + 1} name`}
                    className="h-10 rounded-md border border-slate-700 bg-[#0f151d] px-3 text-sm text-slate-100 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    onChange={(event) =>
                      setSecretRows((current) =>
                        current.map((item) =>
                          item.id === row.id
                            ? { ...item, name: event.target.value }
                            : item,
                        ),
                      )
                    }
                    placeholder="SECRET_NAME"
                    value={row.name}
                  />
                  <input
                    aria-label={`Secret ${index + 1} value`}
                    className="h-10 rounded-md border border-slate-700 bg-[#0f151d] px-3 text-sm text-slate-100 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    onChange={(event) =>
                      setSecretRows((current) =>
                        current.map((item) =>
                          item.id === row.id
                            ? { ...item, value: event.target.value }
                            : item,
                        ),
                      )
                    }
                    placeholder={row.hasValue ? "Keep existing value" : "value"}
                    type="password"
                    value={row.value}
                  />
                  <button
                    aria-label={`Remove secret ${row.name || index + 1}`}
                    className="flex h-10 w-10 items-center justify-center rounded-md border border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                    onClick={() =>
                      setSecretRows((current) =>
                        current.filter((item) => item.id !== row.id),
                      )
                    }
                    type="button"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="flex justify-end border-t border-slate-800 px-5 py-4">
          <button
            className="inline-flex h-10 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={savingRuntime}
            type="submit"
          >
            <Save className="h-4 w-4" />
            {savingRuntime ? "Saving..." : "Save environment"}
          </button>
        </div>
      </form>
    </div>
  );
}

function getInitials(value: string) {
  const parts = value
    .replace(/@.*$/, "")
    .split(/[\s._-]+/)
    .filter(Boolean);
  const initials = parts
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return initials || "AD";
}

function createDraftId() {
  return Math.random().toString(36).slice(2);
}

function createVariableDraft(
  variable: RuntimeEnvironmentSettingsData["variables"][number] = {
    name: "",
    value: "",
  },
): RuntimeVariableDraft {
  return {
    id: createDraftId(),
    name: variable.name,
    value: variable.value,
  };
}

function createSecretDraft(
  secret: Partial<RuntimeEnvironmentSettingsData["secrets"][number]> = {},
): RuntimeSecretDraft {
  return {
    currentName: secret.currentName,
    hasValue: Boolean(secret.hasValue),
    id: createDraftId(),
    name: secret.name ?? "",
    updatedAt: secret.updatedAt,
    value: "",
  };
}

async function postSettingsJson<T>(url: string, payload: unknown): Promise<T> {
  const response = await fetch(url, {
    body: JSON.stringify(payload),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };

  if (!response.ok) {
    throw new Error(body.error ?? "Unable to save settings.");
  }

  return body;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
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
  expandedChecks,
  groups: visibleGroups,
  onActionMenuToggle,
  onCheckToggle,
  onGroupToggle,
  onNotice,
  onRunCheckNow,
}: {
  activeActionMenu: string | null;
  expandedChecks: Record<string, boolean>;
  groups: GroupRow[];
  onActionMenuToggle: (key: string) => void;
  onCheckToggle: (checkId: string) => void;
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
                expandedChecks={expandedChecks}
                group={group}
                key={group.name}
                onActionMenuToggle={onActionMenuToggle}
                onCheckToggle={onCheckToggle}
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
  expandedChecks,
  group,
  onActionMenuToggle,
  onCheckToggle,
  onGroupToggle,
  onNotice,
  onRunCheckNow,
}: {
  activeActionMenu: string | null;
  expandedChecks: Record<string, boolean>;
  group: GroupRow;
  onActionMenuToggle: (key: string) => void;
  onCheckToggle: (checkId: string) => void;
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
              expanded={Boolean(expandedChecks[check.id])}
              key={check.id}
              onActionMenuToggle={onActionMenuToggle}
              onCheckToggle={onCheckToggle}
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
  expanded,
  onActionMenuToggle,
  onCheckToggle,
  onNotice,
  onRunCheckNow,
}: {
  activeActionMenu: string | null;
  check: CheckRow;
  expanded: boolean;
  onActionMenuToggle: (key: string) => void;
  onCheckToggle: (checkId: string) => void;
  onNotice: (notice: string) => void;
  onRunCheckNow: (check: CheckRow) => void;
}) {
  const actionKey = `check:${check.id}`;
  const toggleLabel = `Open ${check.name}`;

  return (
    <>
      <tr
        aria-expanded={expanded}
        aria-label={toggleLabel}
        className={cn(
          "cursor-pointer border-b border-slate-800 bg-[#141a21] text-slate-300 outline-none transition",
          "hover:bg-[#18202a] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500/50",
          expanded && "bg-[#18202a]",
        )}
        onClick={() => onCheckToggle(check.id)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onCheckToggle(check.id);
          }
        }}
        role="link"
        tabIndex={0}
      >
        <td className="px-5 py-3">
          <div className="flex items-center gap-4 pl-9">
            {expanded ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
            )}
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
        <td
          className="relative px-4 py-3"
          data-action-menu-root
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
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
              onOpen={() => {
                if (!expanded) {
                  onCheckToggle(check.id);
                }
              }}
              onRunNow={() => onRunCheckNow(check)}
            />
          ) : null}
        </td>
      </tr>
      {expanded ? <CheckDetailsRow check={check} /> : null}
    </>
  );
}

function CheckDetailsRow({ check }: { check: CheckRow }) {
  return (
    <tr className="border-b border-slate-800 bg-[#0f151d]">
      <td className="px-5 py-0" colSpan={8}>
        <div className="grid gap-5 border-l border-blue-500/30 px-5 py-5">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
            <section className="min-w-0 rounded-md border border-slate-800 bg-[#111821]">
              <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3 text-sm font-semibold text-slate-100">
                <SlidersHorizontal className="h-4 w-4 text-slate-500" />
                Settings
              </div>
              <dl className="grid gap-3 p-4 text-sm md:grid-cols-2">
                <DetailValue label="Key" value={check.settings.key} />
                <DetailValue label="Schedule" value={check.settings.frequency} />
                <DetailValue
                  label="Enabled"
                  value={check.settings.enabled ? "yes" : "no"}
                />
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

            <section className="rounded-md border border-slate-800 bg-[#111821]">
              <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3 text-sm font-semibold text-slate-100">
                <Gauge className="h-4 w-4 text-slate-500" />
                Run statistics
              </div>
              <dl className="grid grid-cols-2 gap-3 p-4 text-sm">
                <DetailValue label="Runs" value={check.stats.totalRuns} />
                <DetailValue label="Passed" value={check.stats.passedRuns} />
                <DetailValue label="Failed" value={check.stats.failedRuns} />
                <DetailValue label="Availability" value={check.ava} />
                <DetailValue label="Average" value={check.stats.averageDuration} />
                <DetailValue label="P95" value={check.stats.p95Duration} />
              </dl>
            </section>
          </div>

          <section className="overflow-hidden rounded-md border border-slate-800 bg-[#111821]">
            <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3 text-sm font-semibold text-slate-100">
              <History className="h-4 w-4 text-slate-500" />
              Run history
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-[#121820] text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Run</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Duration</th>
                    <th className="px-4 py-3">Artifacts</th>
                    <th className="px-4 py-3">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {check.runs.length > 0 ? (
                    check.runs.map((run) => (
                      <tr className="border-t border-slate-800" key={run.id}>
                        <td className="px-4 py-3 text-slate-300">{run.occurredAt}</td>
                        <td className="px-4 py-3">
                          <RunStateBadge runState={run.runState} status={run.status} />
                        </td>
                        <td className="px-4 py-3 text-slate-300">{run.duration}</td>
                        <td className="px-4 py-3">
                          <ArtifactList artifacts={run.artifacts} />
                        </td>
                        <td className="max-w-[28rem] px-4 py-3 text-slate-500">
                          <span className="line-clamp-2">
                            {run.errorMessage ?? "-"}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-4 py-5 text-slate-500" colSpan={5}>
                        No recorded runs.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </td>
    </tr>
  );
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
  status: Status;
}) {
  const content = runStateTooltipContent[runState];

  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-2 rounded-md border px-2 text-xs font-semibold",
        status === "passing" && "border-emerald-700/60 text-emerald-300",
        status === "degraded" && "border-amber-700/60 text-amber-300",
        status === "failing" && "border-red-700/60 text-red-300",
      )}
    >
      <ResultTooltipStatus runState={runState} status={status} />
      {content.title}
    </span>
  );
}

function ArtifactList({ artifacts }: { artifacts: DashboardRunArtifact[] }) {
  if (artifacts.length === 0) {
    return <span className="text-slate-500">No artifacts</span>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {artifacts.map((artifact) => {
        const Icon = getArtifactIcon(artifact.type);
        const label = getArtifactTypeLabel(artifact.type);

        return (
          <span
            className="inline-flex max-w-full items-center gap-2 rounded-md border border-slate-700 bg-[#0f151d] px-2 py-1 text-xs text-slate-300"
            key={artifact.id}
          >
            <Icon className="h-3.5 w-3.5 shrink-0 text-slate-500" />
            <span className="max-w-48 truncate" title={artifact.name}>
              {label}
              {artifact.size !== "-" ? ` · ${artifact.size}` : ""}
            </span>
            <a
              aria-label={`View ${artifact.name}`}
              className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-800 hover:text-slate-100"
              href={artifact.viewUrl}
              rel="noreferrer"
              target="_blank"
              title="View"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <a
              aria-label={`Download ${artifact.name}`}
              className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-800 hover:text-slate-100"
              download
              href={artifact.downloadUrl}
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
        className="pointer-events-none absolute bottom-full left-0 z-30 mb-3 hidden w-64 rounded-md border border-slate-500/20 bg-slate-600 px-3 py-2 text-left text-sm text-slate-100 shadow-2xl shadow-black/40 group-hover/status:block group-focus/status:block"
        role="tooltip"
      >
        <span className="block font-semibold text-slate-50">{content.title}</span>
        <span className="mt-1 block text-slate-200">{content.description}</span>
        <span className="absolute left-4 top-full h-3 w-3 -translate-y-1/2 rotate-45 bg-slate-600" />
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
