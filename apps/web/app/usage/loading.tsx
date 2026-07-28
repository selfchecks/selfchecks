import { ChartNoAxesColumnIncreasing } from "lucide-react";

import { AppSidebar } from "@/components/app-sidebar";
import { ServiceMark } from "@/components/service-mark";

import { UsageContentSkeleton } from "./usage-skeleton";

export default function UsageLoading() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading usage analytics"
      className="min-h-screen bg-[#0d1117] text-slate-200"
    >
      <AppSidebar activeItem="usage" projectSlug="all" />

      <div className="min-h-screen xl:pl-72">
        <header className="sticky top-0 z-30 border-b border-slate-800 bg-[#12171f]/95 backdrop-blur">
          <div className="flex h-16 items-center justify-between gap-4 px-4 text-sm text-slate-400 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <ServiceMark className="h-9 w-9 shrink-0 rounded-md xl:hidden" />
              <span className="inline-flex items-center gap-2 text-slate-200">
                <ChartNoAxesColumnIncreasing className="h-4 w-4" />
                Usage
              </span>
            </div>
            <div
              className="flex shrink-0 items-center gap-2"
              data-appnotes-actions=""
            />
          </div>
        </header>

        <section className="mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
          <UsageContentSkeleton />
        </section>
      </div>
    </main>
  );
}
