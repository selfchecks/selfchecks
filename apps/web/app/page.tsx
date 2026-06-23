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
  MessageSquare,
  MoreVertical,
  Route,
  Search,
  Settings2,
  Tag,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

type Status = "passing" | "degraded" | "failing";

type NavItem = {
  active?: boolean;
  icon: LucideIcon;
  label: string;
};

type CheckRow = {
  avg: string;
  ava: string;
  bars: Array<{ tone?: "good" | "warn"; value: number }>;
  delta: string;
  name: string;
  p95: string;
  status: Status;
  tags: string[];
  time: string;
};

type GroupRow = {
  checks: string;
  children?: CheckRow[];
  expanded?: boolean;
  name: string;
  status: Status;
  updated: string;
};

const sidebarItems: NavItem[] = [{ active: true, icon: Home, label: "Home" }];

const summaryCards = [
  {
    label: "PASSING",
    tone: "border-emerald-950/80 bg-emerald-950/75 text-emerald-400 shadow-emerald-950/20",
    value: "176",
  },
  {
    label: "DEGRADED",
    tone: "border-amber-950/80 bg-amber-950/75 text-amber-400 shadow-amber-950/20",
    value: "2",
  },
  {
    label: "FAILING",
    tone: "border-red-950/80 bg-red-950/75 text-red-400 shadow-red-950/20",
    value: "0",
  },
];

const filterItems = [
  { icon: CalendarDays, label: "Last 24 hours" },
  { icon: CheckCircle2, label: "Status" },
  { icon: Zap, label: "Check type" },
  { icon: Tag, label: "Tags" },
  { icon: Route, label: "Traces" },
];

const groups: GroupRow[] = [
  {
    checks: "2 checks",
    name: "API / Bff",
    status: "passing",
    updated: "10 minutes ago",
  },
  {
    checks: "7 checks",
    name: "API / Core",
    status: "passing",
    updated: "3 minutes ago",
  },
  {
    checks: "5 checks",
    expanded: true,
    name: "API / Regress",
    status: "degraded",
    updated: "about 8 hours ago",
    children: [
      {
        avg: "1.53 s",
        ava: "100%",
        bars: [
          { tone: "warn", value: 36 },
          { value: 14 },
          { value: 26 },
          { value: 19 },
          { value: 16 },
          { value: 14 },
          { value: 13 },
          { value: 12 },
          { value: 11 },
          { value: 12 },
          { value: 12 },
          { value: 11 },
          { value: 12 },
          { value: 12 },
          { value: 12 },
          { value: 12 },
          { value: 13 },
          { value: 12 },
          { value: 11 },
          { value: 12 },
          { value: 11 },
          { value: 12 },
          { tone: "warn", value: 24 },
        ],
        delta: "24 h",
        name: "group.list",
        p95: "1.53 s",
        status: "degraded",
        tags: ["api", "regress"],
        time: "at Jun 22 2026 15:15",
      },
      {
        avg: "514 ms",
        ava: "100%",
        bars: [
          { value: 8 },
          { tone: "warn", value: 22 },
          { tone: "warn", value: 32 },
          { value: 12 },
          { value: 12 },
          { value: 12 },
          { value: 12 },
          { value: 12 },
          { value: 12 },
          { value: 12 },
          { value: 14 },
          { value: 12 },
          { value: 16 },
          { value: 12 },
          { value: 13 },
          { value: 12 },
          { value: 12 },
          { value: 12 },
          { value: 12 },
          { value: 11 },
          { value: 10 },
          { value: 12 },
          { value: 10 },
        ],
        delta: "24 h",
        name: "issue.get",
        p95: "514 ms",
        status: "passing",
        tags: ["api", "regress"],
        time: "about 12 hours ago",
      },
      {
        avg: "388 ms",
        ava: "100%",
        bars: [
          { value: 12 },
          { tone: "warn", value: 34 },
          { value: 16 },
          { value: 14 },
          { value: 22 },
          { value: 13 },
          { value: 20 },
          { value: 12 },
          { value: 18 },
          { value: 12 },
          { value: 11 },
          { value: 14 },
          { value: 16 },
          { value: 11 },
          { value: 12 },
          { value: 13 },
          { value: 14 },
          { value: 16 },
          { value: 24 },
          { value: 12 },
          { value: 13 },
          { tone: "warn", value: 20 },
          { value: 14 },
        ],
        delta: "24 h",
        name: "member.get",
        p95: "388 ms",
        status: "passing",
        tags: ["api", "regress"],
        time: "about 13 hours ago",
      },
      {
        avg: "305 ms",
        ava: "100%",
        bars: [
          { value: 26 },
          { value: 42 },
          { value: 24 },
          { value: 28 },
          { value: 32 },
          { value: 26 },
          { value: 30 },
          { value: 26 },
          { value: 32 },
          { value: 24 },
          { value: 35 },
          { value: 28 },
          { value: 30 },
          { value: 26 },
          { value: 27 },
          { value: 31 },
          { value: 28 },
          { value: 25 },
          { value: 34 },
          { value: 29 },
          { value: 43 },
          { value: 28 },
          { value: 27 },
        ],
        delta: "24 h",
        name: "sequence.get",
        p95: "305 ms",
        status: "passing",
        tags: ["api", "regress"],
        time: "about 22 hours ago",
      },
      {
        avg: "739 ms",
        ava: "100%",
        bars: [
          { value: 12 },
          { value: 10 },
          { value: 11 },
          { value: 12 },
          { value: 16 },
          { value: 18 },
          { value: 28 },
          { value: 20 },
          { value: 13 },
          { value: 10 },
          { value: 12 },
          { value: 15 },
          { value: 24 },
          { value: 18 },
          { value: 12 },
          { value: 16 },
          { value: 11 },
          { value: 14 },
          { value: 22 },
          { value: 13 },
          { value: 38 },
          { value: 12 },
          { value: 11 },
        ],
        delta: "24 h",
        name: "track.list",
        p95: "739 ms",
        status: "passing",
        tags: ["api", "regress"],
        time: "about 20 hours ago",
      },
    ],
  },
  {
    checks: "5 checks",
    name: "API / Smoke",
    status: "passing",
    updated: "less than a minute ago",
  },
];

export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-[#0d1117] text-slate-200">
      <h1 className="sr-only">Synthetic checks dashboard</h1>
      <Sidebar />

      <div className="min-h-screen xl:pl-72">
        <Topbar />

        <section className="mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
          <div className="grid gap-4 lg:grid-cols-3">
            {summaryCards.map((card) => (
              <div
                className={cn(
                  "rounded-md border px-5 py-4 shadow-lg",
                  "shadow-black/10",
                  card.tone,
                )}
                key={card.label}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold uppercase">{card.label}</span>
                  <Settings2 className="h-4 w-4 opacity-60" />
                </div>
                <div className="mt-1 text-3xl font-semibold leading-none">
                  {card.value}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
              <input
                aria-label="Search checks"
                className="h-12 w-full rounded-md border border-slate-700 bg-[#111821] pl-11 pr-12 text-sm text-slate-200 outline-none placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                placeholder="Search by name, request url..."
                type="search"
              />
              <kbd className="pointer-events-none absolute right-3 top-1/2 flex h-7 min-w-7 -translate-y-1/2 items-center justify-center rounded bg-slate-700 px-2 text-xs text-slate-400">
                /
              </kbd>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {filterItems.map((item) => {
                const Icon = item.icon;

                return (
                  <button
                    className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-700 bg-[#111821] px-3 text-sm font-medium text-slate-300 hover:border-slate-600 hover:bg-slate-800"
                    key={item.label}
                    type="button"
                  >
                    <Icon className="h-4 w-4 text-slate-400" />
                    {item.label}
                    <ChevronDown className="h-4 w-4 text-slate-500" />
                  </button>
                );
              })}
            </div>

            <button
              className="inline-flex h-9 w-fit items-center gap-2 rounded-md px-2 text-sm font-medium text-blue-400 hover:bg-blue-500/10"
              type="button"
            >
              <Tag className="h-4 w-4" />
              Save
            </button>
          </div>

          <ChecksTable />
        </section>
      </div>

      <button
        aria-label="Open support chat"
        className="fixed bottom-6 right-6 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-xl shadow-blue-950/40 hover:bg-blue-500"
        type="button"
      >
        <MessageSquare className="h-6 w-6" />
      </button>
    </main>
  );
}

function Sidebar() {
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

function Topbar() {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-800 bg-[#12171f]/95 px-4 backdrop-blur sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-600 text-white xl:hidden">
          <Zap className="h-5 w-5" />
        </div>
        <button
          className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1 text-sm font-medium text-slate-300 hover:bg-slate-800"
          type="button"
        >
          <span className="truncate">nikolaev@iprojects.ru</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
        </button>
      </div>

      <div className="flex items-center gap-4 text-sm text-slate-400">
        <a className="hidden hover:text-slate-100 md:inline" href="#">
          Changelog
        </a>
        <a className="hidden hover:text-slate-100 md:inline" href="#">
          Support
        </a>
        <a className="hidden hover:text-slate-100 md:inline" href="#">
          Docs
        </a>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-lime-600/70 text-sm font-semibold text-lime-50">
          AL
        </div>
      </div>
    </header>
  );
}

function ChecksTable() {
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
            {groups.map((group) => (
              <GroupBlock group={group} key={group.name} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function GroupBlock({ group }: { group: GroupRow }) {
  return (
    <>
      <tr
        className={cn(
          "border-b border-slate-800 text-slate-300",
          group.expanded ? "bg-[#202832]" : "bg-[#11161d]",
        )}
      >
        <td className="px-5 py-4">
          <div className="flex items-center gap-3">
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
        <td className="px-4 py-4">
          <button
            aria-label={`${group.name} actions`}
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-800 hover:text-slate-200"
            type="button"
          >
            <MoreVertical className="h-5 w-5" />
          </button>
        </td>
      </tr>

      {group.expanded
        ? group.children?.map((check) => (
            <CheckTableRow check={check} key={check.name} />
          ))
        : null}
    </>
  );
}

function CheckTableRow({ check }: { check: CheckRow }) {
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
          API
        </span>
      </td>
      <td className="px-4 py-3">
        <SparkBars bars={check.bars} />
      </td>
      <td className="px-4 py-3 text-slate-300">{check.ava}</td>
      <td className="px-4 py-3 text-slate-300">{check.avg}</td>
      <td className="px-4 py-3 text-slate-300">{check.p95}</td>
      <td className="px-4 py-3 text-slate-300">{check.delta}</td>
      <td className="px-4 py-3">
        <button
          aria-label={`${check.name} actions`}
          className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-800 hover:text-slate-200"
          type="button"
        >
          <MoreVertical className="h-5 w-5" />
        </button>
      </td>
    </tr>
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
