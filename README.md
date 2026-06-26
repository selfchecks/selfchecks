# selfchecks

`selfchecks` is a self-hosted synthetic checks runner and dashboard for projects
that already describe monitoring as code. The first target is compatibility with
the current Checkly-style setup used in `config/checkly`: `.check.ts` manifests,
Playwright `.spec.ts` browser checks, API checks, tags, groups, schedules,
artifacts, and CI reports.

The goal is not to clone the whole Checkly product. The goal is to keep the
existing repository workflow familiar while replacing the cloud service with a
small self-hosted service that runs on our own server.

## Product Idea

The first version should provide:

- a thin CLI/shim with Checkly-like commands and flags;
- upload/deploy of fresh check definitions from CI/CD;
- local execution of checks on the same server;
- a React dashboard with authentication;
- check list, groups, status, and historical statistics;
- run details with logs, screenshots, traces, videos, and API request/response
  data;
- webhook-based notifications for failures and recoveries, with Rocket.Chat as
  the first concrete integration.

Explicitly out of scope for the first iteration:

- maintenance windows;
- public status pages and status page services;
- heartbeat checks;
- third-party integrations beyond generic webhooks and Rocket.Chat;
- distributed public/private locations;
- full Checkly Cloud API compatibility.

## Compatibility Strategy

Use source-level compatibility first, not full API emulation.

The CLI should accept the subset of commands already used in CI:

```bash
selfchecks deploy --force
selfchecks test --tags app,smoke,pr --tags transport,smoke,pr -e ENVIRONMENT_URL=... --reporter=github --record
selfchecks trigger --reporter=github --retries=1 --record --test-session-name="Deploy v1.2.3"
```

The CLI can also be exposed through a `checkly` alias later if we want smaller
CI diffs, but the implementation should stay ours.

The runner should understand the current Checkly construct style:

- `ApiCheck`
- `BrowserCheck`
- `CheckGroupV2`
- `Frequency`
- tags and grouped checks
- Playwright entrypoints
- API request assertions

The first parser can be intentionally narrow: support the constructs and helper
patterns already present in the account repository before expanding to more
Checkly features.

## Proposed Architecture

Use a small monorepo:

```text
apps/web        Next.js dashboard and API routes
apps/worker     check scheduler and executor
packages/cli    selfchecks CLI
packages/core   shared types, parser, result model
packages/db     Prisma schema and database client
```

Suggested stack:

- Runtime: Node.js 20+
- Package manager: Yarn 4 with `nodeLinker: node-modules` and no PnP
- Web: Next.js App Router + React
- Auth: NextAuth/Auth.js credentials provider with login/password first
- UI: shadcn/ui + Tailwind CSS + Radix primitives
- Tables: TanStack Table
- Charts: Recharts or Tremor-style charts built on top of Recharts
- Database: PostgreSQL
- Queue: BullMQ + Redis
- Artifacts: local filesystem first
- Browser runner: Playwright
- API runner: native `fetch`/Undici plus assertion engine
- Notifications: generic webhook abstraction, with Rocket.Chat as the first
  adapter

## UI Kit Recommendation

Use `shadcn/ui`.

Reasoning:

- it works well with Next.js and Tailwind;
- components are copied into the app, so we can own and tune the final design;
- Radix-based primitives give good accessibility foundations;
- dark mode is straightforward with `next-themes`;
- the dashboard needs dense operational UI, not a marketing look;
- it avoids the heavy visual opinion of Ant Design or MUI while still giving us
  buttons, dialogs, dropdowns, forms, tabs, tables, toasts, tooltips, and
  navigation primitives.

Default visual direction:

- dark-first operational dashboard;
- compact rows and filters;
- status colors: green, red, amber, neutral gray;
- no decorative landing page;
- primary screen is the check list and health summary.

## Data Model Draft

Core entities:

- `Project`
- `Deployment`
- `CheckGroup`
- `Check`
- `CheckRun`
- `TestSession`
- `Artifact`
- `Notification`
- `RuntimeEnvironment`
- `Secret`

Useful derived metrics:

- latest status;
- pass percentage for selected period;
- average duration;
- p95 duration;
- failure streak;
- last failure reason;
- last successful run;
- degraded runs by response time threshold;
- run sparkline for dashboard rows.

## MVP Development Plan

### Phase 0: Foundation

- Create the monorepo structure.
- Configure Yarn 4 without PnP and base TypeScript config.
- Add linting, formatting, and test setup.
- Add Docker Compose for Postgres and optional Redis.
- Define database schema and migrations.

### Phase 1: CLI and Manifest Import

- Implement `selfchecks deploy`.
- Load a `checkly.config.ts`-compatible config.
- Discover `.check.ts` files.
- Parse or execute supported check definitions in a controlled import context.
- Store projects, groups, checks, tags, frequency, type, entrypoints, and API
  request definitions.
- Generate a deploy summary and diff.

### Phase 2: Local Runner

- Implement `selfchecks test` for ad-hoc CI runs.
- Implement `selfchecks trigger` for deployed checks.
- Run API checks locally and store request/response/assertion data.
- Run Browser checks through Playwright and store trace, screenshots, video,
  stdout/stderr, and result JSON.
- Produce `checkly-github-report.md` compatible enough for existing GitLab
  scripts.

### Phase 3: Dashboard

- Add Next.js app shell and NextAuth.
- Build the checks list with status summary, filters, groups, tags, and search.
- Build check detail page with history and run list.
- Build run detail page with artifacts and logs.
- Add basic admin settings for projects, secrets, and webhook integrations.

### Phase 4: Scheduling and Notifications

- Add scheduler based on check frequency.
- Add run queue and concurrency limits.
- Send webhook notifications on failure and recovery.
- Add retention policy for artifacts and run history.

### Phase 5: Hardening

- Isolate execution per deployment.
- Add cleanup jobs for old workdirs and artifacts.
- Add secret masking in logs.
- Add basic RBAC if needed.
- Add backup/restore notes.
- Add upgrade/migration process.

## Project Decisions

1. Repository visibility: public GitHub repository under
   `selfchecks/selfchecks`.

2. Main branch name: `stable`.

3. Package manager: Yarn 4 with `nodeLinker: node-modules` and no PnP.

4. App framework: Next.js App Router.

5. Auth provider: NextAuth/Auth.js credentials provider with login/password
   first.

6. Database: PostgreSQL.

7. Queue: BullMQ + Redis for predictable background execution.

8. Artifact storage: local filesystem for MVP.

9. Runner isolation: run checks in a separate container.

10. CI command naming: use explicit `selfchecks ...` commands first.

11. Checkly construct compatibility target: support only the constructs and
    helper patterns used by the account repository in the first iteration.

12. API compatibility target: do not implement full Checkly API compatibility in
    MVP. Implement only our own API plus optional compatibility endpoints when a
    concrete client needs them.

13. Dashboard language: English UI labels first, with an i18n-ready structure so
    other languages can be added later.

14. Notification behavior: support a generic webhook abstraction. Rocket.Chat is
    a concrete webhook adapter, not the core notification contract.

15. Retention: keep run metadata for 90 days and heavy artifacts for 14 days.

16. Concurrency: one browser check at a time and several API checks in parallel.

17. Visual regression policy: keep Playwright snapshots compatible,
    generate/update baselines only in Linux runner environment.

18. Secrets model: store encrypted secrets in DB or read from server env in MVP,
    never commit real webhook URLs or account credentials.

## Development

Prerequisites:

- Node.js 20+
- Corepack enabled
- Docker or a compatible container runtime for PostgreSQL and Redis

Initial setup:

```bash
corepack enable
yarn install
cp .env.example .env
yarn dev:infra
yarn db:migrate
```

The dev Compose stack uses project-specific names and non-default host ports so
it does not collide with other local projects:

- containers: `selfchecks-dev-postgres`, `selfchecks-dev-redis`
- network: `selfchecks-dev-network`
- volumes: `selfchecks-dev-postgres-data`, `selfchecks-dev-redis-data`
- host ports: `15432` for PostgreSQL and `16379` for Redis

Production infrastructure uses a separate Compose file and separate resource
names. PostgreSQL and Redis are only exposed inside the Compose network by
default. The production stack also includes the web app, worker, migration job,
and Caddy reverse proxy:

```bash
cp .env.production.example .env.production
mkdir -p runtime
cp bootstrap/selfchecks.config.template.json runtime/selfchecks.config.json
cp bootstrap/Caddyfile.template runtime/Caddyfile
docker compose --env-file .env.production -f docker-compose.prod.yml pull
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
```

Production resource names:

- containers: `selfchecks-prod-web`, `selfchecks-prod-worker`,
  `selfchecks-prod-caddy`, `selfchecks-prod-postgres`, `selfchecks-prod-redis`
- network: `selfchecks-prod-network`
- volumes: `selfchecks-prod-postgres-data`, `selfchecks-prod-redis-data`

For a fresh server install, run:

```bash
yarn install:server
```

The installer prepares `/opt/selfchecks`, installs Docker and the Compose plugin
when missing, generates `.env` secrets, seeds `runtime/selfchecks.config.json`
and `runtime/Caddyfile`, then starts the production stack. Open
`http://<server-ip>/setup`, enter the setup token from `/opt/selfchecks/.env`,
then configure the domain, certificate email, admin login, and admin password.

After setup, Caddy reloads its generated config and requests a public TLS
certificate for the configured domain. DNS for that domain must already point to
the server, and ports `80` and `443` must be reachable from the internet.

## CI/CD

Pushes to `stable` run `.github/workflows/deploy.yml`. The workflow runs the
same repository checks as CI, builds `ghcr.io/selfchecks/selfchecks-web:stable`
and `ghcr.io/selfchecks/selfchecks-worker:stable`, then connects to the
production server over SSH, syncs deployment files, uploads `.env`, pulls the
fresh public GHCR images anonymously, and runs the production Compose stack.

Configure these GitHub Actions repository variables:

- `DEPLOY_HOST`: production server hostname or IP.
- `DEPLOY_USER`: SSH user for deployment.
- `DEPLOY_PATH`: install path on the server, for example `/opt/selfchecks`.
- `DEPLOY_PORT`: optional SSH port, defaults to `22`.
- `POSTGRES_DB`: optional database name, defaults to `selfchecks`.
- `POSTGRES_USER`: optional database user, defaults to `selfchecks`.
- `NEXTAUTH_URL`: public dashboard URL after DNS is ready.
- `SELFCHECKS_QUEUE_NAME`: optional queue name, defaults to `selfchecks-checks`.
- `SELFCHECKS_WEBHOOK_TIMEOUT_MS`: optional webhook timeout, defaults to `5000`.

Configure these GitHub Actions repository secrets:

- `DEPLOY_SSH_KEY`: private SSH key accepted by the production server.
- `DEPLOY_KNOWN_HOSTS`: optional pinned `known_hosts` entry. If omitted, the
  workflow uses `ssh-keyscan`.
- `POSTGRES_PASSWORD`: PostgreSQL password used by the Compose stack.
- `DATABASE_URL`: PostgreSQL URL for app and migrations.
- `NEXTAUTH_SECRET`: session secret.
- `SELFCHECKS_ADMIN_LOGIN` and `SELFCHECKS_ADMIN_PASSWORD`: optional initial
  admin credentials.
- `SELFCHECKS_SETUP_TOKEN`: optional first-launch setup token override. If
  omitted, deploy preserves the current server token or generates one on first
  deploy.

The GHCR packages are intended to be public. If GitHub creates the first package
as private, switch `selfchecks-web` and `selfchecks-worker` to public in the
organization package settings. The deploy workflow still logs in with the
short-lived workflow `GITHUB_TOKEN` before pulling images, so deploys can proceed
while visibility is being corrected.

Useful commands:

```bash
yarn dev:infra
yarn dev:infra:down
yarn dev:web
yarn dev:worker
yarn workspace @selfchecks/cli dev --help
yarn workspace @selfchecks/cli dev deploy --dry-run --root .
yarn checks:deploy:account
yarn checks:test:account
yarn checks:test:account:signin
yarn typecheck
yarn lint
yarn test
```

Local end-to-end smoke flow with the current account checks:

```bash
yarn dev:infra
yarn db:migrate
yarn checks:deploy:account
yarn checks:test:account
yarn checks:test:account:signin
yarn dev:web
```

Open `http://localhost:3000`, sign in with the local admin credentials from
`.env`, and the dashboard will read imported checks and recorded runs from the
local database. Imported checks without a run are shown as degraded until they
are executed.

Workspace layout:

- `apps/web`: Next.js dashboard, shadcn/ui component setup, and credentials auth.
- `apps/worker`: BullMQ worker entrypoint for queued check execution.
- `packages/cli`: `selfchecks` command parser for deploy, test, and trigger.
- `packages/core`: shared domain types, validation, and the first narrow
  Checkly-style manifest importer.
- `packages/db`: Prisma schema and database client.

## First Implementation Slice

The smallest useful milestone:

- `selfchecks deploy` imports the existing account `config/checkly` tree.
- Dashboard lists imported checks grouped like Checkly.
- `selfchecks test --tags ... --record --reporter=github` runs a small selected
  subset and writes a GitHub/GitLab-compatible Markdown report.
- Failed browser run exposes trace, screenshot, and console/log output in the UI.
- A configured webhook integration receives one failure notification with a link
  to the run page.
