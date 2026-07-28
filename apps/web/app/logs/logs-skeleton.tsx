import { ScrollText } from "lucide-react";

import { AppSidebar } from "@/components/app-sidebar";
import { ServiceMark } from "@/components/service-mark";

export function StatusLogsContentSkeleton() {
  return (
    <>
      <section
        aria-busy="true"
        aria-label="Loading status changes"
        className="overflow-hidden rounded-md border border-slate-800 bg-[#111821]"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-[#121820] text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Changed at</th>
                <th className="px-4 py-3">Status change</th>
                <th className="px-4 py-3">Check</th>
                <th className="px-4 py-3">Project</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3" aria-label="Actions" />
              </tr>
            </thead>
            <tbody className="animate-pulse">
              {Array.from({ length: 8 }, (_, index) => (
                <StatusLogRowSkeleton index={index} key={index} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div
        aria-hidden="true"
        className="flex animate-pulse flex-wrap items-center justify-between gap-3"
      >
        <SkeletonLine className="h-4 w-40" />
        <div className="flex items-center gap-2">
          <SkeletonLine className="h-9 w-20" />
          <SkeletonLine className="h-9 w-28" />
          <SkeletonLine className="h-9 w-16" />
        </div>
      </div>
    </>
  );
}

export function LogsPageSkeleton() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading logs"
      className="min-h-screen bg-[#0d1117] text-slate-200"
    >
      <AppSidebar activeItem="logs" projectSlug="all" />

      <div className="min-h-screen xl:pl-72">
        <header className="sticky top-0 z-30 border-b border-slate-800 bg-[#12171f]/95 backdrop-blur">
          <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3 text-sm text-slate-400">
              <ServiceMark className="h-9 w-9 shrink-0 rounded-md xl:hidden" />
              <SkeletonLine className="hidden h-4 w-24 sm:block" />
              <span className="hidden text-slate-600 sm:inline">/</span>
              <span className="inline-flex min-w-0 items-center gap-2 truncate text-slate-200">
                <ScrollText className="h-4 w-4 shrink-0" />
                Logs
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2" data-appnotes-actions="">
              <div className="hidden text-sm text-slate-500 sm:block">All projects</div>
            </div>
          </div>
        </header>

        <section className="mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
          <div>
            <h1 className="text-3xl font-semibold text-slate-100">Logs</h1>
            <p className="mt-1 text-sm text-slate-500">
              Test status changes from completed dashboard runs. Queued and running
              states are excluded.
            </p>
          </div>

          <StatusLogsContentSkeleton />
        </section>
      </div>
    </main>
  );
}

function StatusLogRowSkeleton({ index }: { index: number }) {
  return (
    <tr className="border-t border-slate-800">
      <td className="px-4 py-3">
        <SkeletonLine className="h-4 w-24" />
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <SkeletonLine className="h-8 w-20" />
          <SkeletonLine className="h-4 w-4" />
          <SkeletonLine className="h-8 w-20" />
        </div>
      </td>
      <td className="px-4 py-3">
        <SkeletonLine className={`h-4 ${index % 2 === 0 ? "w-44" : "w-56"}`} />
        <SkeletonLine className="mt-2 h-3 w-36" />
      </td>
      <td className="px-4 py-3">
        <SkeletonLine className="h-4 w-20" />
      </td>
      <td className="px-4 py-3">
        <SkeletonLine className="h-7 w-12" />
      </td>
      <td className="px-4 py-3">
        <SkeletonLine className="h-9 w-9" />
      </td>
    </tr>
  );
}

function SkeletonLine({ className }: { className: string }) {
  return <div className={`rounded bg-slate-800 ${className}`} />;
}
