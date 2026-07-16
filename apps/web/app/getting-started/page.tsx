import {
  Blocks,
  BookOpenText,
  Box,
  Braces,
  CheckCircle2,
  Cloud,
  Code2,
  FileCode2,
  GitBranch,
  Github,
  Server,
  TerminalSquare,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { ServiceMark } from "@/components/service-mark";

import { apiManifest, checklyConfig, githubActions, gitlabCi } from "./examples";

const scaffoldCommand = `mkdir my-checks && cd my-checks
npm init -y
npm install @playwright/test@1.58.2 checkly@8.16.0
mkdir checks`;

const projectTree = `my-checks/
├── package.json
├── playwright.config.ts
├── checkly.config.ts
└── checks/
    ├── homepage.check.ts
    ├── homepage.spec.ts
    └── health.check.ts`;

const playwrightConfig = `import { defineConfig } from "@playwright/test";

export default defineConfig({
  timeout: 60_000,
  globalTimeout: 10 * 60_000,
  use: {
    baseURL: process.env.ENVIRONMENT_URL,
    screenshot: "only-on-failure",
  },
});`;

const browserManifest = `import { BrowserCheck, Frequency } from "checkly/constructs";

new BrowserCheck("homepage", {
  name: "Homepage",
  activated: true,
  tags: ["smoke", "browser"],
  frequency: Frequency.EVERY_10M,
  code: {
    entrypoint: "homepage.spec.ts",
  },
});`;

const browserTest = `import { expect, test } from "@playwright/test";

test("homepage is available", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/My product/i);
  await expect(page.getByRole("main")).toBeVisible();
});`;

const packageJson = `{
  "name": "my-checks",
  "private": true,
  "dependencies": {
    "@playwright/test": "^1.58.2",
    "checkly": "^8.16.0"
  }
}`;

const cliSetup = `export SELFCHECKS_URL="https://checks.example.com"
export SELFCHECKS_API_TOKEN="<api-token>"

# Run the CLI without installing a package on the host.
selfchecks() {
  docker run --rm --entrypoint selfchecks \\
    --env SELFCHECKS_URL \\
    --env SELFCHECKS_API_TOKEN \\
    --volume "$PWD:/workspace" \\
    --workdir /workspace \\
    ghcr.io/selfchecks/selfchecks-cli:stable "$@"
}

selfchecks --help`;

const cliCommands = `# Upload the project and make checks available to the scheduler
selfchecks deploy --project my-project --root .

# Run the uploaded source now and keep the results
selfchecks test --project my-project --root . --record \\
  -e ENVIRONMENT_URL=https://staging.example.com

# Run the latest deployed version
selfchecks trigger --project my-project --record`;

const httpApiRequest = `curl --fail-with-body --request POST \\
  "$SELFCHECKS_URL/api/cli/triggers" \\
  --header "Authorization: Bearer $SELFCHECKS_API_TOKEN" \\
  --header "Content-Type: application/json" \\
  --data '{
    "projectSlug": "my-project",
    "reporter": "list",
    "testSessionName": "Manual API run",
    "env": [
      { "name": "ENVIRONMENT_URL", "value": "https://staging.example.com" }
    ]
  }'`;

const httpApiResponse = `{
  "triggerId": "b472b7ce-…",
  "status": "queued",
  "statusUrl": "/api/cli/triggers/b472b7ce-…"
}`;

const httpApiStatus = `curl --fail-with-body \\
  --header "Authorization: Bearer $SELFCHECKS_API_TOKEN" \\
  "$SELFCHECKS_URL/api/cli/triggers/<trigger-id>"`;

const serverCommands = `git clone https://github.com/selfchecks/selfchecks.git
cd selfchecks
sudo bash scripts/install-selfchecks.sh --source-dir .

# The installer prints the setup URL and token. You can read it again with:
sudo grep '^SELFCHECKS_SETUP_TOKEN=' /opt/selfchecks/.env`;

export default function GettingStartedPage() {
  return (
    <main className="min-h-screen bg-[#0d1117] text-slate-200">
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-[#12171f]/95 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-[1480px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link className="flex min-w-0 items-center gap-3" href="/">
            <ServiceMark className="h-9 w-9 shrink-0 rounded-md" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-slate-100">
                SelfChecks
              </span>
              <span className="hidden truncate text-xs text-slate-500 sm:block">
                Self-hosted synthetic monitoring
              </span>
            </span>
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <span className="hidden items-center gap-2 text-slate-400 sm:inline-flex">
              <BookOpenText className="h-4 w-4 shrink-0" />
              Getting started
            </span>
            <Link
              className="rounded-md border border-slate-700 bg-slate-800/60 px-3 py-1.5 font-medium text-slate-200 hover:border-slate-600 hover:bg-slate-800"
              href="/"
            >
              Open dashboard
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-[1480px] gap-8 px-4 py-8 sm:px-6 lg:px-8 xl:grid-cols-[220px_minmax(0,1fr)] xl:gap-10">
        <GuideNavigation />

        <article className="min-w-0 max-w-5xl">
          <section className="overflow-hidden rounded-xl border border-slate-800 bg-gradient-to-br from-[#17212d] via-[#121923] to-[#10161e] p-6 sm:p-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-800/70 bg-emerald-950/40 px-3 py-1 text-xs font-semibold text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5" />
              From an empty folder to a scheduled check
            </div>
            <h1 className="mt-5 max-w-3xl text-3xl font-semibold tracking-tight text-slate-50 sm:text-5xl">
              Create your first SelfChecks project
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-400 sm:text-lg">
              Keep monitoring next to your application code, run the same tests in CI,
              and deploy them to your own SelfChecks server.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <FlowStep number="01" title="Create" text="Scaffold a Node.js project" />
              <FlowStep number="02" title="Configure" text="Set Playwright timeouts" />
              <FlowStep number="03" title="Test" text="Add API and browser checks" />
              <FlowStep number="04" title="Deploy" text="Upload to your server" />
            </div>
          </section>

          <GuideSection
            description="SelfChecks scans the project recursively for .check.ts manifests. Keep the Playwright specs and their manifests together so entrypoints remain easy to understand."
            icon={<FileCode2 className="h-5 w-5" />}
            id="project"
            label="Step 1"
            title="Create the project"
          >
            <CodeBlock code={scaffoldCommand} label="Terminal" />
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <CodeBlock code={projectTree} label="Project structure" />
              <div className="grid gap-4">
                <Note title="Prerequisites">
                  Use Node.js <code>20.19 or newer</code> and commit the generated
                  lockfile. Docker is required for the SelfChecks CLI image used later
                  in this guide.
                </Note>
                <Note title="What gets uploaded">
                  Source, configuration, lockfiles, and production dependencies are sent
                  to the server. <code>node_modules</code>, <code>.env*</code>, reports,
                  and previous artifacts are excluded. The bundle limit is 40 MB.
                </Note>
              </div>
            </div>
          </GuideSection>

          <GuideSection
            description="Playwright controls test behavior. The Checkly config defines project discovery and scheduling defaults using the current Checkly construct API, so the same files remain portable."
            icon={<Code2 className="h-5 w-5" />}
            id="configuration"
            label="Step 2"
            title="Add configuration"
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <CodeBlock code={playwrightConfig} label="playwright.config.ts" />
              <CodeBlock code={checklyConfig} label="checkly.config.ts" />
            </div>
            <Note className="mt-4" title="Runtime values">
              Do not commit secrets or environment-specific URLs. Pass them with
              <code> -e NAME=value</code> or <code>SELFCHECKS_ENV_JSON</code> when
              running a test session. API check URLs support placeholders such as
              <code>{"{{ENVIRONMENT_URL}}"}</code>.
            </Note>
          </GuideSection>

          <GuideSection
            description="A browser check is a small manifest pointing to a normal Playwright Test spec. SelfChecks runs it in Chromium and records logs, screenshots, traces, videos, and performance data when available."
            icon={<BookOpenText className="h-5 w-5" />}
            id="browser-tests"
            label="Step 3"
            title="Write a browser check"
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <CodeBlock code={browserManifest} label="checks/homepage.check.ts" />
              <CodeBlock code={browserTest} label="checks/homepage.spec.ts" />
            </div>
          </GuideSection>

          <GuideSection
            description="For a lightweight endpoint monitor, define the request directly in an ApiCheck manifest. SelfChecks uses the native Fetch API and interpolates runtime environment variables before sending it."
            icon={<Cloud className="h-5 w-5" />}
            id="api-tests"
            label="Test API"
            title="Choose the right API testing style"
          >
            <div className="overflow-x-auto rounded-lg border border-slate-800">
              <div className="grid min-w-[620px] grid-cols-[minmax(120px,0.7fr)_minmax(180px,1.3fr)_minmax(180px,1.4fr)] bg-slate-900/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <div className="p-3">Option</div>
                <div className="border-l border-slate-800 p-3">Use it for</div>
                <div className="border-l border-slate-800 p-3">Available API</div>
              </div>
              <ComparisonRow
                name="ApiCheck"
                use="Fast health and HTTP status checks"
                api="method, URL, headers, body, and {{ENV}} placeholders"
              />
              <ComparisonRow
                name="Playwright request"
                use="JSON assertions and multi-step API flows"
                api="test, expect, request fixture, hooks, and custom helpers"
              />
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <CodeBlock code={apiManifest} label="checks/health.check.ts" />
              <Note title="Current ApiCheck result model">
                Native API checks pass for an HTTP <code>2xx</code> response and fail
                for other statuses or network errors. AssertionBuilder data can be
                imported for compatibility, but it is not evaluated by the runner yet.
                Use Playwright&apos;s <code>request</code> fixture and
                <code>expect</code> when you need body, schema, or header assertions.
              </Note>
            </div>
          </GuideSection>

          <GuideSection
            description="Remote runs install only production dependencies from the uploaded package.json. This keeps the runtime reproducible and makes the module boundary explicit."
            icon={<Blocks className="h-5 w-5" />}
            id="modules"
            label="Dependencies"
            title="Modules you can use in tests"
          >
            <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="grid gap-3 sm:grid-cols-2">
                <ModuleCard
                  title="Playwright Test"
                  text="test, expect, page, context, request, fixtures, and hooks from @playwright/test."
                />
                <ModuleCard
                  title="Node.js built-ins"
                  text="Modules such as node:crypto, node:fs, node:path, node:url, and node:buffer."
                />
                <ModuleCard
                  title="Your local modules"
                  text="Relative TypeScript or JavaScript helpers included in the uploaded project."
                />
                <ModuleCard
                  title="npm packages"
                  text="Packages declared under dependencies, provided they support the server's Linux and Node.js runtime."
                />
              </div>
              <CodeBlock code={packageJson} label="package.json" />
            </div>
            <Note className="mt-4" title="Important">
              Put test runtime packages in <code>dependencies</code>, not only in
              <code>devDependencies</code>. The server runs
              <code> npm install --omit=dev</code> before executing an uploaded
              deployment or test session.
            </Note>
          </GuideSection>

          <GuideSection
            description="Use deploy for the version that scheduled checks should run. Use test for an isolated CI session built from the current source. Use trigger to execute the latest deployment."
            icon={<TerminalSquare className="h-5 w-5" />}
            id="deploy"
            label="Step 4"
            title="Deploy and run"
          >
            <CodeBlock code={cliSetup} label="Terminal · one-time CLI setup" />
            <Note className="mt-4" title="CLI container">
              The public multi-architecture CLI image contains the remote client but no
              browser runtime. It uploads source to your SelfChecks server, where
              browser and API checks execute. Pin a <code>sha-…</code> image tag in
              production if you require an immutable toolchain.
            </Note>
            <div className="mt-4">
              <CodeBlock code={cliCommands} label="Terminal or CI job" />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <CommandCard
                command="deploy"
                text="Upload, install, and schedule checks"
              />
              <CommandCard
                command="test"
                text="Run the current source in a test session"
              />
              <CommandCard command="trigger" text="Run the last deployed source now" />
            </div>
          </GuideSection>

          <GuideSection
            description="The CLI is a client for the authenticated HTTP API. You can call it directly from another service when you need to trigger a deployed project, inspect status, or build your own integration."
            icon={<Braces className="h-5 w-5" />}
            id="http-api"
            label="Integration"
            title="Use the HTTP API directly"
          >
            <div className="grid gap-4 2xl:grid-cols-[1.15fr_0.85fr]">
              <CodeBlock code={httpApiRequest} label="Trigger a deployed project" />
              <div className="grid gap-4">
                <CodeBlock code={httpApiResponse} label="202 Accepted" />
                <CodeBlock code={httpApiStatus} label="Poll the returned statusUrl" />
                <Note title="Authentication">
                  Send <code>Authorization: Bearer &lt;token&gt;</code> with every
                  request. The server accepts <code>SELFCHECKS_API_TOKEN</code> or an
                  API key created in Settings. Keep the token in a secret store, never
                  in repository files.
                </Note>
              </div>
            </div>

            <div className="mt-4 overflow-x-auto rounded-lg border border-slate-800">
              <div className="grid min-w-[760px] grid-cols-[90px_minmax(250px,1.2fr)_minmax(260px,1fr)] bg-slate-900/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <div className="p-3">Method</div>
                <div className="border-l border-slate-800 p-3">Endpoint</div>
                <div className="border-l border-slate-800 p-3">Purpose</div>
              </div>
              <ApiEndpointRow
                method="POST"
                path="/api/cli/deployments"
                purpose="Upload a multipart project bundle and queue a deployment"
              />
              <ApiEndpointRow
                method="GET"
                path="/api/cli/deployments/:deploymentId"
                purpose="Read deployment status and the completed import summary"
              />
              <ApiEndpointRow
                method="POST"
                path="/api/cli/test-sessions"
                purpose="Upload source and start a filtered, recorded test session"
              />
              <ApiEndpointRow
                method="GET · DELETE"
                path="/api/cli/test-sessions/:sessionId"
                purpose="Read results or cancel an active test session"
              />
              <ApiEndpointRow
                method="POST"
                path="/api/cli/triggers"
                purpose="Run the latest deployed source for a project"
              />
              <ApiEndpointRow
                method="GET"
                path="/api/cli/triggers/:triggerId"
                purpose="Read trigger status and the final run summary"
              />
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <Note title="Multipart upload contract">
                Deployment and test-session requests use{" "}
                <code>multipart/form-data</code>
                with JSON <code>metadata</code>, a JSON <code>manifest</code> array, and
                numbered <code>file-0</code>, <code>file-1</code> parts. Use the CLI
                unless you need to implement this bundle protocol yourself.
              </Note>
              <Note title="Status and errors">
                Successful create requests return <code>202</code>. Invalid input is
                <code>400</code>, missing or invalid credentials are <code>401</code>,
                missing resources are <code>404</code>, and an unavailable queue is
                <code>503</code>. A request that has no deployment or matching checks
                returns <code>422</code>. Error bodies use
                <code>{'{ "error": "…" }'}</code>.
              </Note>
            </div>
            <Note className="mt-4" title="Asynchronous responses">
              Create endpoints return <code>202</code> with a<code> statusUrl</code>.
              Poll that URL until the status is terminal:
              <code> completed</code>, <code>passed</code>, <code>failed</code>,
              <code> timed_out</code>, or <code>cancelled</code>. Deployment and
              test-session uploads use multipart bundles with limits of 10,000 files and
              40 MB. This is the SelfChecks API, not a full Checkly Cloud API
              implementation.
            </Note>
          </GuideSection>

          <GuideSection
            description="Run the current commit for merge requests and the default branch, then deploy the successful default-branch revision for scheduled monitoring."
            icon={<GitBranch className="h-5 w-5" />}
            id="gitlab-ci"
            label="CI/CD"
            title="Set up GitLab CI/CD"
          >
            <CodeBlock code={gitlabCi} label=".gitlab-ci.yml" />
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <ChecklistCard
                title="Settings → CI/CD → Variables"
                items={[
                  "SELFCHECKS_URL — the public dashboard URL",
                  "SELFCHECKS_API_TOKEN — masked secret variable",
                  "ENVIRONMENT_URL — the application URL to test",
                ]}
              />
              <Note title="Protected branches and forks">
                A protected variable is available only on protected refs. If merge
                request pipelines need the token, either protect their source refs or
                use rules that run SelfChecks only for trusted branches. Do not expose
                an unprotected token to pipelines from untrusted forks.
              </Note>
            </div>
          </GuideSection>

          <GuideSection
            description="The workflow runs checks for pull requests and main, then uploads the main revision only after the test job succeeds."
            icon={<Github className="h-5 w-5" />}
            id="github-ci"
            label="CI/CD"
            title="Set up GitHub Actions"
          >
            <CodeBlock code={githubActions} label=".github/workflows/selfchecks.yml" />
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <ChecklistCard
                title="Settings → Secrets and variables → Actions"
                items={[
                  "Variable SELFCHECKS_URL",
                  "Secret SELFCHECKS_API_TOKEN",
                  "Variable ENVIRONMENT_URL",
                  "Read access to the public SelfChecks container image",
                ]}
              />
              <Note title="Pull requests from forks">
                GitHub does not pass repository secrets to workflows opened from forks.
                Keep that default for safety. Run the job only after a trusted
                maintainer moves the commit to a branch with access to secrets, or use a
                separate restricted environment and token.
              </Note>
            </div>
            <Note className="mt-4" title="Default branch">
              This example uses <code>main</code>. If your repository uses another
              default branch, replace it in both the push filter and the deploy job
              condition.
            </Note>
          </GuideSection>

          <GuideSection
            description="SelfChecks ships as a Docker Compose stack with the web app, worker, PostgreSQL, Redis, migrations, and Caddy for HTTPS."
            icon={<Server className="h-5 w-5" />}
            id="server"
            label="Self-hosting"
            title="Deploy your own server"
          >
            <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
              <CodeBlock code={serverCommands} label="Linux server" />
              <div className="rounded-lg border border-slate-800 bg-[#111820] p-5">
                <h3 className="font-semibold text-slate-100">Before you start</h3>
                <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-400">
                  <Requirement>Linux with root or sudo access</Requirement>
                  <Requirement>A domain pointing to the server IP</Requirement>
                  <Requirement>Inbound ports 80 and 443 open</Requirement>
                  <Requirement>Enough capacity to run Chromium checks</Requirement>
                </ul>
              </div>
            </div>
            <div className="mt-4 rounded-lg border border-blue-900/70 bg-blue-950/20 p-5 text-sm leading-6 text-slate-300">
              Open <code>http://&lt;server-ip&gt;/setup</code>, enter the printed setup
              token, then configure the domain, certificate email, admin login, and
              password. After setup, Caddy reloads and requests the TLS certificate.
              Read <code>SELFCHECKS_API_TOKEN</code> from
              <code> /opt/selfchecks/.env</code> for CLI access.
            </div>
          </GuideSection>
        </article>
      </div>
    </main>
  );
}

function GuideNavigation() {
  const items = [
    ["project", "Create the project"],
    ["configuration", "Configuration"],
    ["browser-tests", "Browser tests"],
    ["api-tests", "API tests"],
    ["modules", "Test modules"],
    ["deploy", "Deploy and run"],
    ["http-api", "HTTP API"],
    ["gitlab-ci", "GitLab CI/CD"],
    ["github-ci", "GitHub CI/CD"],
    ["server", "Your own server"],
  ];

  return (
    <>
      <nav
        aria-label="Getting started sections"
        className="-mx-4 overflow-x-auto px-4 xl:hidden"
      >
        <ul className="flex w-max gap-2">
          {items.map(([id, label]) => (
            <li key={id}>
              <a
                className="block rounded-md border border-slate-800 bg-[#111820] px-3 py-2 text-sm text-slate-400 hover:border-blue-700 hover:text-slate-200"
                href={`#${id}`}
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <nav aria-label="Getting started sections" className="hidden xl:block">
        <div className="sticky top-24">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-600">
            On this page
          </div>
          <ul className="mt-4 space-y-1 border-l border-slate-800">
            {items.map(([id, label]) => (
              <li key={id}>
                <a
                  className="-ml-px block border-l border-transparent px-4 py-1.5 text-sm text-slate-500 hover:border-blue-500 hover:text-slate-200"
                  href={`#${id}`}
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </nav>
    </>
  );
}

function FlowStep({
  number,
  text,
  title,
}: {
  number: string;
  text: string;
  title: string;
}) {
  return (
    <div className="rounded-lg border border-slate-700/70 bg-slate-950/30 p-4">
      <div className="font-mono text-xs text-emerald-400">{number}</div>
      <div className="mt-2 font-semibold text-slate-100">{title}</div>
      <div className="mt-1 text-xs leading-5 text-slate-500">{text}</div>
    </div>
  );
}

function GuideSection({
  children,
  description,
  icon,
  id,
  label,
  title,
}: {
  children: ReactNode;
  description: string;
  icon: ReactNode;
  id: string;
  label: string;
  title: string;
}) {
  return (
    <section className="scroll-mt-24 border-b border-slate-800 py-12" id={id}>
      <div className="mb-6 flex items-start gap-4">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-800/60 text-blue-400">
          {icon}
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-blue-400">
            {label}
          </div>
          <h2 className="mt-1 text-2xl font-semibold text-slate-100 sm:text-3xl">
            {title}
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400 sm:text-base sm:leading-7">
            {description}
          </p>
        </div>
      </div>
      {children}
    </section>
  );
}

function CodeBlock({ code, label }: { code: string; label: string }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-slate-800 bg-[#090d12]">
      <div className="flex items-center gap-2 border-b border-slate-800 bg-[#111820] px-4 py-2.5 text-xs font-medium text-slate-500">
        <span className="h-2 w-2 rounded-full bg-slate-700" />
        {label}
      </div>
      <pre className="overflow-x-auto p-4 text-[13px] leading-6 text-slate-300">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function Note({
  children,
  className = "",
  title,
}: {
  children: ReactNode;
  className?: string;
  title: string;
}) {
  return (
    <div
      className={`rounded-lg border border-amber-900/60 bg-amber-950/15 p-5 text-sm leading-6 text-slate-400 ${className}`}
    >
      <div className="mb-2 font-semibold text-amber-300">{title}</div>
      <div className="[&_code]:rounded [&_code]:bg-slate-900 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-slate-300">
        {children}
      </div>
    </div>
  );
}

function ComparisonRow({ api, name, use }: { api: string; name: string; use: string }) {
  return (
    <div className="grid min-w-[620px] grid-cols-[minmax(120px,0.7fr)_minmax(180px,1.3fr)_minmax(180px,1.4fr)] border-t border-slate-800 text-sm leading-6">
      <div className="p-3 font-semibold text-slate-200">{name}</div>
      <div className="border-l border-slate-800 p-3 text-slate-400">{use}</div>
      <div className="border-l border-slate-800 p-3 text-slate-400">{api}</div>
    </div>
  );
}

function ModuleCard({ text, title }: { text: string; title: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-[#111820] p-4">
      <div className="flex items-center gap-2 font-semibold text-slate-200">
        <Box className="h-4 w-4 text-violet-400" />
        {title}
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-500">{text}</p>
    </div>
  );
}

function CommandCard({ command, text }: { command: string; text: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-[#111820] p-4">
      <code className="font-semibold text-emerald-300">selfchecks {command}</code>
      <p className="mt-2 text-xs leading-5 text-slate-500">{text}</p>
    </div>
  );
}

function ApiEndpointRow({
  method,
  path,
  purpose,
}: {
  method: string;
  path: string;
  purpose: string;
}) {
  return (
    <div className="grid min-w-[760px] grid-cols-[90px_minmax(250px,1.2fr)_minmax(260px,1fr)] border-t border-slate-800 text-sm leading-6">
      <div className="p-3 font-mono text-xs font-semibold text-emerald-300">
        {method}
      </div>
      <code className="border-l border-slate-800 p-3 text-slate-300">{path}</code>
      <div className="border-l border-slate-800 p-3 text-slate-400">{purpose}</div>
    </div>
  );
}

function ChecklistCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-[#111820] p-5">
      <h3 className="font-semibold text-slate-100">{title}</h3>
      <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-400">
        {items.map((item) => (
          <Requirement key={item}>{item}</Requirement>
        ))}
      </ul>
    </div>
  );
}

function Requirement({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-2">
      <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-400" />
      <span>{children}</span>
    </li>
  );
}
