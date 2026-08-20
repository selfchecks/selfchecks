"use client";

import {
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  ArrowDownUp,
  Bot,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleX,
  Copy,
  Flame,
  Folder,
  Gauge,
  KeyRound,
  ListTodo,
  LockKeyhole,
  MoreVertical,
  Plus,
  Route,
  Save,
  Search,
  ServerCog,
  Settings2,
  Tag,
  Trash2,
  UserRound,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { AppSidebar } from "@/components/app-sidebar";
import { CopyAnalysisButton } from "@/components/copy-analysis-button";
import { ServiceMark } from "@/components/service-mark";
import {
  normalizePerformanceSettingValue,
  performanceSettingsLimits,
} from "@selfchecks/core/performance-settings";
import { cn } from "@/lib/utils";
import type {
  DashboardAiAnalysis,
  DashboardCheckRow,
  DashboardFirewatch,
  DashboardFirewatchRow,
  DashboardGroupRow,
  DashboardQueueRow,
  DashboardRunState,
  DashboardStatus,
  DashboardSummary,
} from "@/lib/dashboard-types";
import { getRunResultToneClassName } from "@/lib/run-result-tone";
import type {
  DashboardSettingsData,
  PerformanceSettingsData,
  RuntimeEnvironmentSettingsData,
} from "@/lib/settings-data";

type Status = DashboardStatus;
type ActiveView = "dashboard" | "queue" | "settings";
type StatusFilter = Status | "all";
type TagFilter = "all" | "api" | "regress";
type TypeFilter = "all" | "api" | "browser";
type DateRange = "24h" | "7d" | "all";
type TraceFilter = "all" | "with-traces";
type ProjectFilter = string;
type DashboardSnapshot = {
  firewatch: DashboardFirewatch;
  groups: GroupRow[];
  queue: QueueRow[];
  revision: string;
  summary: DashboardSummary;
};
type DashboardQueueSnapshot = Pick<DashboardSnapshot, "queue" | "summary">;
type DashboardActivitySnapshot = Pick<DashboardSummary, "queued" | "running"> & {
  revision: string;
};

type CheckRow = DashboardCheckRow;
type GroupRow = DashboardGroupRow;
type QueueRow = DashboardQueueRow;
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
  valueMasked?: string;
};
type RangeFillStyle = CSSProperties & {
  "--settings-range-fill": string;
};
type AiAnalysisDrawerState = {
  analysis?: DashboardAiAnalysis;
  checkName: string;
  occurredAt: string;
};
type SettingsNotice = {
  message: string;
  tone: "error" | "success";
};
type PerformanceSettingsDraft = Record<keyof PerformanceSettingsData, string>;

const AI_CUSTOM_ENDPOINT_VALUE = "__custom__";
const DASHBOARD_ACTIVITY_REFRESH_INTERVAL_MS = 2000;

const preferredTimeZoneOptions = [
  "Europe/Moscow",
  "UTC",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Dubai",
  "Asia/Almaty",
  "Asia/Tokyo",
  "America/New_York",
  "America/Los_Angeles",
];

const performanceSettingFields = [
  {
    description: "Maximum simultaneous test runs across all workers.",
    key: "workerConcurrency",
    label: "Concurrent test runs",
    suffix: "runs",
    ...performanceSettingsLimits.workerConcurrency,
  },
  {
    description: "Maximum time a run may wait in the worker queue.",
    key: "queuedRunTimeoutMinutes",
    label: "Queued run timeout",
    suffix: "min",
    ...performanceSettingsLimits.queuedRunTimeoutMinutes,
  },
  {
    description: "Maximum time a started run may remain unfinished.",
    key: "runningRunTimeoutMinutes",
    label: "Running run timeout",
    suffix: "min",
    ...performanceSettingsLimits.runningRunTimeoutMinutes,
  },
  {
    description: "Maximum wall-clock time for one CLI test session.",
    key: "testSessionTimeoutMinutes",
    label: "Maximum test session duration",
    suffix: "min",
    ...performanceSettingsLimits.testSessionTimeoutMinutes,
  },
  {
    description: "Recorded traces, screenshots, videos, reports and logs.",
    key: "passedArtifactRetentionDays",
    label: "Successful test artifact retention",
    suffix: "days",
    ...performanceSettingsLimits.passedArtifactRetentionDays,
  },
  {
    description: "Recorded traces, screenshots, videos, reports and logs.",
    key: "failedArtifactRetentionDays",
    label: "Failed test artifact retention",
    suffix: "days",
    ...performanceSettingsLimits.failedArtifactRetentionDays,
  },
  {
    description: "Uploaded branch workspaces created for CLI test sessions.",
    key: "testSessionWorkspaceRetentionDays",
    label: "Test session branch folder retention",
    suffix: "days",
    ...performanceSettingsLimits.testSessionWorkspaceRetentionDays,
  },
  {
    description: "Stored run history shown across dashboard, journal and details.",
    key: "historyRetentionDays",
    label: "Test history retention",
    suffix: "days",
    ...performanceSettingsLimits.historyRetentionDays,
  },
] satisfies Array<{
  default: number;
  description: string;
  key: keyof PerformanceSettingsData;
  label: string;
  max: number;
  min: number;
  suffix: string;
}>;

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
  initialAccountLabel,
  initialActiveView = "dashboard",
  initialFirewatch = createEmptyFirewatchSnapshot(),
  initialGroups,
  initialQueue,
  initialRevision,
  initialSettings,
  initialSummary,
}: {
  initialAccountLabel?: string;
  initialActiveView?: ActiveView;
  initialFirewatch?: DashboardFirewatch;
  initialGroups: GroupRow[];
  initialQueue?: QueueRow[];
  initialRevision?: string;
  initialSettings?: DashboardSettingsData;
  initialSummary: DashboardSummary;
}) {
  const [activeView, setActiveView] = useState<ActiveView>(initialActiveView);
  const [dashboard, setDashboard] = useState<DashboardSnapshot>(() => ({
    firewatch: initialFirewatch,
    groups: initialGroups,
    queue: initialQueue ?? [],
    revision: initialRevision ?? createDashboardActivityRevision(initialQueue ?? []),
    summary: initialSummary,
  }));
  const [settings, setSettings] = useState<DashboardSettingsData | undefined>(
    initialSettings,
  );
  const { firewatch, groups, queue, summary } = dashboard;
  const dashboardActivityRevisionRef = useRef(dashboard.revision);
  const optimisticQueuedCheckIdsRef = useRef<Set<string>>(new Set());
  const router = useRouter();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [activeActionMenu, setActiveActionMenu] = useState<string | null>(null);
  const [aiAnalysisDrawer, setAiAnalysisDrawer] =
    useState<AiAnalysisDrawerState | null>(null);
  const closeAiAnalysisDrawer = useCallback(() => setAiAnalysisDrawer(null), []);
  const [dateRange, setDateRange] = useState<DateRange>("24h");
  const [firewatchOpen, setFirewatchOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      groups.map((group) => [getGroupKey(group), Boolean(group.expanded)]),
    ),
  );
  const [notice, setNotice] = useState("");
  const [projectFilter, setProjectFilter] = useState<ProjectFilter>("all");
  const [queueingAllChecks, setQueueingAllChecks] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [tagFilter, setTagFilter] = useState<TagFilter>("all");
  const [traceOnly, setTraceOnly] = useState(false);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const projectFilterOptions = useMemo<Array<FilterOption<ProjectFilter>>>(() => {
    const projects = new Map<string, string>();

    for (const group of groups) {
      const slug = group.projectSlug ?? "default";
      projects.set(slug, group.projectName ?? slug);
    }

    return [
      { label: "All projects", value: "all" },
      ...[...projects.entries()]
        .sort((left, right) => left[1].localeCompare(right[1]))
        .map(([value, label]) => ({ label, value })),
    ];
  }, [groups]);
  const projectGroups = useMemo(
    () =>
      projectFilter === "all"
        ? groups
        : groups.filter((group) => (group.projectSlug ?? "default") === projectFilter),
    [groups, projectFilter],
  );
  const allChecks = useMemo(
    () => projectGroups.flatMap((group) => group.children ?? []),
    [projectGroups],
  );
  const allRunnableChecks = useMemo(
    () => allChecks.filter((check) => !isCheckActive(check)),
    [allChecks],
  );
  const shouldRefreshDashboard = activeView !== "settings";
  const failedChecks = useMemo(
    () => allChecks.filter((check) => check.status === "failing"),
    [allChecks],
  );
  const visibleSummary = useMemo(
    () => (projectFilter === "all" ? summary : summarizeDashboardGroups(projectGroups)),
    [projectFilter, projectGroups, summary],
  );
  const summaryCards = useMemo(
    () =>
      [
        {
          label: "PASSING",
          status: "passing",
          tone: "border-emerald-950/80 bg-emerald-950/75 text-emerald-400 shadow-emerald-950/20",
          value: String(visibleSummary.passing),
        },
        {
          label: "DEGRADED",
          status: "degraded",
          tone: "border-orange-950/80 bg-orange-950/75 text-orange-400 shadow-orange-950/20",
          value: String(visibleSummary.degraded),
        },
        {
          label: "FAILING",
          status: "failing",
          tone: "border-red-950/80 bg-red-950/75 text-red-400 shadow-red-950/20",
          value: String(visibleSummary.failing),
        },
        {
          label: "QUEUED",
          status: null,
          tone: "border-amber-950/80 bg-amber-950/75 text-amber-300 shadow-amber-950/20",
          value: String(visibleSummary.queued),
        },
      ] satisfies Array<{
        label: string;
        status: Exclude<StatusFilter, "all"> | null;
        tone: string;
        value: string;
      }>,
    [visibleSummary],
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
    if (!shouldRefreshDashboard) {
      return;
    }

    let cancelled = false;

    async function refreshActiveRuns() {
      try {
        if (activeView === "queue") {
          const nextQueue = await fetchDashboardQueueSnapshot();

          if (!cancelled) {
            dashboardActivityRevisionRef.current = createDashboardActivityRevision(
              nextQueue.queue,
            );
            setDashboard((current) => ({
              ...current,
              queue: nextQueue.queue,
              summary: {
                ...current.summary,
                queued: nextQueue.summary.queued,
                running: nextQueue.summary.running,
              },
            }));
          }

          return;
        }

        const activity = await fetchDashboardActivitySnapshot();

        if (cancelled || activity.revision === dashboardActivityRevisionRef.current) {
          return;
        }

        const nextDashboard = await fetchDashboardSnapshot();

        if (!cancelled) {
          dashboardActivityRevisionRef.current = nextDashboard.revision;
          optimisticQueuedCheckIdsRef.current = retainOptimisticQueuedCheckIds(
            nextDashboard.groups,
            optimisticQueuedCheckIdsRef.current,
          );
          setDashboard(
            applyOptimisticQueuedSnapshot(
              nextDashboard,
              optimisticQueuedCheckIdsRef.current,
            ),
          );
        }
      } catch {
        // Keep the last successful dashboard snapshot while polling recovers.
      }
    }

    let timeoutId: number | undefined;

    async function pollActiveRuns() {
      await refreshActiveRuns();

      if (!cancelled) {
        timeoutId = window.setTimeout(() => {
          void pollActiveRuns();
        }, DASHBOARD_ACTIVITY_REFRESH_INTERVAL_MS);
      }
    }

    void pollActiveRuns();

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [activeView, shouldRefreshDashboard]);

  const filteredGroups = useMemo<GroupRow[]>(() => {
    const nextGroups: GroupRow[] = [];

    for (const group of projectGroups) {
      const queryMatchesGroup =
        Boolean(query.trim()) && doesGroupMatchSearch(group, query);
      const filteredChildren = group.children?.filter((check) =>
        doesCheckMatchFilters(check, {
          query: queryMatchesGroup ? "" : query,
          statusFilter,
          tagFilter,
          traceOnly,
          typeFilter,
        }),
      );
      const groupMatches =
        doesGroupMatchSearch(group, query) &&
        doesGroupStatusMatch(group, statusFilter) &&
        !traceOnly &&
        tagFilter === "all" &&
        typeFilter === "all";

      if (group.children) {
        if (filteredChildren?.length) {
          nextGroups.push({
            ...group,
            children: filteredChildren,
            checks: `${filteredChildren.length} checks`,
            expanded: expandedGroups[getGroupKey(group)] ?? false,
          });
          continue;
        }

        continue;
      }

      if (groupMatches) {
        nextGroups.push({
          ...group,
          expanded: expandedGroups[getGroupKey(group)] ?? false,
        });
      }
    }

    return nextGroups;
  }, [
    expandedGroups,
    projectGroups,
    query,
    statusFilter,
    tagFilter,
    traceOnly,
    typeFilter,
  ]);
  const visibleFirewatch = useMemo(() => {
    const visibleCheckIds = new Set(
      filteredGroups.flatMap((group) =>
        (group.children ?? []).map((check) => check.id),
      ),
    );

    return {
      ...firewatch,
      rows: firewatch.rows.filter((row) => visibleCheckIds.has(row.checkId)),
    };
  }, [filteredGroups, firewatch]);

  function resetDashboard() {
    setActiveView("dashboard");
    router.push("/");
    setDateRange("24h");
    setExpandedGroups(
      Object.fromEntries(
        groups.map((group) => [getGroupKey(group), Boolean(group.expanded)]),
      ),
    );
    setNotice("Dashboard filters reset.");
    setProjectFilter("all");
    setQuery("");
    setStatusFilter("all");
    setTagFilter("all");
    setTraceOnly(false);
    setTypeFilter("all");
  }

  function openQueue() {
    setActiveView("queue");
    setActiveActionMenu(null);
    router.push("/queue");
  }

  function toggleGroup(groupName: string) {
    setExpandedGroups((current) => ({
      ...current,
      [groupName]: !current[groupName],
    }));
  }

  async function queueCheckRun(check: CheckRow) {
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
  }

  function markChecksQueued(checkIds: string[]) {
    const checkIdSet = new Set(checkIds);

    optimisticQueuedCheckIdsRef.current = new Set([
      ...optimisticQueuedCheckIdsRef.current,
      ...checkIdSet,
    ]);
    setDashboard((current) => {
      const nextGroups = markDashboardChecksQueued(current.groups, checkIdSet);
      const nextQueue = addOptimisticQueuedRows(
        current.queue,
        current.groups,
        checkIdSet,
      );

      return {
        firewatch: removeFirewatchRows(current.firewatch, checkIdSet),
        groups: nextGroups,
        queue: nextQueue,
        revision: current.revision,
        summary: summarizeDashboardSnapshot(nextGroups, nextQueue),
      };
    });
  }

  async function runCheckNow(check: CheckRow) {
    try {
      await queueCheckRun(check);
      markChecksQueued([check.id]);
      setNotice("");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      setNotice(`Failed to queue ${check.name}: ${message}`);
    }
  }

  function findCheckById(checkId: string) {
    return groups
      .flatMap((group) => group.children ?? [])
      .find((check) => check.id === checkId);
  }

  async function runFirewatchCheck(row: DashboardFirewatchRow) {
    const check = findCheckById(row.checkId);

    if (!check) {
      setNotice(`Unable to find ${row.name}.`);
      return;
    }

    await runCheckNow(check);
  }

  function openFirewatchAiAnalysis(row: DashboardFirewatchRow) {
    const check = findCheckById(row.checkId);
    const latestRun = check?.runs[0];

    if (!check || !latestRun) {
      setNotice(`Unable to find the latest run for ${row.name}.`);
      return;
    }

    setAiAnalysisDrawer({
      analysis: latestRun.aiAnalysis,
      checkName: check.name,
      occurredAt: latestRun.occurredAt,
    });
  }

  async function queueChecks(checksToQueue: CheckRow[]) {
    const checksToRun = checksToQueue.filter((check) => !isCheckActive(check));

    if (checksToRun.length === 0) {
      return;
    }

    markChecksQueued(checksToRun.map((check) => check.id));
    setNotice("");

    const failedQueues = (
      await Promise.all(
        checksToRun.map(async (check) => {
          try {
            await queueCheckRun(check);
            return undefined;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);

            return `${check.name}: ${message}`;
          }
        }),
      )
    ).filter((message): message is string => Boolean(message));

    if (failedQueues.length > 0) {
      setNotice(`Failed to queue ${failedQueues.join("; ")}`);
    }
  }

  async function runAllFailedChecks() {
    await queueChecks(failedChecks);
  }

  async function runAllChecks() {
    const checksToRun = allRunnableChecks;

    if (checksToRun.length === 0 || queueingAllChecks) {
      return;
    }

    setQueueingAllChecks(true);

    try {
      await queueChecks(checksToRun);
    } finally {
      setQueueingAllChecks(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#0d1117] text-slate-200">
      <h1 className="sr-only">Synthetic checks dashboard</h1>
      <AppSidebar
        accountLabel={settings?.basic.login || initialAccountLabel || "Admin"}
        activeItem={
          activeView === "settings"
            ? "settings"
            : activeView === "queue"
              ? "queue"
              : "home"
        }
        initialQueuedCount={summary.queued}
        initialRunningCount={summary.running}
        onHomeClick={resetDashboard}
        onQueueClick={openQueue}
        projectSlug={settings?.projectSlug ?? "default"}
      />

      <div className="min-h-screen xl:pl-72">
        <Topbar
          actions={
            activeView === "dashboard" ? (
              <button
                className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={queueingAllChecks || allRunnableChecks.length === 0}
                onClick={() => void runAllChecks()}
                type="button"
              >
                <Zap className="h-4 w-4" />
                Run all checks
              </button>
            ) : null
          }
        />

        <section className="mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
          {activeView === "dashboard" ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {summaryCards.map((card) => {
                  const content = (
                    <>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold uppercase">
                          {card.label}
                        </span>
                        {card.status ? (
                          <Settings2 className="h-4 w-4 opacity-60" />
                        ) : (
                          <ListTodo className="h-4 w-4 opacity-60" />
                        )}
                      </div>
                      <div className="mt-1 text-3xl font-semibold leading-none">
                        {card.value}
                      </div>
                    </>
                  );

                  return card.status ? (
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
                      {content}
                    </button>
                  ) : (
                    <div
                      aria-label={`${card.label} ${card.value}`}
                      className={cn(
                        "rounded-md border px-5 py-4 text-left shadow-lg shadow-black/10",
                        card.tone,
                      )}
                      key={card.label}
                      role="status"
                    >
                      {content}
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-col gap-5">
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
                    active={projectFilter !== "all"}
                    className="w-44"
                    icon={Folder}
                    onChange={setProjectFilter}
                    options={projectFilterOptions}
                    value={projectFilter}
                  />
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

              <FirewatchPanel
                failedChecksCount={failedChecks.length}
                firewatch={visibleFirewatch}
                onOpenChange={setFirewatchOpen}
                onOpenAiAnalysis={openFirewatchAiAnalysis}
                onRunFailedChecks={() => void runAllFailedChecks()}
                onRunCheck={(row) => void runFirewatchCheck(row)}
                open={firewatchOpen}
              />

              <ChecksTable
                activeActionMenu={activeActionMenu}
                groups={filteredGroups}
                onActionMenuToggle={(key) =>
                  setActiveActionMenu((current) => (current === key ? null : key))
                }
                onGroupToggle={toggleGroup}
                onNotice={setNotice}
                onOpenAiAnalysis={setAiAnalysisDrawer}
                onRunCheckNow={(check) => void runCheckNow(check)}
              />
            </>
          ) : activeView === "queue" ? (
            <QueueScreen queue={queue} />
          ) : settings ? (
            <SettingsScreen onSettingsChange={setSettings} settings={settings} />
          ) : null}
        </section>
      </div>
      {aiAnalysisDrawer ? (
        <AiAnalysisDrawer drawer={aiAnalysisDrawer} onClose={closeAiAnalysisDrawer} />
      ) : null}
    </main>
  );
}

function doesStatusMatch(status: Status, statusFilter: StatusFilter) {
  return statusFilter === "all" || status === statusFilter;
}

function doesGroupStatusMatch(group: GroupRow, statusFilter: StatusFilter) {
  if (statusFilter === "degraded" && group.children) {
    return group.children.some((check) => doesCheckStatusMatch(check, statusFilter));
  }

  return doesStatusMatch(group.status, statusFilter);
}

function doesGroupMatchSearch(group: GroupRow, query: string) {
  if (!query.trim()) {
    return true;
  }

  const normalizedQuery = query.trim().toLowerCase();

  return (
    group.name.toLowerCase().includes(normalizedQuery) ||
    (group.projectName ?? "default").toLowerCase().includes(normalizedQuery) ||
    (group.projectSlug ?? "default").toLowerCase().includes(normalizedQuery)
  );
}

function getGroupKey(group: GroupRow): string {
  return `${group.projectSlug ?? "default"}:${group.name}`;
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
    doesCheckStatusMatch(check, filters.statusFilter) &&
    (filters.tagFilter === "all" || check.tags.includes(filters.tagFilter)) &&
    (!filters.traceOnly || check.hasTrace) &&
    (filters.typeFilter === "all" || check.type === filters.typeFilter)
  );
}

function doesCheckStatusMatch(check: CheckRow, statusFilter: StatusFilter) {
  if (statusFilter === "all") {
    return true;
  }

  if (statusFilter === "degraded") {
    return (
      check.status === "degraded" &&
      check.runState !== "queued" &&
      check.runState !== "running"
    );
  }

  return check.status === statusFilter;
}

function isCheckActive(check: CheckRow) {
  return check.runState === "queued" || check.runState === "running";
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
    firewatch: payload.firewatch ?? createEmptyFirewatchSnapshot(),
    groups: payload.groups,
    queue: payload.queue ?? [],
    revision: payload.revision ?? createDashboardActivityRevision(payload.queue ?? []),
    summary: payload.summary,
  };
}

async function fetchDashboardActivitySnapshot(): Promise<DashboardActivitySnapshot> {
  const response = await fetch("/api/dashboard/status?project=default", {
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as Partial<
    DashboardActivitySnapshot & { error: string }
  >;

  if (
    !response.ok ||
    typeof payload.queued !== "number" ||
    typeof payload.revision !== "string" ||
    typeof payload.running !== "number"
  ) {
    throw new Error(payload.error ?? "Unable to load dashboard activity.");
  }

  return {
    queued: payload.queued,
    revision: payload.revision,
    running: payload.running,
  };
}

async function fetchDashboardQueueSnapshot(): Promise<DashboardQueueSnapshot> {
  const response = await fetch("/api/dashboard?view=queue", {
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as Partial<
    DashboardQueueSnapshot & { error: string }
  >;

  if (!response.ok || !payload.queue || !payload.summary) {
    throw new Error(payload.error ?? "Unable to load dashboard queue data.");
  }

  return {
    queue: payload.queue,
    summary: payload.summary,
  };
}

function createDashboardActivityRevision(queue: QueueRow[]): string {
  return queue
    .map((run) => `${run.id}:${run.runState.toUpperCase()}`)
    .sort()
    .join("|");
}

function createEmptyFirewatchSnapshot(): DashboardFirewatch {
  return {
    lookbackDays: 7,
    rows: [],
  };
}

function removeFirewatchRows(
  firewatch: DashboardFirewatch,
  checkIds: Set<string>,
): DashboardFirewatch {
  return {
    ...firewatch,
    rows: firewatch.rows.filter((row) => !checkIds.has(row.checkId)),
  };
}

function applyOptimisticQueuedSnapshot(
  dashboard: DashboardSnapshot,
  checkIds: Set<string>,
): DashboardSnapshot {
  if (checkIds.size === 0) {
    return dashboard;
  }

  const groups = markDashboardChecksQueued(dashboard.groups, checkIds);
  const queue = addOptimisticQueuedRows(dashboard.queue, dashboard.groups, checkIds);

  return {
    firewatch: removeFirewatchRows(dashboard.firewatch, checkIds),
    groups,
    queue,
    revision: dashboard.revision,
    summary: summarizeDashboardSnapshot(groups, queue),
  };
}

function retainOptimisticQueuedCheckIds(
  groups: GroupRow[],
  checkIds: Set<string>,
): Set<string> {
  if (checkIds.size === 0) {
    return checkIds;
  }

  const retainedIds = new Set<string>();
  const checksById = new Map(
    groups.flatMap((group) => group.children ?? []).map((check) => [check.id, check]),
  );

  for (const checkId of checkIds) {
    const check = checksById.get(checkId);

    if (check?.status === "failing") {
      retainedIds.add(checkId);
    }
  }

  return retainedIds;
}

function markDashboardChecksQueued(
  groups: GroupRow[],
  checkIds: Set<string>,
): GroupRow[] {
  return groups.map((group) => {
    if (!group.children) {
      return group;
    }

    const children = group.children.map((check) =>
      checkIds.has(check.id) ? markQueuedCheck(check) : check,
    );
    const groupHasQueuedCheck = children.some((check) => checkIds.has(check.id));

    return {
      ...group,
      children,
      status: summarizeDashboardStatus(children.map((check) => check.status)),
      updated: groupHasQueuedCheck ? "queued" : group.updated,
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
    tone: "queued" as const,
    value: 18,
  };
  const queuedRun = {
    attempt: 1,
    artifacts: [],
    createdAt: new Date().toISOString(),
    duration: "-",
    durationMs: undefined,
    hasRetries: false,
    id: `queued:${check.id}`,
    maxAttempts: 1,
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

function addOptimisticQueuedRows(
  queue: QueueRow[],
  groups: GroupRow[],
  checkIds: Set<string>,
): QueueRow[] {
  const existingCheckIds = new Set(queue.map((row) => row.checkId));
  const createdAt = new Date().toISOString();
  const rows: QueueRow[] = [];

  for (const group of groups) {
    for (const check of group.children ?? []) {
      if (!checkIds.has(check.id) || existingCheckIds.has(check.id)) {
        continue;
      }

      rows.push({
        branch: "production",
        checkHref: `/checks/${encodeURIComponent(check.id)}`,
        checkId: check.id,
        checkName: check.name,
        createdAt,
        createdAtLabel: "Queued",
        groupName: group.name,
        projectSlug: group.projectSlug ?? "default",
        id: `queued:${check.id}`,
        runState: "queued",
        source: "manual",
        sourceLabel: "Manual",
        type: check.type,
      });
    }
  }

  return [...queue, ...rows].sort(compareQueueRows);
}

function compareQueueRows(left: QueueRow, right: QueueRow): number {
  const stateRank = queueStateRank(left.runState) - queueStateRank(right.runState);

  if (stateRank !== 0) {
    return stateRank;
  }

  const createdAtRank =
    new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();

  if (createdAtRank !== 0) {
    return createdAtRank;
  }

  return left.checkName.localeCompare(right.checkName);
}

function queueStateRank(runState: QueueRow["runState"]): number {
  return runState === "running" ? 0 : 1;
}

function summarizeDashboardSnapshot(
  groups: GroupRow[],
  queue: QueueRow[],
): DashboardSummary {
  const summary = summarizeDashboardGroups(groups);

  return {
    ...summary,
    queued: queue.filter((row) => row.runState === "queued").length,
    running: queue.filter((row) => row.runState === "running").length,
  };
}

function summarizeDashboardGroups(groups: GroupRow[]): DashboardSummary {
  return groups
    .flatMap((group) => group.children ?? [])
    .reduce<DashboardSummary>(
      (summary, check) => {
        const isRunning = check.runState === "running";
        const isQueued = check.runState === "queued";

        return {
          ...summary,
          [check.status]: summary[check.status] + (isRunning || isQueued ? 0 : 1),
          queued: summary.queued + (isQueued ? 1 : 0),
          running: summary.running + (isRunning ? 1 : 0),
        };
      },
      {
        degraded: 0,
        failing: 0,
        passing: 0,
        queued: 0,
        running: 0,
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

function groupDashboardGroupsByProject(groups: GroupRow[]) {
  const sections = new Map<
    string,
    { groups: GroupRow[]; projectName: string; projectSlug: string }
  >();

  for (const group of groups) {
    const projectSlug = group.projectSlug ?? "default";
    const section = sections.get(projectSlug) ?? {
      groups: [],
      projectName: group.projectName ?? projectSlug,
      projectSlug,
    };

    section.groups.push(group);
    sections.set(projectSlug, section);
  }

  return [...sections.values()].sort((left, right) =>
    left.projectName.localeCompare(right.projectName),
  );
}

function groupFirewatchRowsByProject(rows: DashboardFirewatchRow[]) {
  const sections = new Map<
    string,
    { projectName: string; projectSlug: string; rows: DashboardFirewatchRow[] }
  >();

  for (const row of rows) {
    const projectSlug = row.projectSlug ?? "default";
    const section = sections.get(projectSlug) ?? {
      projectName: row.projectName ?? projectSlug,
      projectSlug,
      rows: [],
    };

    section.rows.push(row);
    sections.set(projectSlug, section);
  }

  return [...sections.values()].sort((left, right) =>
    left.projectName.localeCompare(right.projectName),
  );
}

function getDashboardGroupCheckCount(group: GroupRow): number {
  if (group.children) {
    return group.children.length;
  }

  const count = Number.parseInt(group.checks, 10);

  return Number.isNaN(count) ? 0 : count;
}

function ProjectTableHeader({
  count,
  projectName,
}: {
  count: number;
  projectName: string;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-slate-700 bg-[#171e27] px-5 py-3">
      <Folder className="h-5 w-5 shrink-0 text-slate-500" />
      <h2 className="min-w-0 truncate font-semibold text-slate-200">{projectName}</h2>
      <span className="text-sm text-slate-500">
        {count === 1 ? "1 check" : `${count} checks`}
      </span>
    </div>
  );
}

function FirewatchPanel({
  failedChecksCount,
  firewatch,
  onOpenChange,
  onOpenAiAnalysis,
  onRunFailedChecks,
  onRunCheck,
  open,
}: {
  failedChecksCount: number;
  firewatch: DashboardFirewatch;
  onOpenChange: (open: boolean) => void;
  onOpenAiAnalysis: (row: DashboardFirewatchRow) => void;
  onRunFailedChecks: () => void;
  onRunCheck: (row: DashboardFirewatchRow) => void;
  open: boolean;
}) {
  const count = firewatch.rows.length;
  const projectSections = groupFirewatchRowsByProject(firewatch.rows);
  const alertText =
    count === 1
      ? `You have 1 check that started failing in the last ${firewatch.lookbackDays} days`
      : `You have ${count} checks that started failing in the last ${firewatch.lookbackDays} days`;

  return (
    <section className="overflow-hidden rounded-md border border-slate-800 bg-[#11161d]">
      <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <button
          aria-controls="firewatch-panel"
          aria-expanded={open}
          className="inline-flex min-w-0 items-center gap-2 text-left"
          onClick={() => onOpenChange(!open)}
          type="button"
        >
          {open ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
          )}
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-red-500/10 text-red-400">
            <Flame className="h-4 w-4" />
          </span>
          <span className="truncate text-lg font-semibold text-slate-100">
            Firewatch
          </span>
        </button>
        <div className="flex flex-wrap items-center gap-2">
          {count > 0 ? (
            <span className="inline-flex h-9 min-w-9 items-center justify-center rounded-md border border-red-500/30 bg-red-500/10 px-3 text-sm font-semibold text-red-300">
              {count}
            </span>
          ) : null}
          {failedChecksCount > 0 ? (
            <button
              className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-500"
              onClick={onRunFailedChecks}
              type="button"
            >
              <Zap className="h-4 w-4" />
              Restart all failed checks
            </button>
          ) : null}
        </div>
      </div>

      {open ? (
        <div id="firewatch-panel" className="px-4 pb-4 sm:px-5">
          {count > 0 ? (
            <>
              <div className="mb-4 flex items-center gap-2 text-sm font-medium text-red-400">
                <Flame className="h-4 w-4 shrink-0" />
                <span>{alertText}</span>
              </div>
              <div className="flex flex-col gap-4">
                {projectSections.map((section) => (
                  <FirewatchProjectTable
                    key={section.projectSlug}
                    onOpenAiAnalysis={onOpenAiAnalysis}
                    onRunCheck={onRunCheck}
                    projectName={section.projectName}
                    rows={section.rows}
                  />
                ))}
              </div>
            </>
          ) : (
            <div className="rounded-md border border-slate-700 bg-[#0f151d] px-4 py-5 text-sm text-slate-400">
              No newly failing checks in the last {firewatch.lookbackDays} days.
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}

function FirewatchProjectTable({
  onOpenAiAnalysis,
  onRunCheck,
  projectName,
  rows,
}: {
  onOpenAiAnalysis: (row: DashboardFirewatchRow) => void;
  onRunCheck: (row: DashboardFirewatchRow) => void;
  projectName: string;
  rows: DashboardFirewatchRow[];
}) {
  return (
    <section
      aria-label={`Firewatch project ${projectName}`}
      className="overflow-hidden rounded-md border border-slate-700"
    >
      <ProjectTableHeader count={rows.length} projectName={projectName} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] table-fixed text-left text-sm">
          <thead className="border-b border-slate-700 bg-[#121820] text-xs font-semibold uppercase text-slate-400">
            <tr>
              <th className="w-[40%] px-4 py-3">
                <span className="inline-flex items-center gap-2">
                  Name
                  <ArrowDownUp className="h-3.5 w-3.5 text-slate-600" />
                </span>
              </th>
              <th className="w-[10%] px-4 py-3">
                <span className="inline-flex items-center gap-2">
                  Type
                  <ArrowDownUp className="h-3.5 w-3.5 text-slate-600" />
                </span>
              </th>
              <th className="w-[14%] px-4 py-3">
                <span className="inline-flex items-center gap-2">
                  First Seen
                  <ArrowDownUp className="h-3.5 w-3.5 text-slate-600" />
                </span>
              </th>
              <th className="w-[14%] px-4 py-3">
                <span className="inline-flex items-center gap-2">
                  Last Seen
                  <ArrowDownUp className="h-3.5 w-3.5 text-slate-600" />
                </span>
              </th>
              <th className="w-[22%] px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                className="border-b border-slate-800 last:border-b-0"
                key={row.checkId}
              >
                <td className="px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-500 text-white">
                      <CircleX className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0">
                      <Link
                        className="block max-w-full truncate text-left font-medium text-blue-400 underline decoration-blue-500/60 underline-offset-2 hover:text-blue-300"
                        href={row.latestRunHref}
                        title={`${row.groupName} / ${row.name}`}
                      >
                        {row.groupName} / {row.name}
                      </Link>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <CheckTypeBadge type={row.type} />
                </td>
                <td
                  className="whitespace-nowrap px-4 py-3 text-slate-300"
                  title={row.firstSeenAt}
                >
                  {row.firstSeen}
                </td>
                <td
                  className="whitespace-nowrap px-4 py-3 text-slate-300"
                  title={row.lastSeenAt}
                >
                  {row.lastSeen}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      aria-label={`AI analysis for ${row.name}`}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-cyan-300 hover:bg-cyan-500/10 hover:text-cyan-200"
                      onClick={() => onOpenAiAnalysis(row)}
                      type="button"
                    >
                      <Bot className="h-4 w-4" />
                      AI analysis
                    </button>
                    <button
                      className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-blue-400 hover:bg-blue-500/10 hover:text-blue-300"
                      onClick={() => onRunCheck(row)}
                      type="button"
                    >
                      <Zap className="h-4 w-4" />
                      Schedule now
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CheckTypeBadge({ type }: { type: CheckRow["type"] }) {
  return (
    <span className="inline-flex h-5 items-center rounded border border-slate-500 px-1 text-[10px] font-bold uppercase text-slate-400">
      {type}
    </span>
  );
}

function Topbar({ actions }: { actions?: ReactNode }) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-slate-800 bg-[#12171f]/95 px-4 backdrop-blur sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <ServiceMark className="h-9 w-9 shrink-0 rounded-md xl:hidden" />
      </div>
      <div className="flex shrink-0 items-center gap-2" data-appnotes-actions="">
        {actions}
      </div>
    </header>
  );
}

function QueueScreen({ queue }: { queue: QueueRow[] }) {
  const sortedQueue = [...queue].sort(compareQueueRows);

  return (
    <>
      <div>
        <h2 className="text-3xl font-semibold text-slate-100">Queue</h2>
        <p className="mt-1 text-sm text-slate-500">
          {queue.length === 1 ? "1 active test" : `${queue.length} active tests`}
        </p>
      </div>

      <section className="overflow-hidden rounded-md border border-slate-800 bg-[#111821]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] table-fixed text-left text-sm">
            <thead className="bg-[#121820] text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="w-[34%] px-4 py-3">Name</th>
                <th className="w-[14%] px-4 py-3">Project</th>
                <th className="w-[10%] px-4 py-3">Type</th>
                <th className="w-[26%] px-4 py-3">Branch</th>
                <th className="w-[16%] px-4 py-3">Source</th>
              </tr>
            </thead>
            <tbody>
              {sortedQueue.length > 0 ? (
                sortedQueue.map((row) => <QueueTableRow key={row.id} row={row} />)
              ) : (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan={5}>
                    No running or queued tests.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function QueueTableRow({ row }: { row: QueueRow }) {
  return (
    <tr className="border-t border-slate-800 align-top hover:bg-slate-900/40">
      <td className="px-4 py-3">
        <div className="flex min-w-0 items-start gap-3">
          <QueueStateDot runState={row.runState} />
          <div className="min-w-0">
            <Link
              className="block truncate font-medium text-blue-300 hover:text-blue-200"
              href={row.checkHref}
              title={`${row.groupName} / ${row.checkName}`}
            >
              {row.checkName}
            </Link>
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
              <span className="truncate">{row.groupName}</span>
              <span className="text-slate-700">/</span>
              <span className={cn("font-semibold", getQueueStateTextClass(row))}>
                {row.runState === "running" ? "Running" : "Queued"}
              </span>
              <span className="text-slate-700">/</span>
              <span>{row.createdAtLabel}</span>
            </div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-slate-300">{row.projectSlug}</td>
      <td className="px-4 py-3">
        <CheckTypeBadge type={row.type} />
      </td>
      <td className="px-4 py-3">
        <span className="line-clamp-2 text-slate-300" title={row.branch}>
          {row.branch}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className="inline-flex h-7 items-center rounded-md border border-slate-700 px-2 text-xs font-semibold text-slate-300">
          {row.sourceLabel}
        </span>
      </td>
    </tr>
  );
}

function QueueStateDot({ runState }: { runState: QueueRow["runState"] }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full",
        runState === "running" ? "bg-blue-400" : "bg-yellow-400",
      )}
    />
  );
}

function getQueueStateTextClass(row: QueueRow) {
  return row.runState === "running" ? "text-blue-300" : "text-yellow-300";
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
    timeZone: settings.basic.timeZone,
  }));
  const [securityDraft, setSecurityDraft] = useState(() => ({
    password: "",
    passwordConfirm: "",
  }));
  const [aiDraft, setAiDraft] = useState(() => ({
    apiEndpointOption: settings.ai.apiEndpointOption,
    apiKey: "",
    customEndpoint: settings.ai.customEndpoint,
    model: settings.ai.model,
    responseLanguage: settings.ai.responseLanguage,
  }));
  const [performanceDraft, setPerformanceDraft] = useState(() =>
    createPerformanceSettingsDraft(settings.performance),
  );
  const [apiKeyName, setApiKeyName] = useState("");
  const [generatedApiKey, setGeneratedApiKey] = useState<
    { id: string; value: string } | undefined
  >();
  const [notice, setNotice] = useState<SettingsNotice>();
  const [secretRows, setSecretRows] = useState<RuntimeSecretDraft[]>(() =>
    settings.environment.secrets.map(createSecretDraft),
  );
  const [savingAi, setSavingAi] = useState(false);
  const [savingApiKey, setSavingApiKey] = useState(false);
  const [savingBasic, setSavingBasic] = useState(false);
  const [savingPerformance, setSavingPerformance] = useState(false);
  const [savingSecurity, setSavingSecurity] = useState(false);
  const [savingRuntime, setSavingRuntime] = useState(false);
  const [revokingApiKeyId, setRevokingApiKeyId] = useState<string>();
  const [variableRows, setVariableRows] = useState<RuntimeVariableDraft[]>(() =>
    settings.environment.variables.map(createVariableDraft),
  );
  const timeZoneOptions = useMemo(
    () => getTimeZoneOptions(basicDraft.timeZone),
    [basicDraft.timeZone],
  );

  useEffect(() => {
    setBasicDraft({
      domain: settings.basic.domain,
      timeZone: settings.basic.timeZone,
    });
    setSecurityDraft({
      password: "",
      passwordConfirm: "",
    });
  }, [settings.basic]);

  useEffect(() => {
    setAiDraft({
      apiEndpointOption: settings.ai.apiEndpointOption,
      apiKey: "",
      customEndpoint: settings.ai.customEndpoint,
      model: settings.ai.model,
      responseLanguage: settings.ai.responseLanguage,
    });
  }, [settings.ai]);

  useEffect(() => {
    setPerformanceDraft(createPerformanceSettingsDraft(settings.performance));
  }, [settings.performance]);

  useEffect(() => {
    setSecretRows(settings.environment.secrets.map(createSecretDraft));
    setVariableRows(settings.environment.variables.map(createVariableDraft));
  }, [settings.environment]);

  const selectedAiEndpoint =
    aiDraft.apiEndpointOption === AI_CUSTOM_ENDPOINT_VALUE
      ? aiDraft.customEndpoint
      : (settings.ai.endpointOptions.find(
          (option) => option.value === aiDraft.apiEndpointOption,
        )?.value ?? "");

  async function postBasicSettings(settingsPayload: {
    domain: string;
    login: string;
    notificationEmail: string;
    password?: string;
    passwordConfirm?: string;
    timeZone: string;
  }) {
    const payload = await postSettingsJson<{
      error?: string;
      settings?: DashboardSettingsData["basic"];
    }>("/api/settings/basic", settingsPayload);

    if (!payload.settings) {
      throw new Error("Basic settings were not returned.");
    }

    return payload.settings;
  }

  async function saveBasic(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingBasic(true);
    setNotice(undefined);

    try {
      const basicSettings = await postBasicSettings({
        domain: basicDraft.domain,
        login: settings.basic.login,
        notificationEmail: settings.basic.notificationEmail,
        timeZone: basicDraft.timeZone,
      });

      onSettingsChange({
        ...settings,
        basic: basicSettings,
      });
      setBasicDraft((current) => ({
        ...current,
        domain: basicSettings.domain,
        timeZone: basicSettings.timeZone,
      }));
      setNotice({ message: "Basic settings saved.", tone: "success" });
    } catch (error) {
      setNotice({
        message: `Basic settings were not saved. ${getErrorMessage(error)}`,
        tone: "error",
      });
    } finally {
      setSavingBasic(false);
    }
  }

  async function saveSecurity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingSecurity(true);
    setNotice(undefined);

    try {
      await postBasicSettings({
        domain: settings.basic.domain,
        login: settings.basic.login,
        notificationEmail: settings.basic.notificationEmail,
        password: securityDraft.password,
        passwordConfirm: securityDraft.passwordConfirm,
        timeZone: settings.basic.timeZone,
      });

      setSecurityDraft({
        password: "",
        passwordConfirm: "",
      });
      setNotice({ message: "Security settings saved.", tone: "success" });
    } catch (error) {
      setNotice({
        message: `Security settings were not saved. ${getErrorMessage(error)}`,
        tone: "error",
      });
    } finally {
      setSavingSecurity(false);
    }
  }

  async function generateApiKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingApiKey(true);
    setNotice(undefined);

    try {
      const payload = await postSettingsJson<{
        apiKey?: string;
        error?: string;
        key?: DashboardSettingsData["apiKeys"][number];
      }>("/api/settings/api-keys", {
        name: apiKeyName,
      });

      if (!payload.apiKey || !payload.key) {
        throw new Error("Generated API key was not returned.");
      }

      onSettingsChange({
        ...settings,
        apiKeys: [
          payload.key,
          ...settings.apiKeys.filter((key) => key.id !== payload.key?.id),
        ],
      });
      setGeneratedApiKey({
        id: payload.key.id,
        value: payload.apiKey,
      });
      setApiKeyName("");
      setNotice({ message: "API key generated.", tone: "success" });
    } catch (error) {
      setNotice({ message: getErrorMessage(error), tone: "error" });
    } finally {
      setSavingApiKey(false);
    }
  }

  async function copyGeneratedApiKey() {
    if (!generatedApiKey) {
      return;
    }

    try {
      await navigator.clipboard.writeText(generatedApiKey.value);
      setNotice({ message: "API key copied.", tone: "success" });
    } catch {
      setNotice({ message: "Unable to copy API key.", tone: "error" });
    }
  }

  async function revokeSettingsApiKey(id: string, name: string) {
    if (!window.confirm(`Revoke API key ${name}?`)) {
      return;
    }

    setRevokingApiKeyId(id);
    setNotice(undefined);

    try {
      const response = await fetch(`/api/settings/api-keys/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to revoke API key.");
      }

      onSettingsChange({
        ...settings,
        apiKeys: settings.apiKeys.filter((key) => key.id !== id),
      });
      setGeneratedApiKey((current) => (current?.id === id ? undefined : current));
      setNotice({ message: "API key revoked.", tone: "success" });
    } catch (error) {
      setNotice({ message: getErrorMessage(error), tone: "error" });
    } finally {
      setRevokingApiKeyId(undefined);
    }
  }

  async function saveAi(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingAi(true);
    setNotice(undefined);

    try {
      const payload = await postSettingsJson<{
        error?: string;
        settings?: DashboardSettingsData["ai"];
      }>("/api/settings/ai", {
        ...aiDraft,
        projectSlug: settings.projectSlug,
      });

      if (!payload.settings) {
        throw new Error("AI settings were not returned.");
      }

      const aiSettings = payload.settings;

      onSettingsChange({
        ...settings,
        ai: aiSettings,
      });
      setAiDraft((current) => ({
        ...current,
        apiEndpointOption: aiSettings.apiEndpointOption,
        apiKey: "",
        customEndpoint: aiSettings.customEndpoint,
        model: aiSettings.model,
        responseLanguage: aiSettings.responseLanguage,
      }));
      setNotice({ message: "AI settings saved.", tone: "success" });
    } catch (error) {
      setNotice({
        message: `AI settings were not saved. ${getErrorMessage(error)}`,
        tone: "error",
      });
    } finally {
      setSavingAi(false);
    }
  }

  async function savePerformance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingPerformance(true);
    setNotice(undefined);

    try {
      const payload = await postSettingsJson<{
        error?: string;
        settings?: DashboardSettingsData["performance"];
      }>("/api/settings/performance", {
        ...normalizePerformanceSettingsDraft(performanceDraft),
        projectSlug: settings.projectSlug,
      });

      if (!payload.settings) {
        throw new Error("Performance settings were not returned.");
      }

      onSettingsChange({
        ...settings,
        performance: payload.settings,
      });
      setNotice({ message: "Performance settings saved.", tone: "success" });
    } catch (error) {
      setNotice({
        message: `Performance settings were not saved. ${getErrorMessage(error)}`,
        tone: "error",
      });
    } finally {
      setSavingPerformance(false);
    }
  }

  async function saveRuntime(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingRuntime(true);
    setNotice(undefined);

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
      setNotice({ message: "Environment settings saved.", tone: "success" });
    } catch (error) {
      setNotice({
        message: `Environment settings were not saved. ${getErrorMessage(error)}`,
        tone: "error",
      });
    } finally {
      setSavingRuntime(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-blue-300">Settings</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-100">Administration</h2>
        </div>
      </div>

      {notice
        ? createPortal(
            <div
              className={cn(
                "fixed bottom-4 left-4 right-4 z-50 flex items-center gap-3 rounded-md border px-4 py-3 text-sm shadow-xl shadow-black/30 sm:left-auto sm:w-full sm:max-w-md",
                notice.tone === "success"
                  ? "border-emerald-800 bg-emerald-950 text-emerald-100"
                  : "border-red-800 bg-red-950 text-red-100",
              )}
              role={notice.tone === "success" ? "status" : "alert"}
            >
              {notice.tone === "success" ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
              ) : (
                <CircleAlert className="h-5 w-5 shrink-0 text-red-400" />
              )}
              <span className="min-w-0 flex-1">{notice.message}</span>
              <button
                aria-label="Dismiss notification"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-current/70 hover:bg-white/10 hover:text-current"
                onClick={() => setNotice(undefined)}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>,
            document.body,
          )
        : null}

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
            <div className="text-xs text-slate-500">Domain and timezone</div>
          </div>
        </div>

        <div className="grid gap-4 p-5">
          <label
            className="grid gap-2 text-sm font-medium text-slate-200 lg:w-1/2"
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
            className="grid gap-2 text-sm font-medium text-slate-200 lg:w-1/2"
            htmlFor="settings-time-zone"
          >
            Timezone
            <span className="relative">
              <select
                className="h-10 w-full appearance-none rounded-md border border-slate-700 bg-[#0f151d] px-3 pr-10 text-sm text-slate-100 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                id="settings-time-zone"
                onChange={(event) =>
                  setBasicDraft((current) => ({
                    ...current,
                    timeZone: event.target.value,
                  }))
                }
                required
                value={basicDraft.timeZone}
              >
                {timeZoneOptions.map((timeZone) => (
                  <option key={timeZone} value={timeZone}>
                    {timeZone}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </span>
          </label>
        </div>

        <div className="flex justify-end border-t border-slate-800 px-5 py-4">
          <button
            className="inline-flex h-10 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={savingBasic}
            type="submit"
          >
            <Save className="h-4 w-4" />
            Save
          </button>
        </div>
      </form>

      <section className="overflow-hidden rounded-md border border-slate-800 bg-[#11161d]">
        <div className="flex items-center gap-3 border-b border-slate-800 px-5 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-300">
            <KeyRound className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-base font-semibold text-slate-100">API keys</h3>
            <div className="text-xs text-slate-500">CLI access</div>
          </div>
        </div>

        <form
          className="grid gap-4 border-b border-slate-800 p-5"
          onSubmit={(event) => void generateApiKey(event)}
        >
          <div className="grid max-w-2xl gap-2">
            <label
              className="text-sm font-medium text-slate-200"
              htmlFor="settings-api-key-name"
            >
              Key name
            </label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                className="h-10 min-w-0 flex-1 rounded-md border border-slate-700 bg-[#0f151d] px-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                id="settings-api-key-name"
                maxLength={80}
                onChange={(event) => setApiKeyName(event.target.value)}
                placeholder="API key name"
                required
                type="text"
                value={apiKeyName}
              />
              <button
                className="inline-flex h-10 w-fit shrink-0 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={savingApiKey}
                type="submit"
              >
                <Plus className="h-4 w-4" />
                Generate
              </button>
            </div>
          </div>

          {generatedApiKey ? (
            <div className="grid gap-2 rounded-md border border-emerald-900/80 bg-emerald-950/30 p-3">
              <div className="text-sm font-semibold text-emerald-300">New API key</div>
              <div className="flex min-w-0 gap-2">
                <input
                  aria-label="Generated API key"
                  className="h-10 min-w-0 flex-1 rounded-md border border-emerald-900 bg-[#0f151d] px-3 font-mono text-sm text-slate-100 outline-none"
                  readOnly
                  value={generatedApiKey.value}
                />
                <button
                  aria-label="Copy generated API key"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-emerald-800 text-emerald-300 hover:bg-emerald-950"
                  onClick={() => void copyGeneratedApiKey()}
                  title="Copy API key"
                  type="button"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
              <div className="text-xs text-emerald-200/70">
                This value is shown once.
              </div>
            </div>
          ) : null}
        </form>

        <div className="divide-y divide-slate-800">
          {settings.apiKeys.length > 0 ? (
            settings.apiKeys.map((key) => (
              <div
                className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,auto)_2.5rem] sm:items-center"
                key={key.id}
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-100">
                    {key.name}
                  </div>
                  <div className="mt-1 font-mono text-xs text-slate-500">
                    {key.preview}
                  </div>
                </div>
                <div className="text-xs text-slate-500">
                  <div>Created {key.createdAtLabel}</div>
                  <div className="mt-1">
                    {key.lastUsedAtLabel
                      ? `Last used ${key.lastUsedAtLabel}`
                      : "Never used"}
                  </div>
                </div>
                <button
                  aria-label={`Revoke API key ${key.name}`}
                  className="flex h-10 w-10 items-center justify-center rounded-md border border-slate-700 text-slate-400 hover:border-red-900 hover:bg-red-950/40 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={revokingApiKeyId === key.id}
                  onClick={() => void revokeSettingsApiKey(key.id, key.name)}
                  title="Revoke API key"
                  type="button"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))
          ) : (
            <div className="px-5 py-6 text-sm text-slate-500">No active API keys.</div>
          )}
        </div>
      </section>

      <form
        className="rounded-md border border-slate-800 bg-[#11161d]"
        onSubmit={(event) => void saveSecurity(event)}
      >
        <div className="flex items-center gap-3 border-b border-slate-800 px-5 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-amber-500/15 text-amber-300">
            <LockKeyhole className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-base font-semibold text-slate-100">Security</h3>
            <div className="text-xs text-slate-500">Password</div>
          </div>
        </div>

        <div className="grid gap-4 p-5">
          <label
            className="grid gap-2 text-sm font-medium text-slate-200 lg:w-1/2"
            htmlFor="settings-password"
          >
            New password
            <input
              autoComplete="new-password"
              className="h-10 rounded-md border border-slate-700 bg-[#0f151d] px-3 text-sm text-slate-100 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              id="settings-password"
              minLength={8}
              onChange={(event) =>
                setSecurityDraft((current) => ({
                  ...current,
                  password: event.target.value,
                }))
              }
              required
              type="password"
              value={securityDraft.password}
            />
          </label>

          <label
            className="grid gap-2 text-sm font-medium text-slate-200 lg:w-1/2"
            htmlFor="settings-password-confirm"
          >
            Confirm password
            <input
              autoComplete="new-password"
              className="h-10 rounded-md border border-slate-700 bg-[#0f151d] px-3 text-sm text-slate-100 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              id="settings-password-confirm"
              minLength={8}
              onChange={(event) =>
                setSecurityDraft((current) => ({
                  ...current,
                  passwordConfirm: event.target.value,
                }))
              }
              required
              type="password"
              value={securityDraft.passwordConfirm}
            />
          </label>
        </div>

        <div className="flex justify-end border-t border-slate-800 px-5 py-4">
          <button
            className="inline-flex h-10 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={savingSecurity}
            type="submit"
          >
            <Save className="h-4 w-4" />
            Save
          </button>
        </div>
      </form>

      <form
        className="rounded-md border border-slate-800 bg-[#11161d]"
        onSubmit={(event) => void savePerformance(event)}
      >
        <div className="flex items-center gap-3 border-b border-slate-800 px-5 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-violet-500/15 text-violet-300">
            <Gauge className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-base font-semibold text-slate-100">Performance</h3>
            <div className="text-xs text-slate-500">
              Execution limits and retention windows
            </div>
          </div>
        </div>

        <div className="grid gap-5 p-5">
          {performanceSettingFields.map((field) => {
            const fieldId = `settings-performance-${field.key}`;
            const rangeId = `${fieldId}-range`;
            const inputValue = performanceDraft[field.key];
            const value = normalizePerformanceSettingValue(field.key, inputValue);

            return (
              <div className="grid gap-3 lg:w-1/2" key={field.key}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <label
                      className="text-sm font-medium text-slate-200"
                      htmlFor={fieldId}
                    >
                      {field.label}
                    </label>
                    <div className="mt-1 text-xs text-slate-500">
                      {field.description}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <input
                      className="h-10 w-20 rounded-md border border-slate-700 bg-[#0f151d] px-3 text-right text-sm font-semibold tabular-nums text-slate-100 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                      id={fieldId}
                      max={field.max}
                      min={field.min}
                      onBlur={() =>
                        setPerformanceDraft((current) => ({
                          ...current,
                          [field.key]: String(
                            normalizePerformanceSettingValue(
                              field.key,
                              current[field.key],
                            ),
                          ),
                        }))
                      }
                      onChange={(event) =>
                        setPerformanceDraft((current) => ({
                          ...current,
                          [field.key]: event.target.value,
                        }))
                      }
                      required
                      step={1}
                      type="number"
                      value={inputValue}
                    />
                    <span className="w-10 text-sm text-slate-500">{field.suffix}</span>
                  </div>
                </div>

                <input
                  aria-label={`${field.label} slider`}
                  className="settings-range w-full cursor-pointer"
                  id={rangeId}
                  max={field.max}
                  min={field.min}
                  onChange={(event) =>
                    setPerformanceDraft((current) => ({
                      ...current,
                      [field.key]: event.target.value,
                    }))
                  }
                  style={getRangeFillStyle(value, field.min, field.max)}
                  type="range"
                  value={value}
                />

                <div className="flex justify-between text-xs text-slate-600">
                  <span>{field.min}</span>
                  <span>{field.max}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-end border-t border-slate-800 px-5 py-4">
          <button
            className="inline-flex h-10 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={savingPerformance}
            type="submit"
          >
            <Save className="h-4 w-4" />
            Save
          </button>
        </div>
      </form>

      <form
        className="rounded-md border border-slate-800 bg-[#11161d]"
        onSubmit={(event) => void saveAi(event)}
      >
        <div className="flex items-center gap-3 border-b border-slate-800 px-5 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-cyan-500/15 text-cyan-300">
            <Bot className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-base font-semibold text-slate-100">AI / LLM</h3>
            <div className="text-xs text-slate-500">
              Failed run analysis and user-facing AI replies
            </div>
          </div>
        </div>

        <div className="grid gap-4 p-5">
          <div className="grid gap-2 lg:w-1/2">
            <label
              className="grid gap-2 text-sm font-medium text-slate-200"
              htmlFor="settings-ai-api-endpoint"
            >
              AI_API_ENDPOINT
              <span className="relative">
                <select
                  className="h-10 w-full appearance-none rounded-md border border-slate-700 bg-[#0f151d] px-3 pr-10 text-sm text-slate-100 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  id="settings-ai-api-endpoint"
                  onChange={(event) =>
                    setAiDraft((current) => ({
                      ...current,
                      apiEndpointOption: event.target.value,
                    }))
                  }
                  value={aiDraft.apiEndpointOption}
                >
                  {settings.ai.endpointOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </span>
            </label>

            <div className="min-h-5 break-all text-sm text-slate-500">
              {selectedAiEndpoint || "Set a custom endpoint URL."}
            </div>
          </div>

          {aiDraft.apiEndpointOption === AI_CUSTOM_ENDPOINT_VALUE ? (
            <label
              className="grid gap-2 text-sm font-medium text-slate-200 lg:w-1/2"
              htmlFor="settings-ai-custom-endpoint"
            >
              Custom endpoint
              <input
                className="h-10 rounded-md border border-slate-700 bg-[#0f151d] px-3 text-sm text-slate-100 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                id="settings-ai-custom-endpoint"
                onChange={(event) =>
                  setAiDraft((current) => ({
                    ...current,
                    customEndpoint: event.target.value,
                  }))
                }
                placeholder="https://example.com/v1"
                required
                type="url"
                value={aiDraft.customEndpoint}
              />
            </label>
          ) : null}

          <label
            className="grid gap-2 text-sm font-medium text-slate-200 lg:w-1/2"
            htmlFor="settings-ai-api-key"
          >
            AI_API_KEY
            <input
              aria-label="AI_API_KEY"
              autoComplete="new-password"
              className="h-10 rounded-md border border-slate-700 bg-[#0f151d] px-3 text-sm text-slate-100 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              id="settings-ai-api-key"
              onChange={(event) =>
                setAiDraft((current) => ({
                  ...current,
                  apiKey: event.target.value,
                }))
              }
              placeholder="Paste new API key"
              required={!settings.ai.hasApiKey}
              type="password"
              value={aiDraft.apiKey}
            />
            {settings.ai.apiKeyMasked ? (
              <span className="text-sm font-normal text-slate-500">
                Current key: {settings.ai.apiKeyMasked}
              </span>
            ) : null}
          </label>

          <label
            className="grid gap-2 text-sm font-medium text-slate-200 lg:w-1/2"
            htmlFor="settings-ai-model"
          >
            AI_MODEL
            <input
              className="h-10 rounded-md border border-slate-700 bg-[#0f151d] px-3 text-sm text-slate-100 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              id="settings-ai-model"
              onChange={(event) =>
                setAiDraft((current) => ({
                  ...current,
                  model: event.target.value,
                }))
              }
              required
              type="text"
              value={aiDraft.model}
            />
          </label>

          <label
            className="grid gap-2 text-sm font-medium text-slate-200 lg:w-1/2"
            htmlFor="settings-ai-response-language"
          >
            AI_RESPONSE_LANGUAGE
            <span className="relative">
              <select
                className="h-10 w-full appearance-none rounded-md border border-slate-700 bg-[#0f151d] px-3 pr-10 text-sm text-slate-100 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                id="settings-ai-response-language"
                onChange={(event) =>
                  setAiDraft((current) => ({
                    ...current,
                    responseLanguage: event.target.value,
                  }))
                }
                value={aiDraft.responseLanguage}
              >
                <option value="Russian">Russian</option>
                <option value="English">English</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </span>
          </label>
        </div>

        <div className="flex justify-end border-t border-slate-800 px-5 py-4">
          <button
            className="inline-flex h-10 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={savingAi}
            type="submit"
          >
            <Save className="h-4 w-4" />
            Save
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

        <div className="grid gap-6 p-5">
          <section className="min-w-0">
            <div className="mb-3 flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-100">
              <UserRound className="h-4 w-4 shrink-0 text-slate-500" />
              <span className="truncate">Variables</span>
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
              <button
                aria-label="Add variable"
                className="mt-1 inline-flex h-10 w-fit items-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-500"
                onClick={() =>
                  setVariableRows((current) => [...current, createVariableDraft()])
                }
                type="button"
              >
                <Plus className="h-4 w-4" />
                Add
              </button>
            </div>
          </section>

          <section className="min-w-0">
            <div className="mb-3 flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-100">
              <LockKeyhole className="h-4 w-4 shrink-0 text-slate-500" />
              <span className="truncate">Secrets</span>
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
                    placeholder={
                      row.valueMasked ?? (row.hasValue ? "********" : "value")
                    }
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
              <button
                aria-label="Add secret"
                className="mt-1 inline-flex h-10 w-fit items-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-500"
                onClick={() =>
                  setSecretRows((current) => [...current, createSecretDraft()])
                }
                type="button"
              >
                <Plus className="h-4 w-4" />
                Add
              </button>
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
            Save
          </button>
        </div>
      </form>
    </div>
  );
}

function createDraftId() {
  return Math.random().toString(36).slice(2);
}

function getTimeZoneOptions(selectedTimeZone: string) {
  const supportedTimeZones =
    typeof Intl.supportedValuesOf === "function"
      ? Intl.supportedValuesOf("timeZone")
      : [];

  return Array.from(
    new Set(
      [selectedTimeZone, ...preferredTimeZoneOptions, ...supportedTimeZones].filter(
        Boolean,
      ),
    ),
  );
}

function getRangeFillStyle(value: number, min: number, max: number): RangeFillStyle {
  const range = max - min;
  const fill = range > 0 ? ((value - min) / range) * 100 : 0;
  const clampedFill = Math.min(100, Math.max(0, fill));

  return {
    "--settings-range-fill": `${clampedFill}%`,
  };
}

function createPerformanceSettingsDraft(
  settings: PerformanceSettingsData,
): PerformanceSettingsDraft {
  return Object.fromEntries(
    performanceSettingFields.map((field) => [field.key, String(settings[field.key])]),
  ) as PerformanceSettingsDraft;
}

function normalizePerformanceSettingsDraft(
  draft: PerformanceSettingsDraft,
): PerformanceSettingsData {
  return Object.fromEntries(
    performanceSettingFields.map((field) => [
      field.key,
      normalizePerformanceSettingValue(field.key, draft[field.key]),
    ]),
  ) as PerformanceSettingsData;
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
    valueMasked: secret.valueMasked,
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
  groups: visibleGroups,
  onActionMenuToggle,
  onGroupToggle,
  onNotice,
  onOpenAiAnalysis,
  onRunCheckNow,
}: {
  activeActionMenu: string | null;
  groups: GroupRow[];
  onActionMenuToggle: (key: string) => void;
  onGroupToggle: (groupName: string) => void;
  onNotice: (notice: string) => void;
  onOpenAiAnalysis: (drawer: AiAnalysisDrawerState) => void;
  onRunCheckNow: (check: CheckRow) => void;
}) {
  const projectSections = groupDashboardGroupsByProject(visibleGroups);

  if (projectSections.length === 0) {
    return (
      <section className="rounded-md border border-slate-800 bg-[#11161d] px-5 py-8 text-sm text-slate-500">
        No checks match the current filters.
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {projectSections.map((section) => (
        <section
          aria-label={`Project ${section.projectName}`}
          className="overflow-hidden rounded-md border border-slate-800 bg-[#11161d]"
          key={section.projectSlug}
        >
          <ProjectTableHeader
            count={section.groups.reduce(
              (count, group) => count + getDashboardGroupCheckCount(group),
              0,
            )}
            projectName={section.projectName}
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1280px] table-fixed text-left text-sm">
              <thead className="border-b border-slate-700 bg-[#121820] text-xs font-semibold uppercase text-slate-400">
                <tr>
                  <th className="w-[42%] px-5 py-3">
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
                  <th className="w-[8%] px-4 py-3">
                    <span className="border-b border-dotted border-slate-500">AVG</span>
                  </th>
                  <th className="w-[8%] px-4 py-3">
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
                {section.groups.map((group) => (
                  <GroupBlock
                    activeActionMenu={activeActionMenu}
                    group={group}
                    key={getGroupKey(group)}
                    onActionMenuToggle={onActionMenuToggle}
                    onGroupToggle={onGroupToggle}
                    onNotice={onNotice}
                    onOpenAiAnalysis={onOpenAiAnalysis}
                    onRunCheckNow={onRunCheckNow}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}

function GroupBlock({
  activeActionMenu,
  group,
  onActionMenuToggle,
  onGroupToggle,
  onNotice,
  onOpenAiAnalysis,
  onRunCheckNow,
}: {
  activeActionMenu: string | null;
  group: GroupRow;
  onActionMenuToggle: (key: string) => void;
  onGroupToggle: (groupName: string) => void;
  onNotice: (notice: string) => void;
  onOpenAiAnalysis: (drawer: AiAnalysisDrawerState) => void;
  onRunCheckNow: (check: CheckRow) => void;
}) {
  const groupKey = getGroupKey(group);
  const actionKey = `group:${groupKey}`;
  const actionButtonRef = useRef<HTMLButtonElement>(null);
  const projectName = group.projectName ?? group.projectSlug;
  const toggleLabel = `${group.expanded ? "Collapse" : "Expand"} ${projectName ? `${projectName} ` : ""}${group.name}`;

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
        onClick={() => onGroupToggle(groupKey)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onGroupToggle(groupKey);
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
            <GroupStatus group={group} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-200">{group.name}</span>
                <span className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-xs font-medium text-slate-400">
                  {group.projectName ?? group.projectSlug ?? "default"}
                </span>
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
            ref={actionButtonRef}
            type="button"
          >
            <MoreVertical className="h-5 w-5" />
          </button>
          {activeActionMenu === actionKey ? (
            <ActionMenu
              anchor={actionButtonRef.current}
              name={group.name}
              onClose={() => onActionMenuToggle(actionKey)}
              onNotice={onNotice}
              onOpen={() => onGroupToggle(groupKey)}
            />
          ) : null}
        </td>
      </tr>

      {group.expanded
        ? group.children?.map((check) => (
            <CheckTableRow
              activeActionMenu={activeActionMenu}
              check={check}
              key={check.id}
              onActionMenuToggle={onActionMenuToggle}
              onNotice={onNotice}
              onOpenAiAnalysis={onOpenAiAnalysis}
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
  onOpenAiAnalysis,
  onRunCheckNow,
}: {
  activeActionMenu: string | null;
  check: CheckRow;
  onActionMenuToggle: (key: string) => void;
  onNotice: (notice: string) => void;
  onOpenAiAnalysis: (drawer: AiAnalysisDrawerState) => void;
  onRunCheckNow: (check: CheckRow) => void;
}) {
  const actionKey = `check:${check.id}`;
  const actionButtonRef = useRef<HTMLButtonElement>(null);
  const latestRun = check.runs[0];
  const latestRunFailed = Boolean(
    latestRun && ["cancelled", "failed", "timed_out"].includes(latestRun.runState),
  );

  return (
    <>
      <tr className="border-b border-slate-800 bg-[#141a21] text-slate-300 transition hover:bg-[#18202a]">
        <td className="px-5 py-3">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="h-4 w-4 shrink-0" />
            <CheckStatus runState={check.runState} status={check.status} />
            <div className="min-w-0">
              <Link
                className="block truncate font-semibold text-slate-200 hover:text-blue-300"
                href={`/checks/${encodeURIComponent(check.id)}`}
              >
                {check.name}
              </Link>
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
        <td className="whitespace-nowrap px-4 py-3 text-slate-300">{check.avg}</td>
        <td className="whitespace-nowrap px-4 py-3 text-slate-300">{check.p95}</td>
        <td className="whitespace-nowrap px-4 py-3 text-slate-300">{check.delta}</td>
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
            ref={actionButtonRef}
            type="button"
          >
            <MoreVertical className="h-5 w-5" />
          </button>
          {activeActionMenu === actionKey ? (
            <ActionMenu
              anchor={actionButtonRef.current}
              name={check.name}
              onClose={() => onActionMenuToggle(actionKey)}
              onNotice={onNotice}
              openHref={`/checks/${encodeURIComponent(check.id)}`}
              onOpenAiAnalysis={
                latestRunFailed && latestRun
                  ? () =>
                      onOpenAiAnalysis({
                        analysis: latestRun.aiAnalysis,
                        checkName: check.name,
                        occurredAt: latestRun.occurredAt,
                      })
                  : undefined
              }
              onRunNow={() => onRunCheckNow(check)}
            />
          ) : null}
        </td>
      </tr>
    </>
  );
}

function ActionMenu({
  anchor,
  name,
  onClose,
  onNotice,
  onOpen,
  onOpenAiAnalysis,
  onRunNow,
  openHref,
}: {
  anchor: HTMLButtonElement | null;
  name: string;
  onClose: () => void;
  onNotice: (notice: string) => void;
  onOpen?: () => void;
  onOpenAiAnalysis?: () => void;
  onRunNow?: () => void;
  openHref?: string;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    if (!anchor) {
      return;
    }

    const anchorElement = anchor;

    function updatePosition() {
      const menu = menuRef.current;

      if (!menu) {
        return;
      }

      const viewportPadding = 8;
      const menuGap = 4;
      const anchorRect = anchorElement.getBoundingClientRect();
      const menuWidth = menu.offsetWidth || 160;
      const menuHeight = menu.offsetHeight || 160;
      const availableBelow = window.innerHeight - anchorRect.bottom;
      const availableAbove = anchorRect.top;
      const placeAbove =
        availableBelow < menuHeight + menuGap && availableAbove > availableBelow;
      const left = Math.min(
        Math.max(viewportPadding, window.innerWidth - menuWidth - viewportPadding),
        Math.max(viewportPadding, anchorRect.right - menuWidth),
      );
      const desiredTop = placeAbove
        ? anchorRect.top - menuHeight - menuGap
        : anchorRect.bottom + menuGap;
      const top = Math.min(
        Math.max(viewportPadding, window.innerHeight - menuHeight - viewportPadding),
        Math.max(viewportPadding, desiredTop),
      );

      setPosition({ left, top });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchor]);

  async function copyName() {
    await navigator.clipboard?.writeText(name);
    onNotice(`Copied ${name}.`);
    onClose();
  }

  return createPortal(
    <div
      className="fixed z-50 w-40 rounded-md border border-slate-700 bg-[#12171f] p-1 shadow-xl shadow-black/30"
      data-action-menu-root
      ref={menuRef}
      style={{
        left: position?.left ?? 0,
        top: position?.top ?? 0,
        visibility: position ? "visible" : "hidden",
      }}
    >
      {openHref ? (
        <Link
          className="block w-full rounded px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-800"
          href={openHref}
          onClick={onClose}
        >
          Open
        </Link>
      ) : onOpen ? (
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
      ) : null}
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
      {onOpenAiAnalysis ? (
        <button
          className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-cyan-200 hover:bg-slate-800"
          onClick={() => {
            onOpenAiAnalysis();
            onClose();
          }}
          type="button"
        >
          <Bot className="h-4 w-4" />
          AI analysis
        </button>
      ) : null}
      <button
        className="block w-full rounded px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-800"
        onClick={() => void copyName()}
        type="button"
      >
        Copy name
      </button>
    </div>,
    document.body,
  );
}

function AiAnalysisDrawer({
  drawer,
  onClose,
}: {
  drawer: AiAnalysisDrawerState;
  onClose: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const analysis = drawer.analysis;
  const meta = [analysis?.model, analysis?.responseLanguage, drawer.occurredAt].filter(
    Boolean,
  );

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/65 backdrop-blur-[1px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <aside
        aria-labelledby="ai-analysis-title"
        aria-modal="true"
        className="flex h-full w-full flex-col border-l border-slate-700 bg-[#0d1117] shadow-2xl shadow-black/60 md:w-1/2"
        role="dialog"
      >
        <header className="flex items-start gap-3 border-b border-slate-800 px-6 py-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cyan-950 text-cyan-300">
            <Bot className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-slate-100" id="ai-analysis-title">
              AI analysis
            </h2>
            <div className="mt-0.5 truncate text-sm text-slate-400">
              {drawer.checkName}
            </div>
          </div>
          <button
            aria-label="Close AI analysis"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-100"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="break-all text-xs text-slate-500">{meta.join(" · ")}</div>
            {analysis?.status === "completed" && analysis.content ? (
              <CopyAnalysisButton text={analysis.content} />
            ) : analysis ? (
              <span className="rounded bg-amber-950 px-2 py-1 text-xs font-semibold uppercase text-amber-200">
                {analysis.status}
              </span>
            ) : null}
          </div>

          {analysis?.content ? (
            <pre className="mt-5 whitespace-pre-wrap break-words rounded-md border border-cyan-950/70 bg-[#111821] p-5 font-sans text-sm leading-6 text-slate-200">
              {analysis.content}
            </pre>
          ) : analysis?.error ? (
            <div className="mt-5 rounded-md border border-amber-900/70 bg-amber-950/30 p-5 text-sm leading-6 text-amber-100">
              {analysis.error}
            </div>
          ) : (
            <div className="mt-5 rounded-md border border-slate-800 bg-[#111821] p-5 text-sm leading-6 text-slate-300">
              AI analysis is unavailable for this run. Check the AI settings and run the
              test again to generate a failure analysis.
            </div>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  );
}

const groupStatusSegments = [
  { color: "#10b981", key: "passing", label: "passing" },
  { color: "#ef4444", key: "failing", label: "failing" },
  { color: "#3b82f6", key: "running", label: "running" },
  { color: "#facc15", key: "queued", label: "queued" },
  { color: "#f97316", key: "degraded", label: "degraded" },
] as const;

function GroupStatus({ group }: { group: GroupRow }) {
  const counts = groupStatusSegments.map((segment) => ({
    ...segment,
    count:
      group.children?.filter((check) =>
        segment.key === "running" || segment.key === "queued"
          ? check.runState === segment.key
          : check.runState !== "running" &&
            check.runState !== "queued" &&
            check.status === segment.key,
      ).length ?? (segment.key === group.status ? 1 : 0),
  }));
  const total = counts.reduce((sum, segment) => sum + segment.count, 0);
  const radius = 12;
  const circumference = 2 * Math.PI * radius;
  const visibleSegments = counts.filter((segment) => segment.count > 0);
  const gap = visibleSegments.length > 1 ? 1.2 : 0;
  const minimumSegmentLength = visibleSegments.length > 1 ? 4 : 0;
  const proportionalLength =
    circumference - minimumSegmentLength * visibleSegments.length;
  const label = counts
    .filter((segment) => segment.count > 0)
    .map((segment) => `${segment.count} ${segment.label}`)
    .join(", ");
  let offset = 0;

  return (
    <svg
      aria-label={`Group status: ${label}`}
      className="h-8 w-8 shrink-0 -rotate-90"
      role="img"
      viewBox="0 0 32 32"
    >
      <circle cx="16" cy="16" fill="none" r={radius} stroke="#334155" strokeWidth="5" />
      {counts.map((segment) => {
        if (segment.count === 0 || total === 0) {
          return null;
        }

        const length =
          minimumSegmentLength + (segment.count / total) * proportionalLength;
        const dashLength = Math.max(0, length - gap);
        const dashOffset = -offset;
        offset += length;

        return (
          <circle
            cx="16"
            cy="16"
            data-status={segment.key}
            fill="none"
            key={segment.key}
            r={radius}
            stroke={segment.color}
            strokeDasharray={`${dashLength} ${circumference - dashLength}`}
            strokeDashoffset={dashOffset}
            strokeWidth="5"
          />
        );
      })}
    </svg>
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
      {bars.map((bar, index) => (
        <SparkBar
          bar={bar}
          index={index}
          key={`${bar.occurredAt}-${bar.value}-${index}`}
        />
      ))}
    </div>
  );
}

type SparkBarData = CheckRow["bars"][number];
type SparkBarAttempt = NonNullable<SparkBarData["attempts"]>[number];
type SparkBarTooltipPosition = {
  arrowLeft: number;
  left: number;
  placement: "bottom" | "top";
  top: number;
};

function SparkBar({ bar, index }: { bar: SparkBarData; index: number }) {
  const anchorRef = useRef<HTMLElement | null>(null);
  const tooltipRef = useRef<HTMLSpanElement | null>(null);
  const [active, setActive] = useState(false);
  const [position, setPosition] = useState<SparkBarTooltipPosition | null>(null);
  const tooltipContent = runStateTooltipContent[bar.runState];
  const attempts = getSparkBarAttempts(bar);
  const attemptCountLabel = attempts.length > 1 ? ` ${attempts.length} attempts` : "";
  const versionLabel = bar.version ? ` version ${bar.version}` : "";
  const ariaLabel = `${tooltipContent.title} ${bar.runner} ${bar.duration} ${bar.occurredAt}${attemptCountLabel}${versionLabel}`;
  const className =
    "group relative flex h-11 w-2 items-end justify-center outline-none hover:z-20 focus-visible:ring-2 focus-visible:ring-blue-400/60 focus-within:z-20";
  const content = (
    <>
      <span
        aria-hidden="true"
        className={cn(
          "spark-bar-grow block w-1 origin-bottom rounded-sm transition",
          getRunResultToneClassName(bar.tone),
        )}
        style={{
          animationDelay: `${Math.min(index, 12) * 18}ms`,
          height: `${bar.value}px`,
        }}
      />
      {bar.hasRetries ? (
        <span
          aria-hidden="true"
          className="absolute bottom-0 h-1.5 w-1.5 translate-y-2 rounded-full bg-orange-400 shadow-sm shadow-orange-950/40"
        />
      ) : null}
      {active ? (
        <SparkBarTooltipPortal
          attempts={attempts}
          bar={bar}
          position={position}
          ref={tooltipRef}
          title={tooltipContent.title}
        />
      ) : null}
    </>
  );

  useEffect(() => {
    if (!active) {
      setPosition(null);
      return;
    }

    function updatePosition() {
      const anchor = anchorRef.current;
      const tooltip = tooltipRef.current;

      if (!anchor || !tooltip) {
        return;
      }

      const viewportPadding = 8;
      const tooltipGap = 12;
      const anchorRect = anchor.getBoundingClientRect();
      const tooltipWidth = tooltip.offsetWidth || 256;
      const tooltipHeight = tooltip.offsetHeight || 120;
      const anchorCenter = anchorRect.left + anchorRect.width / 2;
      const availableBelow = window.innerHeight - anchorRect.bottom;
      const availableAbove = anchorRect.top;
      const placement =
        availableBelow >= tooltipHeight + tooltipGap || availableBelow >= availableAbove
          ? "bottom"
          : "top";
      const unclampedLeft = anchorCenter - tooltipWidth / 2;
      const left = Math.min(
        window.innerWidth - tooltipWidth - viewportPadding,
        Math.max(viewportPadding, unclampedLeft),
      );
      const top =
        placement === "bottom"
          ? Math.min(
              window.innerHeight - tooltipHeight - viewportPadding,
              anchorRect.bottom + tooltipGap,
            )
          : Math.max(viewportPadding, anchorRect.top - tooltipHeight - tooltipGap);

      setPosition({
        arrowLeft: Math.min(tooltipWidth - 16, Math.max(16, anchorCenter - left)),
        left,
        placement,
        top,
      });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [active]);

  const sharedProps = {
    "aria-label": ariaLabel,
    className,
    onBlur: () => setActive(false),
    onFocus: () => setActive(true),
    onKeyDown: (event: ReactKeyboardEvent) => event.stopPropagation(),
    onMouseEnter: () => setActive(true),
    onMouseLeave: () => setActive(false),
  };
  const setAnchorNode = (node: HTMLElement | null) => {
    anchorRef.current = node;
  };

  return bar.href ? (
    <Link
      {...sharedProps}
      href={bar.href}
      onClick={(event) => event.stopPropagation()}
      ref={setAnchorNode}
    >
      {content}
    </Link>
  ) : (
    <span
      {...sharedProps}
      onClick={(event) => event.stopPropagation()}
      ref={setAnchorNode}
      tabIndex={0}
    >
      {content}
    </span>
  );
}

function getSparkBarAttempts(bar: SparkBarData): SparkBarAttempt[] {
  return bar.attempts && bar.attempts.length > 0
    ? bar.attempts
    : [
        {
          duration: bar.duration,
          label: "Attempt #1",
          occurredAt: bar.occurredAt,
          runner: bar.runner,
          runState: bar.runState,
          status: bar.status,
          tone: bar.tone,
        },
      ];
}

const SparkBarTooltipPortal = forwardRef<
  HTMLSpanElement,
  {
    attempts: SparkBarAttempt[];
    bar: SparkBarData;
    position: SparkBarTooltipPosition | null;
    title: string;
  }
>(function SparkBarTooltipPortal({ attempts, bar, position, title }, ref) {
  return createPortal(
    <span
      className="pointer-events-none fixed z-50 w-max min-w-64 rounded-md border border-slate-500/20 bg-slate-600 px-4 py-3 text-left shadow-2xl shadow-black/40"
      ref={ref}
      role="tooltip"
      style={{
        left: position?.left ?? 0,
        top: position?.top ?? 0,
        visibility: position ? "visible" : "hidden",
      }}
    >
      <span className="flex items-center gap-2 text-base font-semibold text-slate-50">
        <ResultTooltipStatus runState={bar.runState} status={bar.status} />
        <span>{title}</span>
        {bar.version ? (
          <span className="ml-auto rounded border border-slate-400/40 bg-slate-700/50 px-1.5 py-0.5 font-mono text-xs font-medium text-slate-200">
            {bar.version}
          </span>
        ) : null}
      </span>
      {attempts.length > 1 ? (
        <span className="mt-3 grid gap-3">
          {attempts.map((attempt, attemptIndex) => (
            <span
              className="block"
              key={`${attempt.label}-${attempt.occurredAt}-${attemptIndex}`}
            >
              <span className="block text-xs font-semibold uppercase text-slate-300">
                {attempt.label}
                {attemptIndex === attempts.length - 1 ? " (final)" : ""}
              </span>
              <span className="mt-1 flex items-center gap-2 text-sm font-semibold text-slate-50">
                <ResultTooltipStatus
                  runState={attempt.runState}
                  status={attempt.status}
                />
                <span>{attempt.runner}</span>
              </span>
              <span className="mt-1 flex items-center gap-4 text-xs text-slate-200">
                <span>{attempt.duration}</span>
                <span>{attempt.occurredAt}</span>
              </span>
            </span>
          ))}
        </span>
      ) : (
        <span className="mt-2 flex items-center gap-6 text-sm text-slate-100">
          <span>{bar.runner}</span>
          <span>{bar.duration}</span>
          <span>{bar.occurredAt}</span>
        </span>
      )}
      <span
        className={cn(
          "absolute h-3 w-3 rotate-45 bg-slate-600",
          position?.placement === "top"
            ? "top-full -translate-y-1/2"
            : "bottom-full translate-y-1/2",
        )}
        style={{
          left: position?.arrowLeft ?? 16,
        }}
      />
    </span>,
    document.body,
  );
});

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
