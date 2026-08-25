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
  accounts: ["free"],
  frequency: Frequency.EVERY_15M,
  tags: ["smoke", "browser"],
  code: {
    entrypoint: "homepage.spec.ts",
  },
});
```

The entrypoint is a regular Playwright Test file. `accounts` lists the logical
account keys that the browser check needs together.

Define an API check with request assertions:

```ts
import { ApiCheck, AssertionBuilder } from "@selfchecks/selfchecks/constructs";

new ApiCheck("health", {
  maxResponseTime: 2_000,
  request: {
    method: "GET",
    url: "{{API_URL}}/health",
    queryParameters: { probe: "selfchecks" },
    assertions: [
      AssertionBuilder.statusCode().equals(200),
      AssertionBuilder.jsonBody("$.data.ok").equals(true),
    ],
  },
});
```

The Selfchecks CLI executes TypeScript manifests locally and compiles them into
`DeploymentManifest v1`. Imported helpers, loops, and computed construct definitions
are supported as long as their final properties belong to the compatibility profile.

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
TypeScript types. API request assertions and webhook alert channels attached through
groups are deployed. Unsupported properties produce a compiler error instead of being
silently ignored. Checkly locations, runtimes, secrets, status pages, maintenance
windows, alert escalation policies, REST APIs, CLI commands, and cloud runtime
behavior are not supported.

See the complete [migration guide](https://selfchecks.github.io/getting-started.html#migration)
and [Selfchecks documentation](https://selfchecks.github.io/getting-started.html).
