import { ExternalLink, FlaskConical, Link2 } from "lucide-react";
import Link from "next/link";

import { AppSidebar } from "@/components/app-sidebar";
import { ServiceMark } from "@/components/service-mark";
import { getTestSessionsData, type TestSessionRow } from "@/lib/dashboard-data";
import { getDashboardSettingsData } from "@/lib/settings-data";

import { RunStateBadge, SummaryPills } from "./test-session-components";

export const dynamic = "force-dynamic";

export default async function TestSessionsPage() {
  const data = await getTestSessionsData("default");
  const settings = await getDashboardSettingsData(data.projectSlug);

  return (
    <main className="min-h-screen bg-[#0d1117] text-slate-200">
      <AppSidebar activeItem="test-sessions" />

      <div className="min-h-screen xl:pl-72">
        <header className="sticky top-0 z-30 border-b border-slate-800 bg-[#12171f]/95 backdrop-blur">
          <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3 text-sm text-slate-400">
              <ServiceMark className="h-9 w-9 shrink-0 rounded-md xl:hidden" />
              <span className="hidden truncate sm:inline">
                {settings.basic.login || "Admin"}
              </span>
              <span className="hidden text-slate-600 sm:inline">/</span>
              <span className="inline-flex min-w-0 items-center gap-2 truncate text-slate-200">
                <FlaskConical className="h-4 w-4 shrink-0" />
                Test sessions
              </span>
            </div>
            <div className="hidden text-sm text-slate-500 sm:block">
              Project {data.projectSlug}
            </div>
          </div>
        </header>

        <section className="mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
          <div>
            <h1 className="text-3xl font-semibold text-slate-100">Test sessions</h1>
            <p className="mt-1 text-sm text-slate-500">
              {data.sessions.length === 1
                ? "1 recorded test session"
                : `${data.sessions.length} recorded test sessions`}
            </p>
          </div>

          <TestSessionsTable sessions={data.sessions} />
        </section>
      </div>
    </main>
  );
}

function TestSessionsTable({ sessions }: { sessions: TestSessionRow[] }) {
  return (
    <section className="overflow-hidden rounded-md border border-slate-800 bg-[#111821]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1080px] text-left text-sm">
          <thead className="bg-[#121820] text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Session</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">URL</th>
              <th className="px-4 py-3">Tests</th>
              <th className="px-4 py-3">Duration</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {sessions.length > 0 ? (
              sessions.map((session) => (
                <TestSessionTableRow key={session.id} session={session} />
              ))
            ) : (
              <tr>
                <td className="px-4 py-8 text-center text-slate-500" colSpan={7}>
                  No test sessions recorded.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TestSessionTableRow({ session }: { session: TestSessionRow }) {
  return (
    <tr className="border-t border-slate-800 align-top hover:bg-slate-900/40">
      <td className="px-4 py-3">
        <Link
          className="inline-flex max-w-64 flex-col text-blue-300 hover:text-blue-200"
          href={session.href}
        >
          <span className="truncate font-medium">
            {session.name || session.createdAtLabel}
          </span>
          <span className="mt-1 truncate text-xs text-slate-500">{session.id}</span>
        </Link>
      </td>
      <td className="px-4 py-3">
        <RunStateBadge runState={session.runState} status={session.status} />
      </td>
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
      <td className="px-4 py-3">
        <SummaryPills summary={session.summary} />
      </td>
      <td className="px-4 py-3 text-slate-300">{session.duration}</td>
      <td className="px-4 py-3">
        <span className="line-clamp-2 max-w-72 text-slate-500">
          {session.source ?? "-"}
        </span>
      </td>
      <td className="px-4 py-3">
        <Link
          aria-label={`Open test session ${session.id}`}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-100"
          href={session.href}
          title="Open session"
        >
          <ExternalLink className="h-4 w-4" />
        </Link>
      </td>
    </tr>
  );
}
