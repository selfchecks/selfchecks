export const dashboardCopy = {
  actions: {
    refresh: "Refresh",
    runChecks: "Run checks",
  },
  basic: {
    deploy: "Import Checkly-style manifests from the configured repository tree.",
    description: "Initial commands for a fresh selfchecks installation.",
    migrate: "Create the PostgreSQL schema used by the dashboard and runner.",
    test: "Run a selected CI subset and persist report artifacts.",
    title: "Basic settings",
  },
  checks: {
    columns: {
      check: "Check",
      group: "Group",
      lastRun: "Last run",
      status: "Status",
    },
    emptyState: "Imported checks will appear here after the first deploy.",
    importHint: "No checks imported yet. Run selfchecks deploy to populate this list.",
    search: "Search checks",
    title: "Checks",
  },
  product: "selfchecks",
  runner: {
    containerIsolation:
      "Browser and API checks are planned to run in isolated containers, not in the web process.",
  },
  summary: {
    artifactsRetention: "Heavy artifacts kept for 14 days.",
    awaitingDeploy: "Awaiting first deploy",
    checks: "Checks",
    configureWebhook: "Generic webhook abstraction",
    noRuns: "No recorded runs",
    passRate: "Pass rate",
    retention: "Retention",
    webhooks: "Webhooks",
  },
  title: "Synthetic checks dashboard",
} as const;
