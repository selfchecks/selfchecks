import {
  Activity,
  Bell,
  Container,
  Database,
  Play,
  RefreshCcw,
  Search,
  ShieldCheck,
  Terminal,
} from "lucide-react";

import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { dashboardCopy } from "@/lib/messages";

const summaryItems = [
  {
    icon: Activity,
    label: dashboardCopy.summary.checks,
    value: "0",
    detail: dashboardCopy.summary.awaitingDeploy,
  },
  {
    icon: ShieldCheck,
    label: dashboardCopy.summary.passRate,
    value: "-",
    detail: dashboardCopy.summary.noRuns,
  },
  {
    icon: Bell,
    label: dashboardCopy.summary.webhooks,
    value: "0",
    detail: dashboardCopy.summary.configureWebhook,
  },
  {
    icon: Database,
    label: dashboardCopy.summary.retention,
    value: "90d",
    detail: dashboardCopy.summary.artifactsRetention,
  },
];

const bootstrapRows = [
  {
    command: "yarn db:migrate",
    detail: dashboardCopy.bootstrap.migrate,
    status: "ready",
  },
  {
    command: "selfchecks deploy --force",
    detail: dashboardCopy.bootstrap.deploy,
    status: "pending",
  },
  {
    command: "selfchecks test --tags smoke --record",
    detail: dashboardCopy.bootstrap.test,
    status: "pending",
  },
];

export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-border pb-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-medium text-primary">{dashboardCopy.product}</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal text-foreground">
              {dashboardCopy.title}
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary">
              <RefreshCcw className="h-4 w-4" />
              {dashboardCopy.actions.refresh}
            </Button>
            <Button size="sm">
              <Play className="h-4 w-4" />
              {dashboardCopy.actions.runChecks}
            </Button>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {summaryItems.map((item) => {
            const Icon = item.icon;

            return (
              <div
                className="rounded-lg border border-border bg-card p-4 text-card-foreground"
                key={item.label}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-muted-foreground">
                    {item.label}
                  </span>
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <div className="mt-4 text-2xl font-semibold tracking-normal">
                  {item.value}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>
              </div>
            );
          })}
        </section>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 rounded-lg border border-border bg-card">
            <div className="flex flex-col gap-3 border-b border-border p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-base font-semibold tracking-normal">
                  {dashboardCopy.checks.title}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {dashboardCopy.checks.emptyState}
                </p>
              </div>
              <div className="relative w-full md:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  aria-label={dashboardCopy.checks.search}
                  className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder={dashboardCopy.checks.search}
                  type="search"
                />
              </div>
            </div>
            <div className="overflow-hidden">
              <table className="w-full table-fixed text-left text-sm">
                <thead className="border-b border-border text-muted-foreground">
                  <tr>
                    <th className="w-2/5 px-4 py-3 font-medium">
                      {dashboardCopy.checks.columns.check}
                    </th>
                    <th className="px-4 py-3 font-medium">
                      {dashboardCopy.checks.columns.group}
                    </th>
                    <th className="px-4 py-3 font-medium">
                      {dashboardCopy.checks.columns.status}
                    </th>
                    <th className="px-4 py-3 font-medium">
                      {dashboardCopy.checks.columns.lastRun}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-4 py-8 text-muted-foreground" colSpan={4}>
                      {dashboardCopy.checks.importHint}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <aside className="rounded-lg border border-border bg-card">
            <div className="border-b border-border p-4">
              <h2 className="text-base font-semibold tracking-normal">
                {dashboardCopy.bootstrap.title}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {dashboardCopy.bootstrap.description}
              </p>
            </div>
            <div className="divide-y divide-border">
              {bootstrapRows.map((row) => (
                <div className="flex gap-3 p-4" key={row.command}>
                  <Terminal className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <code className="truncate rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">
                        {row.command}
                      </code>
                      <StatusPill status={row.status} />
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{row.detail}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-border p-4">
              <div className="flex items-start gap-3 rounded-md border border-border bg-background p-3">
                <Container className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p className="text-sm text-muted-foreground">
                  {dashboardCopy.runner.containerIsolation}
                </p>
              </div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
