import type { CSSProperties } from "react";
import {
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  CheckCircle2,
  FlaskConical,
  History,
  Home,
  ListChecks,
  Route,
  Search,
  Settings2,
  Tag,
  Zap,
} from "lucide-react";

import { ServiceMark } from "@/components/service-mark";
import { cn } from "@/lib/utils";

type DashboardActiveView = "dashboard" | "queue" | "settings";

export function DashboardPageSkeleton({
  activeView = "dashboard",
}: {
  activeView?: DashboardActiveView;
}) {
  return (
    <main
      aria-busy="true"
      aria-label={
        activeView === "settings" ? "Loading settings" : "Loading dashboard data"
      }
      className="min-h-screen bg-[#0d1117] text-slate-200"
    >
      <h1 className="sr-only">Synthetic checks dashboard</h1>
      <SkeletonSidebar activeView={activeView} />

      <div className="min-h-screen xl:pl-72">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-slate-800 bg-[#12171f]/95 px-4 backdrop-blur sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <ServiceMark className="h-9 w-9 shrink-0 rounded-md xl:hidden" />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {activeView === "dashboard" ? (
              <button
                className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                disabled
                type="button"
              >
                <Zap className="h-4 w-4" />
                Run all checks
              </button>
            ) : null}
          </div>
        </header>

        <section className="mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
          {activeView === "settings" ? (
            <SettingsSkeleton />
          ) : activeView === "queue" ? (
            <QueueSkeleton />
          ) : (
            <DashboardSkeleton />
          )}
        </section>
      </div>
    </main>
  );
}

function SkeletonSidebar({ activeView }: { activeView: DashboardActiveView }) {
  const items = [
    { icon: Home, id: "dashboard", label: "Home" },
    { icon: ListChecks, id: "queue", label: "Queue" },
    { icon: History, id: "journal", label: "Journal" },
    { icon: FlaskConical, id: "test-sessions", label: "Test sessions" },
    { icon: ChartNoAxesColumnIncreasing, id: "usage", label: "Usage" },
    { icon: Settings2, id: "settings", label: "Settings" },
  ] as const;

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 flex-col border-r border-slate-800 bg-[#12171f] xl:flex">
      <div className="flex h-16 w-full items-center gap-3 border-b border-slate-800 px-5 text-left">
        <ServiceMark className="h-9 w-9 shrink-0 rounded-md" />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-100">
            SelfChecks
          </div>
          <div className="truncate text-xs text-slate-500">Synthetic monitoring</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-4 py-5">
        <div className="space-y-1">
          {items.map((item) => {
            const Icon = item.icon;
            const active = item.id === activeView;

            return (
              <div
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-9 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-medium",
                  active ? "bg-slate-700 text-slate-100" : "text-slate-400",
                )}
                key={item.id}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
              </div>
            );
          })}
        </div>
      </nav>

      <div className="border-t border-slate-800 p-4">
        <div className="relative flex items-center justify-between gap-3">
          <a
            aria-label="Open queue: running 0, queued 0"
            className="flex h-10 min-w-0 flex-1 items-center rounded-md px-3 text-slate-300"
            href="/?view=queue"
          >
            <SkeletonSidebarQueueIndicators queuedCount={0} runningCount={0} />
          </a>
          <button
            aria-expanded="false"
            aria-label="Open account menu"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-lime-600/30 text-sm font-semibold text-lime-50"
            disabled
            type="button"
          >
            AD
          </button>
        </div>
      </div>
    </aside>
  );
}

function SkeletonSidebarQueueIndicators({
  queuedCount,
  runningCount,
}: {
  queuedCount: number;
  runningCount: number;
}) {
  return (
    <span
      aria-label={`Running ${runningCount}, queued ${queuedCount}`}
      className="flex items-center gap-3 text-sm font-semibold"
      role="status"
    >
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-blue-400" />
        <span>{runningCount}</span>
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
        <span>{queuedCount}</span>
      </span>
    </span>
  );
}

function DashboardSkeleton() {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {["PASSING", "DEGRADED", "FAILING"].map((label) => (
          <div
            className="rounded-md border border-slate-800 bg-[#11161d] px-5 py-4 shadow-lg shadow-black/10"
            key={label}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold uppercase text-slate-500">
                {label}
              </span>
              <SkeletonLine className="h-4 w-4 rounded-full" />
            </div>
            <SkeletonLine className="mt-2 h-8 w-16" />
          </div>
        ))}
      </div>

      <section className="overflow-hidden rounded-md border border-slate-800 bg-[#11161d]">
        <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="inline-flex min-w-0 items-center gap-2 text-left">
            <SkeletonLine className="h-4 w-4" />
            <SkeletonLine className="h-7 w-7" />
            <span className="truncate text-lg font-semibold text-slate-500">
              Firewatch
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SkeletonLine className="h-9 w-9" />
            <button
              className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              disabled
              type="button"
            >
              <Zap className="h-4 w-4" />
              Restart all failed checks
            </button>
          </div>
        </div>
      </section>

      <div className="flex flex-col gap-5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
          <SkeletonLine className="h-12 w-full border border-slate-700 bg-[#111821]" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SkeletonFilter icon={CalendarDays} widthClassName="w-40" />
          <SkeletonFilter icon={CheckCircle2} widthClassName="w-36" />
          <SkeletonFilter icon={Zap} widthClassName="w-44" />
          <SkeletonFilter icon={Tag} widthClassName="w-32" />
          <SkeletonFilter icon={Route} widthClassName="w-36" />
        </div>
      </div>

      <ChecksTableSkeleton />
    </>
  );
}

function QueueSkeleton() {
  return (
    <>
      <div>
        <SkeletonLine className="h-9 w-32" />
        <SkeletonLine className="mt-2 h-4 w-28" />
      </div>
      <section className="overflow-hidden rounded-md border border-slate-800 bg-[#111821]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] table-fixed text-left text-sm">
            <thead className="bg-[#121820] text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="w-[42%] px-4 py-3">Name</th>
                <th className="w-[10%] px-4 py-3">Type</th>
                <th className="w-[32%] px-4 py-3">Branch</th>
                <th className="w-[16%] px-4 py-3">Source</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 4 }, (_, index) => (
                <tr className="border-t border-slate-800" key={index}>
                  <td className="px-4 py-3">
                    <div className="flex items-start gap-3">
                      <SkeletonLine className="mt-1.5 h-2.5 w-2.5 rounded-full" />
                      <div className="min-w-0 flex-1">
                        <SkeletonLine className="h-5 w-56 max-w-full" />
                        <SkeletonLine className="mt-2 h-4 w-72 max-w-full" />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <SkeletonLine className="h-5 w-12" />
                  </td>
                  <td className="px-4 py-3">
                    <SkeletonLine className="h-5 w-64 max-w-full" />
                  </td>
                  <td className="px-4 py-3">
                    <SkeletonLine className="h-7 w-20" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function SkeletonFilter({
  icon: Icon,
  widthClassName,
}: {
  icon: typeof CalendarDays;
  widthClassName: string;
}) {
  return (
    <div
      className={cn(
        "flex h-10 items-center gap-2 rounded-md border border-slate-700 bg-[#111821] px-3",
        widthClassName,
      )}
    >
      <Icon className="h-4 w-4 shrink-0 text-slate-600" />
      <SkeletonLine className="h-4 flex-1" />
    </div>
  );
}

function ChecksTableSkeleton() {
  return (
    <section className="overflow-hidden rounded-md border border-slate-800 bg-[#11161d]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1280px] table-fixed text-left text-sm">
          <thead className="border-b border-slate-700 bg-[#121820] text-xs font-semibold uppercase text-slate-400">
            <tr>
              <th className="w-[42%] px-5 py-3">Name</th>
              <th className="w-[8%] px-4 py-3">Type</th>
              <th className="w-[18%] px-4 py-3">Last results</th>
              <th className="w-[6%] px-4 py-3">AVA</th>
              <th className="w-[8%] px-4 py-3">AVG</th>
              <th className="w-[8%] px-4 py-3">P95</th>
              <th className="w-[6%] px-4 py-3">DT</th>
              <th className="w-[4%] px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 6 }, (_, index) => (
              <tr
                className={cn(
                  "border-b border-slate-800",
                  index % 3 === 0 ? "bg-[#11161d]" : "bg-[#141a21]",
                )}
                key={index}
              >
                <td className="px-5 py-4">
                  <div className="flex items-center gap-4">
                    <SkeletonLine className="h-8 w-8 rounded-full" />
                    <div className="min-w-0 flex-1">
                      <SkeletonLine className="h-5 w-52 max-w-full" />
                      <SkeletonLine className="mt-2 h-4 w-72 max-w-full" />
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <SkeletonLine className="h-5 w-10" />
                </td>
                <td className="px-4 py-4">
                  <div className="grid h-8 grid-cols-12 items-end gap-1">
                    {Array.from({ length: 12 }, (_, barIndex) => (
                      <SkeletonLine
                        className="w-full rounded-t-sm"
                        key={barIndex}
                        style={{
                          height: `${8 + ((index + barIndex) % 5) * 5}px`,
                        }}
                      />
                    ))}
                  </div>
                </td>
                <td className="px-4 py-4">
                  <SkeletonLine className="h-5 w-10" />
                </td>
                <td className="px-4 py-4">
                  <SkeletonLine className="h-5 w-12" />
                </td>
                <td className="px-4 py-4">
                  <SkeletonLine className="h-5 w-12" />
                </td>
                <td className="px-4 py-4">
                  <SkeletonLine className="h-5 w-10" />
                </td>
                <td className="px-4 py-4">
                  <SkeletonLine className="h-8 w-8" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SettingsSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <SkeletonLine className="h-3 w-20" />
          <SkeletonLine className="mt-2 h-8 w-56" />
        </div>
        <SkeletonLine className="h-10 w-32 border border-slate-700 bg-[#111821]" />
      </div>

      <SettingsCardSkeleton
        fieldClassName="lg:w-1/2"
        fields={2}
        title="Basic settings"
        widths={["w-20", "w-24"]}
      />
      <SettingsCardSkeleton
        fieldClassName="lg:w-1/2"
        fields={2}
        title="Security"
        widths={["w-28", "w-32"]}
      />
      <SettingsCardSkeleton
        fields={6}
        title="Performance"
        variant="slider"
        widths={["w-40", "w-36", "w-40", "w-52", "w-44", "w-40"]}
      />
      <SettingsCardSkeleton
        fields={4}
        title="AI / LLM"
        widths={["w-32", "w-28", "w-24", "w-40"]}
      />
      <SettingsCardSkeleton
        fields={4}
        title="Environment & secrets"
        widths={["w-20", "w-20", "w-16", "w-16"]}
      />
    </div>
  );
}

function SettingsCardSkeleton({
  fieldClassName,
  fields,
  gridClassName,
  title,
  variant = "input",
  widths,
}: {
  fieldClassName?: string;
  fields: number;
  gridClassName?: string;
  title: string;
  variant?: "input" | "slider";
  widths: string[];
}) {
  return (
    <section className="rounded-md border border-slate-800 bg-[#11161d]">
      <div className="flex items-center gap-3 border-b border-slate-800 px-5 py-4">
        <SkeletonLine className="h-9 w-9" />
        <div>
          <h2 className="text-base font-semibold text-slate-100">{title}</h2>
          <SkeletonLine className="mt-2 h-3 w-48 max-w-full" />
        </div>
      </div>
      <div className={cn("grid gap-4 p-5", gridClassName)}>
        {Array.from({ length: fields }, (_, index) => (
          <div
            className={cn(
              "grid gap-2",
              variant === "slider" && "lg:w-1/2",
              fieldClassName,
            )}
            key={index}
          >
            <SkeletonLine className={cn("h-4", widths[index] ?? "w-48")} />
            {variant === "slider" ? (
              <>
                <SkeletonLine className="h-2 w-full bg-slate-800" />
                <div className="flex justify-between">
                  <SkeletonLine className="h-3 w-6" />
                  <SkeletonLine className="h-3 w-16" />
                  <SkeletonLine className="h-3 w-6" />
                </div>
              </>
            ) : (
              <SkeletonLine className="h-10 w-full border border-slate-700 bg-[#0f151d]" />
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-end border-t border-slate-800 px-5 py-4">
        <SkeletonLine className="h-10 w-40" />
      </div>
    </section>
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
