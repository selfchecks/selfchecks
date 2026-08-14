# @selfchecks/selfchecks-cli

Command-line client for deploying and running checks against a
[Selfchecks](https://selfchecks.github.io/) server.

## Installation

```bash
npm install --save-dev @selfchecks/selfchecks-cli
```

The package installs the `selfchecks` executable. Node.js 20 or newer is required.

## Configuration

Set the URL and API token issued by your Selfchecks server:

```bash
export SELFCHECKS_URL=https://checks.example.com
export SELFCHECKS_API_TOKEN=replace-with-a-secret
```

Both values can also be passed with `--api-url` and `--api-token`.

## Commands

Deploy checks from the current repository:

```bash
npx selfchecks deploy --project my-project --root .
```

Before upload, the CLI executes supported TypeScript manifests and produces a
versioned deployment manifest. Project helpers, imports, loops, and computed check
definitions are supported; unsupported Checkly properties stop the command with an
explicit error.

Upload and run selected checks in an isolated test session:

```bash
npx selfchecks test --project my-project --root . --record \
  --tags smoke,browser \
  --type browser \
  -e ENVIRONMENT_URL=https://app.example.com
```

Run the latest deployed checks:

```bash
npx selfchecks trigger --project my-project --record
```

Use `npx selfchecks <command> --help` for the complete option list. The CLI prints
JSON summaries and exits with a non-zero status when checks fail.

## CI

Install the CLI as a development dependency and run the same commands in CI. GitLab
metadata is detected from `CI_PROJECT_PATH`, `CI_COMMIT_REF_NAME`, `CI_COMMIT_SHA`,
`CI_PIPELINE_URL`, and `CI_JOB_URL`. These values can also be supplied explicitly.

Runtime variables can be repeated with `-e NAME=value` or provided as an array of
`{ "name": "...", "value": "..." }` objects in `SELFCHECKS_ENV_JSON`.

## Programmatic API

The package also exports the remote operations for Node.js applications:

```ts
import {
  runRemoteDeploy,
  runRemoteTestSession,
  runRemoteTrigger,
} from "@selfchecks/selfchecks-cli";
```

See the [Selfchecks getting started guide](https://selfchecks.github.io/getting-started.html)
for check definitions, CI examples, and server installation.
