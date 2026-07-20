import { ChartNoAxesColumnIncreasing } from "lucide-react";
import Link from "next/link";
import { Suspense, type ReactNode, use } from "react";

import { AppSidebar } from "@/components/app-sidebar";
import { ServiceMark } from "@/components/service-mark";
import { getDashboardAccountLabel } from "@/lib/settings-data";
import { getUsageData } from "@/lib/usage-data";

import {
  ProjectUsageChart,
  TestResultsChart,
  TestSourcesChart,
  UsageChart,
} from "./usage-chart";
import {
  UsageChartSkeleton,
  UsageMetricsSkeleton,
  UsageReliabilitySkeleton,
} from "./usage-skeleton";

export const dynamic = "force-dynamic";

type UsageDataPromise = ReturnType<typeof getUsageData>;

export default function UsagePage() {
  const dataPromise = getUsageData("default");
  const accountLabel = getDashboardAccountLabel();

  return (
    <main className="min-h-screen bg-[#0d1117] text-slate-200">
      <AppSidebar accountLabel={accountLabel} activeItem="usage" projectSlug="all" />

      <div className="min-h-screen xl:pl-72">
        <header className="sticky top-0 z-30 border-b border-slate-800 bg-[#12171f]/95 backdrop-blur">
          <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3 text-sm text-slate-400">
              <ServiceMark className="h-9 w-9 shrink-0 rounded-md xl:hidden" />
              <span className="hidden truncate sm:inline">{accountLabel}</span>
              <span className="hidden text-slate-600 sm:inline">/</span>
              <span className="inline-flex min-w-0 items-center gap-2 truncate text-slate-200">
                <ChartNoAxesColumnIncreasing className="h-4 w-4 shrink-0" />
                Usage
              </span>
            </div>
          </div>
        </header>

        <section className="mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
          <div>
            <h1 className="text-3xl font-semibold text-slate-100">Usage</h1>
            <p className="mt-1 text-sm text-slate-500">
              Completed tests over the last 30 days
            </p>
          </div>

          <Suspense fallback={<UsageMetricsSkeleton />}>
            <UsageMetricsBlock dataPromise={dataPromise} />
          </Suspense>
          <Suspense fallback={<UsageChartSkeleton label="tests by day" />}>
            <UsageByDayBlock dataPromise={dataPromise} />
          </Suspense>
          <Suspense fallback={<UsageChartSkeleton label="test sources" />}>
            <UsageSourcesBlock dataPromise={dataPromise} />
          </Suspense>
          <Suspense fallback={<UsageChartSkeleton label="results by day" />}>
            <UsageResultsBlock dataPromise={dataPromise} />
          </Suspense>
          <Suspense fallback={<UsageChartSkeleton label="tests by project" />}>
            <UsageProjectsBlock dataPromise={dataPromise} />
          </Suspense>
          <Suspense fallback={<UsageReliabilitySkeleton />}>
            <UsageReliabilityBlock dataPromise={dataPromise} />
          </Suspense>
        </section>
      </div>
    </main>
  );
}

function UsageMetricsBlock({ dataPromise }: { dataPromise: UsageDataPromise }) {
  const data = use(dataPromise);

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <MetricCard label="All completed tests" value={data.totals.total} />
      <MetricCard accent="bg-sky-400" label="API tests" value={data.totals.api} />
      <MetricCard
        accent="bg-violet-400"
        label="Browser tests"
        value={data.totals.browser}
      />
    </div>
  );
}

function UsageByDayBlock({ dataPromise }: { dataPromise: UsageDataPromise }) {
  const data = use(dataPromise);

  return (
    <UsageChartCard
      description="Each completed test is counted on the day it finished."
      legend={
        <>
          <Legend color="bg-sky-400" label="API" />
          <Legend color="bg-violet-400" label="Browser" />
        </>
      }
      title="Tests by day"
    >
      <UsageChart days={data.days} />
    </UsageChartCard>
  );
}

function UsageSourcesBlock({ dataPromise }: { dataPromise: UsageDataPromise }) {
  const data = use(dataPromise);

  return (
    <UsageChartCard
      description="Scheduled dashboard checks compared with tests run in test sessions."
      legend={
        <>
          <Legend color="bg-emerald-400" label="Scheduled" />
          <Legend color="bg-amber-400" label="Test sessions" />
        </>
      }
      title="Where tests come from"
    >
      <TestSourcesChart days={data.days} />
    </UsageChartCard>
  );
}

function UsageResultsBlock({ dataPromise }: { dataPromise: UsageDataPromise }) {
  const data = use(dataPromise);

  return (
    <UsageChartCard
      description="Failed includes failed, timed out and cancelled tests."
      legend={
        <>
          <Legend color="bg-emerald-400" label="Passed" />
          <Legend color="bg-red-400" label="Failed" />
        </>
      }
      title="Results by day"
    >
      <TestResultsChart days={data.days} />
    </UsageChartCard>
  );
}

function UsageProjectsBlock({ dataPromise }: { dataPromise: UsageDataPromise }) {
  const data = use(dataPromise);

  return (
    <UsageChartCard
      description="Daily completed tests split across all projects."
      legend={(data.projects ?? []).map((project) => (
        <span className="inline-flex items-center gap-1.5" key={project.id}>
          <span
            className="h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: project.color }}
          />
          {project.name}
        </span>
      ))}
      title="Completed tests by project"
    >
      <ProjectUsageChart days={data.days} projects={data.projects ?? []} />
    </UsageChartCard>
  );
}

function UsageReliabilityBlock({ dataPromise }: { dataPromise: UsageDataPromise }) {
  const data = use(dataPromise);

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-slate-100">Test reliability</h2>
        <p className="mt-1 text-sm text-slate-500">
          Success rate and the checks contributing most to failures.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <SuccessRateCard
          failed={data.totals.failed}
          passed={data.totals.passed}
          rate={data.totals.successRate}
        />
        <UnstableTests tests={data.unstableTests} />
      </div>
    </section>
  );
}

function UsageChartCard({
  children,
  description,
  legend,
  title,
}: {
  children: ReactNode;
  description: string;
  legend: ReactNode;
  title: string;
}) {
  return (
    <section className="rounded-md border border-slate-800 bg-[#111821] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-100">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
        <div className="flex max-w-3xl flex-wrap items-center justify-end gap-4 text-xs text-slate-400">
          {legend}
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function SuccessRateCard({
  failed,
  passed,
  rate,
}: {
  failed: number;
  passed: number;
  rate: number;
}) {
  const circumference = 2 * Math.PI * 42;
  const offset = circumference * (1 - rate / 100);

  return (
    <div className="rounded-md border border-slate-800 bg-[#111821] p-5">
      <h3 className="font-semibold text-slate-100">Overall success rate</h3>
      <div className="mt-5 flex items-center gap-5">
        <div className="relative h-28 w-28 shrink-0">
          <svg
            aria-label={`${rate}% success rate`}
            className="h-full w-full -rotate-90"
            role="img"
            viewBox="0 0 100 100"
          >
            <circle
              cx="50"
              cy="50"
              fill="none"
              r="42"
              stroke="#273244"
              strokeWidth="9"
            />
            <circle
              cx="50"
              cy="50"
              fill="none"
              r="42"
              stroke="#34d399"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
              strokeWidth="9"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-2xl font-semibold tabular-nums text-slate-100">
            {rate}%
          </span>
        </div>
        <div className="space-y-3 text-sm">
          <ResultCount color="bg-emerald-400" label="Passed" value={passed} />
          <ResultCount color="bg-red-400" label="Failed" value={failed} />
        </div>
      </div>
    </div>
  );
}

function ResultCount({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: number;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 text-slate-500">
        <span className={`h-2.5 w-2.5 rounded-sm ${color}`} />
        {label}
      </div>
      <div className="ml-[18px] mt-0.5 font-semibold tabular-nums text-slate-200">
        {value.toLocaleString("en")}
      </div>
    </div>
  );
}

function UnstableTests({
  tests,
}: {
  tests: Awaited<ReturnType<typeof getUsageData>>["unstableTests"];
}) {
  return (
    <div className="overflow-hidden rounded-md border border-slate-800 bg-[#111821]">
      <div className="border-b border-slate-800 px-5 py-4">
        <h3 className="font-semibold text-slate-100">Most unstable tests</h3>
        <p className="mt-1 text-sm text-slate-500">Ranked by failure rate.</p>
      </div>
      {tests.length > 0 ? (
        <div className="divide-y divide-slate-800">
          {tests.map((test, index) => (
            <div
              className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 px-5 py-3"
              key={`${test.checkId ?? test.name}-${test.type}`}
            >
              <span className="text-sm tabular-nums text-slate-600">{index + 1}</span>
              <div className="min-w-0">
                {test.checkId ? (
                  <Link
                    className="block truncate text-sm font-medium text-slate-200 hover:text-blue-300"
                    href={`/checks/${test.checkId}`}
                  >
                    {test.name}
                  </Link>
                ) : (
                  <div className="truncate text-sm font-medium text-slate-200">
                    {test.name}
                  </div>
                )}
                <div className="mt-1 text-xs uppercase text-slate-500">
                  {test.projectSlug} · {test.type} · {test.failed} failed of{" "}
                  {test.total}
                </div>
              </div>
              <span className="rounded-md bg-red-500/10 px-2 py-1 text-sm font-semibold tabular-nums text-red-300">
                {test.failureRate}%
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-5 py-10 text-center text-sm text-slate-500">
          No failed tests in this period.
        </div>
      )}
    </div>
  );
}

function MetricCard({
  accent = "bg-slate-400",
  label,
  value,
}: {
  accent?: string;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-md border border-slate-800 bg-[#111821] p-4">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <span className={`h-2 w-2 rounded-full ${accent}`} />
        {label}
      </div>
      <div className="mt-2 text-3xl font-semibold tabular-nums text-slate-100">
        {value.toLocaleString("en")}
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`h-2.5 w-2.5 rounded-sm ${color}`} />
      {label}
    </span>
  );
}
