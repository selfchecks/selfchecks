import { Fragment } from "react";
import { ArrowLeft, ExternalLink, FlaskConical, Link2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppSidebar } from "@/components/app-sidebar";
import { getTestSessionData, type TestSessionCheckRow } from "@/lib/dashboard-data";
import { getDashboardAccountLabel } from "@/lib/settings-data";
import { formatTestSessionSource } from "@/lib/test-session-source";

import { RunStateBadge, SummaryPills } from "../test-session-components";
import { SessionActions } from "./session-actions";
import { SessionCheckActions } from "./session-check-actions";

export const dynamic = "force-dynamic";

type TestSessionPageProps = {
  params: Promise<{
    sessionId: string;
  }>;
};

export default async function TestSessionPage({ params }: TestSessionPageProps) {
  const { sessionId } = await params;
  const data = await getTestSessionData(sessionId);

  if (!data) {
    notFound();
  }

  const accountLabel = getDashboardAccountLabel();
  const { session } = data;
  const sourceFields = formatTestSessionSource({
    commitSha: session.commitSha,
    jobUrl: session.jobUrl,
    pipelineUrl: session.pipelineUrl,
    ref: session.ref,
    repository: session.repository,
    source: session.source,
  });

  return (
    <main className="min-h-screen bg-[#0d1117] text-slate-200">
      <AppSidebar
        accountLabel={accountLabel}
        activeItem="test-sessions"
        projectSlug={data.projectSlug}
      />

      <div className="min-h-screen xl:pl-72">
        <header className="sticky top-0 z-30 border-b border-slate-800 bg-[#12171f]/95 backdrop-blur">
          <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3 text-sm text-slate-400">
              <Link
                aria-label="Back to test sessions"
                className="flex h-9 w-9 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                href="/test-sessions"
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <span className="hidden truncate sm:inline">{accountLabel}</span>
              <span className="text-slate-600">/</span>
              <Link
                className="inline-flex min-w-0 items-center gap-2 truncate text-slate-300 hover:text-slate-100"
                href="/test-sessions"
              >
                <FlaskConical className="h-4 w-4 shrink-0" />
                Test sessions
              </Link>
              <span className="text-slate-600">/</span>
              <span className="truncate text-slate-200">
                {session.name || session.createdAtLabel}
              </span>
            </div>
            <div
              className="flex shrink-0 items-center gap-2"
              data-appnotes-actions=""
            />
          </div>
        </header>

        <section className="mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="truncate text-3xl font-semibold text-slate-100">
                {session.name || "Test session"}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                <RunStateBadge runState={session.runState} status={session.status} />
                <span>{session.createdAtLabel}</span>
                <span>Duration {session.duration}</span>
              </div>
            </div>
            <div className="flex min-w-0 max-w-full flex-col items-end gap-3">
              <SessionActions
                attemptCount={session.checks.reduce(
                  (total, check) => total + check.runCount,
                  0,
                )}
                failedCount={session.summary.failed}
                runState={session.runState}
                sessionId={session.id}
              />
              <div className="min-w-0 text-right text-sm text-slate-400">
                <div>Project {data.projectSlug}</div>
                <div className="mt-1 max-w-xl truncate" title={session.id}>
                  {session.id}
                </div>
              </div>
            </div>
          </div>

          <section className="grid gap-4 rounded-md border border-slate-800 bg-[#111821] p-4 text-sm md:grid-cols-[7rem_minmax(0,1fr)]">
            <div className="text-slate-500">URL</div>
            <div className="min-w-0">
              {session.targetUrl ? (
                <a
                  className="inline-flex max-w-full items-center gap-2 truncate text-blue-300 hover:text-blue-200"
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
            </div>
            {sourceFields.map((field) => (
              <Fragment key={`${field.label}:${field.value}`}>
                <div className="text-slate-500">{field.label}</div>
                <div className="min-w-0">
                  {field.href ? (
                    <a
                      className="inline-flex max-w-full items-center gap-2 truncate text-blue-300 hover:text-blue-200"
                      href={field.href}
                      rel="noreferrer"
                      target="_blank"
                      title={field.value}
                    >
                      <ExternalLink className="h-4 w-4 shrink-0 text-slate-500" />
                      <span className="truncate">{field.value}</span>
                    </a>
                  ) : (
                    <span className="line-clamp-2 text-slate-300" title={field.value}>
                      {field.value}
                    </span>
                  )}
                </div>
              </Fragment>
            ))}
            <div className="text-slate-500">Path</div>
            <div
              className="min-w-0 break-all text-slate-300"
              title={session.workspacePath}
            >
              {session.workspacePath || <span className="text-slate-600">-</span>}
            </div>
            <div className="text-slate-500">Tests</div>
            <SummaryPills summary={session.summary} />
          </section>

          <SessionChecksTable checks={session.checks} sessionId={session.id} />
        </section>
      </div>
    </main>
  );
}

function SessionChecksTable({
  checks,
  sessionId,
}: {
  checks: TestSessionCheckRow[];
  sessionId: string;
}) {
  return (
    <section className="overflow-hidden rounded-md border border-slate-800 bg-[#111821]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1080px] text-left text-sm">
          <thead className="bg-[#121820] text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Test</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Target</th>
              <th className="px-4 py-3">Attempts</th>
              <th className="px-4 py-3">Duration</th>
              <th className="px-4 py-3" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {checks.length > 0 ? (
              checks.map((check) => (
                <SessionCheckTableRow
                  check={check}
                  key={check.checkId}
                  sessionId={sessionId}
                />
              ))
            ) : (
              <tr>
                <td className="px-4 py-8 text-center text-slate-500" colSpan={6}>
                  No tests were recorded in this session.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SessionCheckTableRow({
  check,
  sessionId,
}: {
  check: TestSessionCheckRow;
  sessionId: string;
}) {
  return (
    <tr className="border-t border-slate-800 align-top hover:bg-slate-900/40">
      <td className="px-4 py-3">
        <Link
          className="inline-flex max-w-72 flex-col text-blue-300 hover:text-blue-200"
          href={check.latestRunHref}
        >
          <span className="truncate font-medium">{check.checkName}</span>
          <span className="mt-1 truncate text-xs text-slate-500">
            {check.projectSlug} / {check.groupName} / {check.checkKey}
          </span>
        </Link>
      </td>
      <td className="px-4 py-3">
        <RunStateBadge
          isRegress={check.isRegress}
          runState={check.runState}
          status={check.status}
        />
      </td>
      <td className="max-w-[28rem] px-4 py-3">
        <span className="line-clamp-2 text-slate-300" title={check.target}>
          {check.target}
        </span>
      </td>
      <td className="px-4 py-3 text-slate-300">{check.runCount}</td>
      <td className="whitespace-nowrap px-4 py-3 text-slate-300">{check.duration}</td>
      <td className="px-4 py-3">
        <SessionCheckActions
          check={check}
          projectSlug={check.projectSlug}
          sessionId={sessionId}
        />
      </td>
    </tr>
  );
}
