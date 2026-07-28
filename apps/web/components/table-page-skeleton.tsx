import type { LucideIcon } from "lucide-react";

import { AppSidebar, type AppSidebarItem } from "@/components/app-sidebar";
import { ServiceMark } from "@/components/service-mark";
import { cn } from "@/lib/utils";

type TablePageSkeletonProps = {
  activeItem: AppSidebarItem;
  ariaLabel: string;
  columns: string[];
  description?: string;
  filters?: number;
  icon: LucideIcon;
  projectSlug?: string;
  rows?: number;
  title: string;
};

export function TablePageSkeleton({
  activeItem,
  ariaLabel,
  columns,
  description,
  filters = 0,
  icon: Icon,
  projectSlug = "all",
  rows = 6,
  title,
}: TablePageSkeletonProps) {
  return (
    <main
      aria-busy="true"
      aria-label={ariaLabel}
      className="min-h-screen bg-[#0d1117] text-slate-200"
    >
      <AppSidebar activeItem={activeItem} projectSlug={projectSlug} />

      <div className="min-h-screen xl:pl-72">
        <header className="sticky top-0 z-30 border-b border-slate-800 bg-[#12171f]/95 backdrop-blur">
          <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3 text-sm text-slate-400">
              <ServiceMark className="h-9 w-9 shrink-0 rounded-md xl:hidden" />
              <SkeletonLine className="hidden h-4 w-24 sm:block" />
              <span className="hidden text-slate-600 sm:inline">/</span>
              <span className="inline-flex min-w-0 items-center gap-2 truncate text-slate-200">
                <Icon className="h-4 w-4 shrink-0" />
                {title}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2" data-appnotes-actions="">
              <div className="hidden text-sm text-slate-500 sm:block">All projects</div>
            </div>
          </div>
        </header>

        <section className="mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
          <TablePageContentSkeleton
            ariaLabel={`${ariaLabel} content`}
            columns={columns}
            description={description}
            filters={filters}
            rows={rows}
            title={title}
          />
        </section>
      </div>
    </main>
  );
}

export function TablePageContentSkeleton({
  ariaLabel,
  columns,
  description,
  filters = 0,
  rows = 6,
  title,
}: Pick<
  TablePageSkeletonProps,
  "ariaLabel" | "columns" | "description" | "filters" | "rows" | "title"
>) {
  return (
    <div aria-busy="true" aria-label={ariaLabel} className="contents">
      <div>
        <h1 className="text-3xl font-semibold text-slate-100">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        ) : (
          <SkeletonLine className="mt-2 h-4 w-40" />
        )}
      </div>

      {filters > 0 ? (
        <section className="grid animate-pulse gap-3 rounded-md border border-slate-800 bg-[#111821] p-4 lg:grid-flow-col lg:grid-cols-none">
          {Array.from({ length: filters }, (_, index) => (
            <SkeletonLine
              className={cn("h-10 w-full", index === 0 ? "lg:min-w-64" : "")}
              key={index}
            />
          ))}
        </section>
      ) : (
        <section className="grid animate-pulse gap-3 rounded-md border border-slate-800 bg-[#111821] p-4 md:grid-cols-[8rem_minmax(0,1fr)]">
          {Array.from({ length: 4 }, (_, index) => (
            <div className="contents" key={index}>
              <SkeletonLine className="h-4 w-20" />
              <SkeletonLine className="h-4 w-full max-w-xl" />
            </div>
          ))}
        </section>
      )}

      <section className="overflow-hidden rounded-md border border-slate-800 bg-[#111821]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-[#121820] text-xs font-semibold uppercase text-slate-500">
              <tr>
                {columns.map((column) => (
                  <th className="px-4 py-3" key={column}>
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="animate-pulse">
              {Array.from({ length: rows }, (_, rowIndex) => (
                <tr className="border-t border-slate-800" key={rowIndex}>
                  {columns.map((column, columnIndex) => (
                    <td className="px-4 py-4" key={column}>
                      <SkeletonLine
                        className={cn(
                          "h-4",
                          columnIndex === 0
                            ? rowIndex % 2 === 0
                              ? "w-44"
                              : "w-56"
                            : columnIndex % 3 === 0
                              ? "w-12"
                              : "w-20",
                        )}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div aria-hidden="true" className="flex animate-pulse justify-between gap-3">
        <SkeletonLine className="h-4 w-40" />
        <SkeletonLine className="h-9 w-44" />
      </div>
    </div>
  );
}

function SkeletonLine({ className }: { className: string }) {
  return <div className={cn("rounded bg-slate-800", className)} />;
}
