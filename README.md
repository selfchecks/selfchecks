# Selfchecks

Selfchecks is a self-hosted synthetic monitoring service for browser and API checks.
Checks live with application code, run on your own worker, and keep logs, screenshots,
traces, videos, request/response data, and CI metadata in one dashboard.

Public documentation: [selfchecks.github.io](https://selfchecks.github.io/getting-started.html)

Questions and feedback: [Telegram](https://t.me/aleksnick)

## Product preview

![Selfchecks dashboard with check status, filters, availability, and recent results](docs/images/product-dashboard.webp)

![Selfchecks check details with run history, availability, and performance metrics](docs/images/product-check-detail.webp)

## Install

The constructs and CLI packages are published under the `@selfchecks` npm
organization. The starter generator is available as `create-selfchecks` so it can be
run directly with `npx`:

```bash
npx create-selfchecks my-checks

# Or install the packages manually
npm install --save-dev @selfchecks/selfchecks @selfchecks/selfchecks-cli @playwright/test
```

- `create-selfchecks` creates a minimal project and installs its dependencies.
- `@selfchecks/selfchecks-cli` provides the `selfchecks` command for remote
  `deploy`, `test`, and `trigger` operations.
- `@selfchecks/selfchecks` provides the supported checks-as-code constructs.

The npm CLI is the recommended CI client. The container images are still used to run
the Selfchecks server and worker, but projects do not need a Selfchecks Docker image
just to upload or trigger checks.

## Quick start

Generate a ready-to-run project containing one browser check for
`https://selfchecks.github.io/`:

```bash
npx create-selfchecks my-checks
cd my-checks
npx playwright install chromium
npm test
```

Without a directory argument, `npx create-selfchecks` creates
`./selfchecks-project`. Pass `--skip-install` when only the files are needed.

Set the URL and API token issued by your Selfchecks server:

```bash
export SELFCHECKS_URL=https://checks.example.com
export SELFCHECKS_API_TOKEN=replace-with-a-ci-secret
```

Create a browser check:

```ts
// checks/homepage.check.ts
import { BrowserCheck, Frequency } from "@selfchecks/selfchecks/constructs";

new BrowserCheck("homepage", {
  name: "Homepage",
  activated: true,
  accounts: ["free"],
  frequency: Frequency.EVERY_15M,
  tags: ["smoke", "browser"],
  code: {
    entrypoint: "homepage.spec.ts",
  },
});
```

`accounts` lists the logical account keys that the browser check needs together.

Or define an API check with a portable HTTP request and assertions:

```ts
import {
  ApiCheck,
  AssertionBuilder,
  Frequency,
} from "@selfchecks/selfchecks/constructs";

new ApiCheck("api-health", {
  frequency: Frequency.EVERY_5M,
  maxResponseTime: 2_000,
  request: {
    method: "GET",
    url: "{{API_URL}}/health",
    headers: { accept: "application/json" },
    queryParameters: { probe: "selfchecks" },
    assertions: [
      AssertionBuilder.statusCode().equals(200),
      AssertionBuilder.jsonBody("$.data.ok").equals(true),
      AssertionBuilder.headers("content-type").contains("application/json"),
    ],
  },
});
```

The entrypoint is a normal Playwright Test file:

```ts
// checks/homepage.spec.ts
import { expect, test } from "@playwright/test";

test("homepage is available", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("main")).toBeVisible();
});
```

Deploy and run it:

```bash
npx selfchecks deploy --project my-project --root .
npx selfchecks test --project my-project --root . --record \
  --tags smoke,browser -e ENVIRONMENT_URL=https://app.example.com
npx selfchecks trigger --project my-project --record
```

`deploy` and `test` upload a source bundle to the authenticated HTTP API. The bundle
excludes dependencies, local secrets, reports, and previous artifacts and is limited
to 10,000 files and 40 MB.

## Migrating from Checkly

Existing repositories do not have to rewrite every import. Install the Selfchecks
construct package under the local dependency name `checkly`:

```json
{
  "devDependencies": {
    "@selfchecks/selfchecks-cli": "latest",
    "checkly": "npm:@selfchecks/selfchecks@latest"
  },
  "scripts": {
    "selfchecks": "selfchecks"
  }
}
```

These imports then continue to work:

```ts
import { defineConfig } from "checkly";
import {
  ApiCheck,
  AssertionBuilder,
  BrowserCheck,
  CheckGroupV2,
  Frequency,
  RetryStrategyBuilder,
} from "checkly/constructs";
```

Compatibility is intentionally limited. `deploy` and `test` execute the project's
TypeScript manifests locally, compile supported constructs into a versioned
`DeploymentManifest`, and send that data to the server. Imports, helpers, loops, and
computed values therefore work without project-specific parsing.

| Area             | Supported subset                                                                                                                          |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| configuration    | `defineConfig`, `logicalId`, `projectName`, and shared `activated`, `frequency`, `tags`, retry, mute, and expected-failure check defaults |
| checks           | `ApiCheck`, `BrowserCheck`, `CheckGroup`, `CheckGroupV2`                                                                                  |
| frequency        | 1, 2, 5, 10, 15, and 30 minutes; 1, 2, 3, 6, 12, and 24 hours                                                                             |
| API requests     | method, URL, headers, query parameters, body, body type, Basic Auth, redirects, environment placeholders                                  |
| assertions       | status, response time, headers, text, and JSON body comparisons                                                                           |
| retries          | none, single, fixed, linear, and exponential strategies                                                                                   |
| notifications    | `WebhookAlertChannel` attached through a check group                                                                                      |
| TypeScript types | `ApiCheckProps`, `BrowserCheckProps`, `CheckGroupV2Props`, `Request`, `RetryStrategy`                                                     |

Unsupported properties fail compilation with their construct and property name; they
are not silently emulated. Private/public locations, Checkly runtimes, secrets,
environment-variable constructs, status pages, maintenance windows, alert escalation
policies, the Checkly REST API, and Checkly CLI commands are outside this profile.
`AlertEscalationBuilder` remains exported for source migration, but escalation
policies cannot be deployed. The old server-side static importer remains only as a
fallback for older clients.

## CI examples

GitLab:

```yaml
selfchecks:test:
  image: node:20.19
  before_script:
    - corepack enable
    - yarn install --immutable
  script:
    - yarn selfchecks test --project "$CI_PROJECT_PATH_SLUG" --root . --record \
      --repository "$CI_PROJECT_PATH" \
      --ref "$CI_COMMIT_REF_NAME" \
      --commit-sha "$CI_COMMIT_SHA" \
      --pipeline-url "$CI_PIPELINE_URL" \
      --job-url "$CI_JOB_URL"
```

GitHub Actions:

```yaml
name: Selfchecks

on:
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx selfchecks test --project "$GITHUB_REPOSITORY" --root . --record
        env:
          SELFCHECKS_URL: ${{ vars.SELFCHECKS_URL }}
          SELFCHECKS_API_TOKEN: ${{ secrets.SELFCHECKS_API_TOKEN }}
```

## Run your own server

Prerequisites are a Linux host with root or sudo access, `curl`, and inbound ports 80
and 443. The installer adds Docker Engine and the Compose plugin when they are missing.

```bash
curl -fsSL https://github.com/selfchecks/selfchecks/releases/download/bootstrap/bootstrap.sh | sudo bash
```

Every deploy publishes the installer together with a bootstrap archive containing the
production Compose file, templates, and installer source. The script prepares
`/opt/selfchecks`, generates secrets, starts PostgreSQL, Redis, the web app, worker,
and Caddy, and prints the first-run setup URL and token. Point DNS at the server, open
`/setup`, and enter the printed token.

Run the same command again to update the deployment files and container images. The
existing `.env` and runtime configuration are preserved.

For manual upgrades:

```bash
cd /opt/selfchecks
sudo docker compose --env-file .env -f docker-compose.prod.yml pull
sudo docker compose --env-file .env -f docker-compose.prod.yml up \
  --force-recreate --abort-on-container-exit --exit-code-from migrate migrate
sudo docker compose --env-file .env -f docker-compose.prod.yml up -d
```

## npm publishing

Deploys from `stable` increment the shared patch version for `@selfchecks/selfchecks`,
`@selfchecks/selfchecks-cli`, and `create-selfchecks`. The workflow commits the version
change back to `stable` through the write-enabled deploy key stored in
`RELEASE_DEPLOY_KEY`; the release commit includes `[skip ci]` to avoid starting another
deploy. Every downstream job checks out that release commit.

Publishing uses the `NPM_TOKEN` repository secret, public package access, and npm
provenance. The smoke job waits for the exact release version to become available,
generates a project through that version of `create-selfchecks`, and runs its typecheck
and browser test.

## Development

Requirements: Node.js 20+, Corepack, Docker, and Yarn 4.

```bash
corepack enable
yarn install
cp .env.example .env
yarn dev:infra
yarn db:migrate
yarn dev:web
```

Useful checks:

```bash
yarn format:check
yarn lint
yarn typecheck
yarn test
yarn build
```

Workspace layout:

- `apps/web` — dashboard and HTTP API;
- `apps/worker` — scheduler and check execution;
- `packages/cli` — internal server-side CLI and runner;
- `packages/npm-cli` — public remote-only npm CLI;
- `packages/checkly-compat` — public Checkly-compatible constructs;
- `packages/create-selfchecks` — public starter project generator;
- `packages/core` — manifest importer and shared domain types;
- `packages/db` — Prisma schema and database client.

## License

Selfchecks is licensed under the [Elastic License 2.0](LICENSE). You may use,
modify, and redistribute the software subject to its terms. The license does not
permit providing Selfchecks to third parties as a hosted or managed service that
exposes a substantial set of the software's features or functionality.
