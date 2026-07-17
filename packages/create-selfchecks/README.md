# create-selfchecks

Create a minimal [Selfchecks](https://selfchecks.github.io/) project with one browser
check for `https://selfchecks.github.io/`.

## Quick start

```bash
npx create-selfchecks my-checks
cd my-checks
npx playwright install chromium
npm test
```

Without a directory argument, the command creates `./selfchecks-project`. The target
directory must be empty.

## Options

```text
Usage: create-selfchecks [directory] [options]

Options:
  --skip-install  Create files without running npm install
  -h, --help      Display help
```

Node.js 20 or newer is required.

## Generated project

The starter includes:

- a Selfchecks configuration;
- a `BrowserCheck` definition;
- a Playwright test that opens `https://selfchecks.github.io/`;
- TypeScript and Playwright configuration;
- scripts for local tests, typechecking, and remote deployment.

To deploy the generated check, configure your Selfchecks server and use the included
CLI:

```bash
export SELFCHECKS_URL=https://checks.example.com
export SELFCHECKS_API_TOKEN=replace-with-a-secret
npm run selfchecks -- deploy --project my-project --root .
```

## Programmatic API

```ts
import { createSelfchecksProject } from "create-selfchecks";

await createSelfchecksProject({
  targetDir: "./my-checks",
  install: false,
});
```

See the [Selfchecks getting started guide](https://selfchecks.github.io/getting-started.html)
for the next steps.
