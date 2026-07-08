import { ArrowLeft, FlaskConical } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppSidebar } from "@/components/app-sidebar";
import {
  getTestSessionCheckData,
  type TestSessionCheckDetailData,
} from "@/lib/dashboard-data";
import { getDashboardSettingsData } from "@/lib/settings-data";

import { RunStateBadge, runStateLabels } from "../../../test-session-components";

export const dynamic = "force-dynamic";

type TestSessionCheckPageProps = {
  params: Promise<{
    checkId: string;
    sessionId: string;
  }>;
};

export default async function TestSessionCheckPage({
  params,
}: TestSessionCheckPageProps) {
  const { checkId, sessionId } = await params;
  const data = await getTestSessionCheckData(sessionId, checkId);

  if (!data) {
    notFound();
  }

  const settings = await getDashboardSettingsData(data.projectSlug);
  const sessionHref = `/test-sessions/${encodeURIComponent(data.session.id)}`;

  return (
    <main className="min-h-screen bg-[#0d1117] text-slate-200">
      <AppSidebar activeItem="test-sessions" />

      <div className="min-h-screen xl:pl-72">
        <header className="sticky top-0 z-30 border-b border-slate-800 bg-[#12171f]/95 backdrop-blur">
          <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3 text-sm text-slate-400">
              <Link
                aria-label="Back to test session"
                className="flex h-9 w-9 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                href={sessionHref}
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <span className="hidden truncate sm:inline">
                {settings.basic.login || "Admin"}
              </span>
              <span className="text-slate-600">/</span>
              <Link
                className="inline-flex min-w-0 items-center gap-2 truncate text-slate-300 hover:text-slate-100"
                href="/test-sessions"
              >
                <FlaskConical className="h-4 w-4 shrink-0" />
                Test sessions
              </Link>
              <span className="text-slate-600">/</span>
              <Link
                className="truncate text-slate-300 hover:text-slate-100"
                href={sessionHref}
              >
                {data.session.name || data.session.createdAtLabel}
              </Link>
              <span className="text-slate-600">/</span>
              <span className="truncate text-slate-200">{data.check.name}</span>
            </div>
          </div>
        </header>

        <section className="mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="mb-2 inline-flex rounded border border-slate-700 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-400">
                {data.check.type}
              </div>
              <h1 className="truncate text-3xl font-semibold text-slate-100">
                {data.check.name}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                <span>{data.groupName}</span>
                <span className="text-slate-700">/</span>
                <span>{data.check.key}</span>
                {data.check.tags.map((tag) => (
                  <span
                    className="rounded bg-slate-700 px-2 py-1 text-xs font-semibold text-slate-300"
                    key={tag}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            <div className="min-w-0 text-right text-sm text-slate-400">
              <div>Project {data.projectSlug}</div>
              <div className="mt-1">{data.session.createdAtLabel}</div>
            </div>
          </div>

          <section className="grid gap-4 rounded-md border border-slate-800 bg-[#111821] p-4 text-sm md:grid-cols-[7rem_minmax(0,1fr)]">
            <div className="text-slate-500">Target</div>
            <div className="min-w-0 truncate text-slate-200" title={data.check.target}>
              {data.check.target}
            </div>
            <div className="text-slate-500">Session</div>
            <Link
              className="min-w-0 truncate text-blue-300 hover:text-blue-200"
              href={sessionHref}
              title={data.session.id}
            >
              {data.session.name || data.session.id}
            </Link>
          </section>

          <SessionCheckRunsTable data={data} />
        </section>
      </div>
    </main>
  );
}

function SessionCheckRunsTable({ data }: { data: TestSessionCheckDetailData }) {
  return (
    <section className="overflow-hidden rounded-md border border-slate-800 bg-[#111821]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1040px] text-left text-sm">
          <thead className="bg-[#121820] text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Run</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Attempt</th>
              <th className="px-4 py-3">Duration</th>
              <th className="px-4 py-3">Error</th>
            </tr>
          </thead>
          <tbody>
            {data.runs.map((run) => (
              <tr
                className="border-t border-slate-800 align-top hover:bg-slate-900/40"
                key={run.id}
              >
                <td className="px-4 py-3">
                  <Link
                    className="inline-flex max-w-56 flex-col text-blue-300 hover:text-blue-200"
                    href={run.runHref}
                  >
                    <span className="truncate font-medium">{run.occurredAt}</span>
                    <span className="mt-1 truncate text-xs text-slate-500">
                      {run.id}
                    </span>
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <RunStateBadge runState={run.runState} status={run.status} />
                </td>
                <td className="px-4 py-3 text-slate-300">
                  #{run.attempt} of {run.maxAttempts}
                </td>
                <td className="px-4 py-3 text-slate-300">{run.duration}</td>
                <td className="max-w-[24rem] px-4 py-3 text-slate-500">
                  <span className="line-clamp-2">
                    {run.errorMessage ?? runStateLabels[run.runState]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
