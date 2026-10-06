# Selfchecks MCP

Selfchecks exposes a remote MCP server at `https://your-selfchecks.example/mcp`.
It uses Streamable HTTP with stateless JSON responses. It shares the existing web
service, database, artifact storage and worker queue. A separate subdomain or
container is not required.

## Enable access

First deploy the database migration with `yarn db:migrate:deploy`, then restart the
web service. Existing keys retain CLI access and have no MCP permissions.

In dashboard settings, generate an API key with **Allow MCP diagnostics at /mcp**.
Leave **Allow MCP to trigger checks** unchecked for read access. To restrict access,
enter the allowed project slugs. An empty list allows all projects.

MCP keys cannot authenticate to CLI endpoints. Use a separate key for CI. The
transitional `SELFCHECKS_API_TOKEN` does not authenticate to MCP. Revoking a key
stops subsequent MCP requests.

Configure your MCP client with the server URL and an HTTP header:

```text
URL: https://your-selfchecks.example/mcp
Authorization: Bearer <your MCP API key>
```

Use a client that supports Streamable HTTP and a configured Bearer header. This
implementation does not provide OAuth authorization or discovery endpoints.
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
| `trigger_check`           | Queued run ID, available only with run permission.                                           |

Use `project` when identifying a check by its key. Check IDs can be used without a
project. Project restrictions apply to every check, run and artifact lookup.

Lists accept `limit` (up to 100) and `offset`, and return `nextOffset`. Metrics require
`from` and `to` in ISO UTC format. The range includes `from` and excludes `to`, using
run creation time. Metrics use at most the latest 5000 runs and report truncation.
Pagination reflects current data, so new runs can shift offset-based pages.

## Investigate a failure

First call `get_failed_checks` for the project. Read the failing run with `get_run`
and compare it with `compare_runs`. Then request the relevant logs, API response,
screenshot or trace events. Read source code using the agent's existing repository
access. MCP itself does not read Git repositories or infer a root cause.

For a release comparison, call `get_performance_metrics` with explicit before and
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
