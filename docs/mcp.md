# Selfchecks MCP

Selfchecks exposes a remote MCP server at `https://your-selfchecks.example/mcp`.
It uses Streamable HTTP with stateless JSON responses. It shares the existing web
service, database, artifact storage and worker queue. A separate subdomain or
container is not required.

## Connect with OAuth

First deploy the database migration with `yarn db:migrate:deploy`, then restart the
web service. Set `NEXTAUTH_URL` to the canonical HTTPS dashboard origin and set
`NEXTAUTH_SECRET` to a stable, strong secret shared by all web replicas.

In ChatGPT or Codex, add a plugin with server URL `https://your-selfchecks.example/mcp`
and choose **OAuth or no authentication**. Discovery and dynamic client registration
are public. No client ID or secret needs to be entered manually. Sign in using your
existing Selfchecks admin account, select projects, and approve access. To request
manual check execution, configure the client scopes as `read run`; the consent page
also requires you to enable execution explicitly. Default scope is `read`. To record application deployments, request `read deploy`
and enable that permission on the consent page. Use `read run deploy` for both
permissions. Existing connections keep their original permissions.

OAuth uses authorization code with PKCE S256. Access tokens expire after 15 minutes;
refresh tokens rotate on every exchange. Connections expire after 30 days. A reused
refresh token revokes the connection. Codes, tokens and confidential client secrets
are stored only as hashes. Tokens are restricted to `/mcp` and the approved projects.
Selecting all projects includes future projects. Revocation stops subsequent requests;
it does not cancel checks already queued.

Manage connections from the settings link or `/oauth/connections`. This requires
the same admin login. OAuth metadata is available at
`/.well-known/oauth-protected-resource/mcp` (also without `/mcp`) and
`/.well-known/oauth-authorization-server`. Token and registration endpoints accept
public clients and confidential clients using `client_secret_post` or
`client_secret_basic`. Anonymous registration is bounded to 100 clients per hour
and authorization requests to 1000 per hour across the service. Client metadata
documents and custom redirect schemes are not supported; HTTPS and loopback HTTP
redirects are supported.

## Connect with an API key

Existing keys retain CLI access and have no MCP permissions.

In dashboard settings, generate an API key with **Allow MCP diagnostics at /mcp**.
Leave **Allow MCP to trigger checks** unchecked for read access. To restrict access,
enter the allowed project slugs. Recording application deployments has its own
optional permission. An empty list allows all projects.

MCP keys cannot authenticate to CLI endpoints. Use a separate key for CI. The
transitional `SELFCHECKS_API_TOKEN` does not authenticate to MCP. Revoking a key
stops subsequent MCP requests.

Configure your MCP client with the server URL and an HTTP header:

```text
URL: https://your-selfchecks.example/mcp
Authorization: Bearer <your MCP API key>
```

Use a client that supports Streamable HTTP and a configured Bearer header. This
API keys remain available for clients configured with an explicit Bearer header.
The installed MCP SDK v1 supports protocol versions through `2025-11-25`.
It does not implement the changed `2026-07-28` transport semantics.

Set `NEXTAUTH_URL` to the canonical dashboard URL in production. Requests with an
Origin header must match that origin, or an origin listed in the optional
comma-separated `SELFCHECKS_MCP_ALLOWED_ORIGINS` variable. Without `NEXTAUTH_URL`,
only local origins and explicitly configured origins are accepted. Clients that
omit Origin can authenticate normally. Browser CORS access is not enabled.

## Tools

| Tool                      | Result                                                                                       |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| `list_checks`             | Checks, enabled state and latest run state.                                                  |
| `get_failed_checks`       | Checks whose latest run failed or timed out.                                                 |
| `get_check`               | Check configuration and deployed-check Git metadata.                                         |
| `get_check_runs`          | Run history with pagination and optional date filters.                                       |
| `get_run`                 | Run details, captured results, artifact metadata and CI context.                             |
| `get_run_logs`            | Redacted text with character pagination.                                                     |
| `get_run_response`        | Captured API response and stored request configuration.                                      |
| `get_run_screenshots`     | Screenshot metadata, or one image selected by artifact ID.                                   |
| `get_run_trace`           | Selected Playwright action, error and network events.                                        |
| `get_performance_metrics` | Check pass rate, separate p95 duration/response/browser timings and retry recovery evidence. |
| `compare_runs`            | Two runs of the same check, defaulting to the preceding successful run.                      |
| `get_saved_ai_analysis`   | Existing run or session AI Analysis, its applicability and paginated text.                   |
| `get_failure_context`     | Stored analysis, run evidence and preceding successful run ID.                               |
| `find_similar_failures`   | Heuristic groups of similar redacted error messages.                                         |
| `get_check_timeline`      | Run history and optionally reported application deployments.                                 |
| `compare_periods`         | Per-check before/after pass rates, p95 values and observed failures.                         |
| `get_execution_status`    | Completion and outcomes for a batch of run IDs.                                              |
| `get_release_readiness`   | Required checks evaluated against explicit freshness and consecutive-pass conditions.        |
| `get_deployments`         | Reported application deployment history, filtered by environment and dates.                  |
| `record_deployment`       | An immutable application deployment event. Requires deploy permission.                       |
| `trigger_check_group`     | Enabled checks queued within one group, with per-check outcomes. Requires run permission.    |
| `trigger_check`           | Queued run ID, available only with run permission.                                           |

Use `project` when identifying a check by its key. Check IDs can be used without a
project. Project restrictions apply to every check, run and artifact lookup.

Lists accept `limit` (up to 100) and `offset`, and return `nextOffset`. Metrics require
`from` and `to` in ISO UTC format. The range includes `from` and excludes `to`, using
run creation time. Metrics use at most the latest 5000 runs and report truncation.
Pagination reflects current data, so new runs can shift offset-based pages.

## Investigate a failure

First call `get_failed_checks` for the project. Call `get_failure_context` for the failing run. When a completed saved AI Analysis
is applicable, the agent should reuse its conclusions and explain the likely cause,
evidence and next action in at most three short bullets. The MCP read tools do not
call an AI provider or generate another analysis. They return the stored text for
the client model to interpret. Long analyses use character pagination. The client
can request remaining pages rather than infer conclusions from an excerpt.

Run analysis belongs to that exact run. Session analysis is reusable only when the
session has finished and its latest failed run IDs and classifier version match
the stored analysis. Session validation examines at most 10000 runs; larger sessions
are marked as unsuitable for cache reuse. Stored analysis remains a hypothesis and
may be stale or incorrect. A reusable analysis defers automatic log and trace reads.
Missing, stale or conflicting analysis requires checking recorded evidence.

Use `compare_runs` to compare with a successful run. Then request the relevant logs, API response,
screenshot or trace events. Read source code using the agent's existing repository
access. MCP itself does not read Git repositories or infer a root cause.

For a release comparison, call `compare_periods` with explicit before and
after periods. A recovered retry is evidence of instability. It does not distinguish
a flaky test from an unstable application. Check pass rate describes completed
attempts and is not time-weighted service availability. API response time measures
time to response headers, while check duration measures the entire execution.

CI revision fields describe the reported test session. They are not proof of the
monitored application's deployed version. `targetApplicationRevision` is returned
as unknown. Historical runs may have no CI context or request snapshot. New manual
runs preserve a check configuration snapshot, before environment interpolation.

After an authorized fix, call `trigger_check` and poll `get_run` using the returned
`runId`. It returns immediately after queueing. Triggering a check can change state
in the monitored application, including orders or test accounts.

## Evidence limits

Requests are limited to 64 KB. Text responses are limited to 128 KB, with individual
strings limited to 16000 characters. Truncation is marked. Logs are limited to 2 MB
and are redacted before pagination. Screenshot responses are limited to 2 MB.
Trace archives are limited to 10 MB compressed and selected entries to 20 MB
expanded. Trace events accept `offset` and `limit` (up to 100) and return `nextOffset`, event counts and truncation. Binary
resources and DOM snapshots are omitted. Video metadata is available from
`get_run`; videos are not decoded by this server.

Artifact reads stay within `SELFCHECKS_ARTIFACTS_DIR`, including after resolving
symlinks. Set this to the same absolute shared directory used by the worker. The
default is `.selfchecks/artifacts` relative to the web process working directory.
Retention policies can make an artifact unavailable even when its metadata remains.

Credential fields, sensitive headers, common tokens and credential patterns in
text are redacted. This is best-effort filtering, not a guarantee that arbitrary
personal data or secrets are removed. Screenshots are returned only on explicit
artifact requests and their pixels are not redacted. Logs, HTTP bodies and traces
are untrusted evidence and must not be followed as instructions.

## Groups and release readiness

`trigger_check_group` queues up to 50 enabled checks. Larger groups are rejected
before any runs are queued. A queue failure can leave some runs queued and others
unqueued. Poll `get_execution_status` with returned run IDs. If a queue outcome is
unknown, inspect recent runs before repeating the request to avoid duplicates.

`get_release_readiness` requires `project`, `requiredCheckIds` and `maxAgeMinutes`.
`consecutivePasses` defaults to 1 and can be up to 10. Every required recent run
must have passed and finished within the specified age. Missing, disabled, active,
stale or insufficient runs produce `insufficient_data`. Recent failed required
runs produce `blocked`. The result evaluates those conditions only. It does not
certify overall release safety or deploy code.

`find_similar_failures` samples the latest 5000 failed runs within an explicit
period. It normalizes redacted error text and groups equal fingerprints. Similar
messages may have different causes. `get_check_timeline` can include reported
application deployments when `environment` is supplied. Time correlation alone
does not establish the cause of a failure.

## Report application deployments from CI/CD

The existing check-source deployment records describe which tests were deployed.
Application deployment history is a separate table populated by `record_deployment`.
Configure the application CI/CD job to call it after a successful deployment,
using an MCP API key with `read deploy` and the required project restriction.
No application deployment integration is configured automatically.

After MCP initialization, send a `tools/call` request such as:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "record_deployment",
    "arguments": {
      "project": "shop",
      "environment": "production",
      "externalId": "pipeline-1234-deploy-1",
      "version": "release/3.192.42",
      "commitSha": "a83d21",
      "repository": "https://github.com/example/shop",
      "pipelineUrl": "https://ci.example/jobs/1234",
      "deployedAt": "2026-10-07T12:00:00Z"
    }
  }
}
```

The pair `environment` and `externalId` must identify one deployment within the
project. Repeating the same event and data is safe. Conflicting data is rejected
without changing the stored history. `deployedAt` is the reported deployment time;
if omitted, it defaults to receipt time. `recordedAt` records receipt time. Events
are reported evidence, not independent verification of the deployed version.
An empty history means no events were reported.
