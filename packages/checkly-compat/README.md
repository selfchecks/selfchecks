# @selfchecks/selfchecks

Checkly-compatible checks-as-code constructs supported by
[Selfchecks](https://selfchecks.github.io/), a self-hosted synthetic monitoring
service.

## Installation

```bash
npm install --save-dev @selfchecks/selfchecks @playwright/test
```

Node.js 20 or newer is required.

## Usage

Create a Selfchecks configuration:

```ts
// checkly.config.ts
import { defineConfig } from "@selfchecks/selfchecks";
import { Frequency } from "@selfchecks/selfchecks/constructs";

export default defineConfig({
  projectName: "My project",
  logicalId: "my-project",
  checks: {
    activated: true,
    frequency: Frequency.EVERY_15M,
    checkMatch: "**/*.check.ts",
  },
});
```

Define a browser check:

```ts
// checks/homepage.check.ts
import { BrowserCheck, Frequency } from "@selfchecks/selfchecks/constructs";

new BrowserCheck("homepage", {
  name: "Homepage",
  activated: true,
  frequency: Frequency.EVERY_15M,
  tags: ["smoke", "browser"],
  code: {
    entrypoint: "homepage.spec.ts",
  },
});
```

The entrypoint is a regular Playwright Test file.

## Checkly-compatible imports

Existing projects can keep supported imports from `checkly` by installing this
package through an npm alias:

```json
{
  "devDependencies": {
    "checkly": "npm:@selfchecks/selfchecks@latest"
  }
}
```

The following imports are supported:

```ts
import { defineConfig } from "checkly";
import {
  AlertEscalationBuilder,
  ApiCheck,
  AssertionBuilder,
  BrowserCheck,
  CheckGroup,
  CheckGroupV2,
  Frequency,
  RetryStrategyBuilder,
  WebhookAlertChannel,
} from "checkly/constructs";
```

Compatibility is intentionally limited to these constructs and their exported
TypeScript types. Other Checkly constructs, CLI commands, cloud APIs, and runtime
features are not supported. Assertion and alert objects are accepted for source
compatibility, but Selfchecks does not currently deploy their Checkly configuration.

See the complete [migration guide](https://selfchecks.github.io/getting-started.html#migration)
and [Selfchecks documentation](https://selfchecks.github.io/getting-started.html).
