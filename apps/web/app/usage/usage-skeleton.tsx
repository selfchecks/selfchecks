export function UsageMetricsSkeleton() {
  return (
    <div aria-label="Loading usage totals" className="grid gap-4 sm:grid-cols-3">
      {Array.from({ length: 3 }, (_, index) => (
        <div
          className="animate-pulse rounded-md border border-slate-800 bg-[#111821] p-4"
          key={index}
        >
          <div className="h-4 w-32 rounded bg-slate-800" />
          <div className="mt-3 h-9 w-24 rounded bg-slate-800" />
        </div>
      ))}
    </div>
  );
}

export function UsageChartSkeleton({ label }: { label: string }) {
  return (
    <section
      aria-label={`Loading ${label}`}
      className="animate-pulse rounded-md border border-slate-800 bg-[#111821] p-4 sm:p-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="h-5 w-44 rounded bg-slate-800" />
          <div className="mt-2 h-4 w-72 max-w-full rounded bg-slate-800" />
        </div>
        <div className="hidden h-4 w-32 rounded bg-slate-800 sm:block" />
      </div>
      <div className="mt-6 flex h-56 items-end gap-2 border-b border-slate-800 px-4 pb-px">
        {Array.from({ length: 24 }, (_, index) => (
          <div className="flex min-w-0 flex-1 items-end gap-0.5" key={index}>
            <div
              className="w-1/2 rounded-t bg-slate-800"
              style={{ height: `${18 + ((index * 29) % 72)}%` }}
            />
            <div
              className="w-1/2 rounded-t bg-slate-800/70"
              style={{ height: `${12 + ((index * 17) % 58)}%` }}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

export function UsageReliabilitySkeleton() {
  return (
    <section aria-label="Loading test reliability" className="animate-pulse">
      <div className="mb-4">
        <div className="h-6 w-40 rounded bg-slate-800" />
        <div className="mt-2 h-4 w-80 max-w-full rounded bg-slate-800" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="h-48 rounded-md border border-slate-800 bg-[#111821] p-5">
          <div className="h-5 w-36 rounded bg-slate-800" />
          <div className="mt-5 h-28 w-28 rounded-full border-8 border-slate-800" />
        </div>
        <div className="h-64 rounded-md border border-slate-800 bg-[#111821] p-5">
          <div className="h-5 w-44 rounded bg-slate-800" />
          <div className="mt-5 space-y-3">
            {Array.from({ length: 4 }, (_, index) => (
              <div className="h-10 rounded bg-slate-800/80" key={index} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function UsageContentSkeleton() {
  return (
    <>
      <div>
        <h1 className="text-3xl font-semibold text-slate-100">Usage</h1>
        <p className="mt-1 text-sm text-slate-500">
          Completed tests over the last 30 days
        </p>
      </div>
      <UsageMetricsSkeleton />
      <UsageChartSkeleton label="tests by day" />
      <UsageChartSkeleton label="test sources" />
      <UsageChartSkeleton label="results by day" />
      <UsageChartSkeleton label="tests by project" />
      <UsageReliabilitySkeleton />
    </>
  );
}
