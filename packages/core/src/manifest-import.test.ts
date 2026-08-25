import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  findCheckManifestFiles,
  importCheckDefinitions,
  parseCheckManifestSource,
  toDeploySummary,
} from "./manifest-import.js";

const tempDirs: string[] = [];

async function createTempProject(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "selfchecks-core-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) =>
      import("node:fs/promises").then(({ rm }) =>
        rm(dir, {
          force: true,
          recursive: true,
        }),
      ),
    ),
  );
});

describe("findCheckManifestFiles", () => {
  it("finds .check.ts files and ignores generated directories", async () => {
    const rootDir = await createTempProject();
    await mkdir(path.join(rootDir, "config/checkly"), { recursive: true });
    await mkdir(path.join(rootDir, "node_modules/pkg"), { recursive: true });
    await writeFile(
      path.join(rootDir, "config/checkly/homepage.check.ts"),
      "new BrowserCheck('homepage', {})",
    );
    await writeFile(
      path.join(rootDir, "node_modules/pkg/ignored.check.ts"),
      "new BrowserCheck('ignored', {})",
    );

    await expect(findCheckManifestFiles(rootDir)).resolves.toEqual([
      path.join(rootDir, "config/checkly/homepage.check.ts"),
    ]);
  });
});

describe("parseCheckManifestSource", () => {
  it("does not infer project-specific helper semantics", () => {
    expect(
      parseCheckManifestSource(
        `
          import { createApiCheck } from './project-helper';
          createApiCheck('health', { request: createRequest('health') });
        `,
        "checks/health.check.ts",
      ),
    ).toMatchObject({
      checks: [],
      filePath: "checks/health.check.ts",
      warnings: [
        expect.stringContaining(
          "skipped createApiCheck because API checks require a request definition",
        ),
      ],
    });
  });

  it("extracts Checkly retry strategy builder calls", () => {
    expect(
      parseCheckManifestSource(
        `
          import { BrowserCheck, RetryStrategyBuilder } from 'checkly/constructs';

          new BrowserCheck("homepage", {
            name: "Homepage",
            code: {
              entrypoint: "homepage.spec.ts"
            },
            retryStrategy: RetryStrategyBuilder.linearStrategy({
              baseBackoffSeconds: 30,
              maxRetries: 4,
              maxDurationSeconds: 600,
              sameRegion: false,
            })
          });
        `,
        "config/checkly/homepage.check.ts",
      ).checks[0],
    ).toMatchObject({
      retryStrategy: {
        baseBackoffSeconds: 30,
        maxDurationSeconds: 600,
        maxRetries: 4,
        sameRegion: false,
        type: "LINEAR",
      },
    });
  });

  it("extracts object literal retry strategies", () => {
    expect(
      parseCheckManifestSource(
        `
          new ApiCheck({
            key: "api-health",
            name: "API health",
            request: {
              method: "GET",
              url: "https://example.test/health"
            },
            retryStrategy: {
              type: "FIXED",
              baseBackoffSeconds: 10,
              maxRetries: 2,
              maxDurationSeconds: 120,
              sameRegion: true
            }
          });
        `,
        "config/checkly/api.check.ts",
      ).checks[0],
    ).toMatchObject({
      retryStrategy: {
        baseBackoffSeconds: 10,
        maxDurationSeconds: 120,
        maxRetries: 2,
        sameRegion: true,
        type: "FIXED",
      },
    });
  });

  it("extracts browser check definitions", () => {
    expect(
      parseCheckManifestSource(
        `
          import path from "node:path";
          new BrowserCheck("homepage", {
            name: "Homepage",
            activated: false,
            accounts: ["free", "actionmedia-user2"],
            tags: ["app", "smoke"],
            code: {
              entrypoint: path.join(__dirname, "homepage.spec.ts")
            }
          });
        `,
        "config/checkly/homepage.check.ts",
      ),
    ).toMatchObject({
      checks: [
        {
          accounts: ["free", "actionmedia-user2"],
          enabled: false,
          entrypoint: "homepage.spec.ts",
          key: "homepage",
          name: "Homepage",
          tags: ["app", "smoke"],
          type: "browser",
        },
      ],
      warnings: [],
    });
  });

  it("extracts API check definitions", () => {
    expect(
      parseCheckManifestSource(
        `
          new ApiCheck({
            degradedResponseTime: 2500,
            key: "api-health",
            name: "API health",
            tags: ["api"],
            request: {
              method: "GET",
              url: "https://example.test/health",
              headers: {
                accept: "application/json"
              }
            }
          });
        `,
        "config/checkly/api.check.ts",
      ),
    ).toMatchObject({
      checks: [
        {
          degradedResponseTime: 2500,
          key: "api-health",
          name: "API health",
          request: {
            headers: {
              accept: "application/json",
            },
            method: "GET",
            url: "https://example.test/health",
          },
          tags: ["api"],
          type: "api",
        },
      ],
      warnings: [],
    });
  });

  it("slugifies the key when only the name is static", () => {
    expect(
      parseCheckManifestSource(
        `
          new BrowserCheck({
            name: "Checkout Smoke / Browser",
            entrypoint: "checkout.spec.ts"
          });
        `,
        "checkout.check.ts",
      ).checks[0],
    ).toMatchObject({
      key: "checkout-smoke-browser",
      name: "Checkout Smoke / Browser",
    });
  });

  it("returns warnings for unsupported check definitions", () => {
    expect(
      parseCheckManifestSource(
        `
          new ApiCheck("api-health", {
            name: "API health"
          });
        `,
        "api.check.ts",
      ),
    ).toMatchObject({
      checks: [],
      warnings: [
        "api.check.ts: skipped ApiCheck because API checks require a request definition.",
      ],
    });
  });
});

describe("importCheckDefinitions", () => {
  it("builds a deploy summary from discovered manifest files", async () => {
    const rootDir = await createTempProject();
    await mkdir(path.join(rootDir, "config/checkly"), { recursive: true });
    await writeFile(
      path.join(rootDir, "config/checkly/homepage.check.ts"),
      `
        new BrowserCheck("homepage", {
          name: "Homepage",
          entrypoint: "homepage.spec.ts"
        });
      `,
    );

    await expect(
      importCheckDefinitions({
        projectSlug: "account",
        rootDir,
      }),
    ).resolves.toMatchObject({
      checks: [
        {
          key: "homepage",
          name: "Homepage",
          type: "browser",
        },
      ],
      created: 1,
      projectSlug: "account",
      removed: 0,
      updated: 0,
      warnings: [],
    });
  });

  it("normalizes Checkly helper entrypoints and inferred group names", async () => {
    const rootDir = await createTempProject();
    const checksDir = path.join(rootDir, "src/__checks__/UI/App/smoke");

    await mkdir(checksDir, { recursive: true });
    await writeFile(
      path.join(checksDir, "free.signin.check.ts"),
      `
        createBrowserCheck("Signin", "./free.signin.spec.ts", {
          group: smokeCheckGroup,
          tags: ["app", "smoke"]
        });
      `,
    );

    await expect(
      importCheckDefinitions({
        projectSlug: "account",
        rootDir,
      }),
    ).resolves.toMatchObject({
      checks: [
        {
          entrypoint: "src/__checks__/UI/App/smoke/free.signin.spec.ts",
          groupKey: "app-smoke",
          groupName: "App / Smoke",
          key: "Signin",
          name: "Signin",
          tags: ["app", "smoke"],
          type: "browser",
        },
      ],
    });
  });

  it("inherits retry strategy from Checkly helper group definitions", async () => {
    const rootDir = await createTempProject();
    const checksDir = path.join(rootDir, "src/__checks__/UI/App/billing");

    await mkdir(path.join(rootDir, "src/strategies"), { recursive: true });
    await mkdir(path.join(rootDir, "src/utils"), { recursive: true });
    await mkdir(checksDir, { recursive: true });
    await writeFile(
      path.join(rootDir, "src/strategies/base.ts"),
      `
        import { RetryStrategyBuilder } from 'checkly/constructs';

        export const BaseRetryStrategy = RetryStrategyBuilder.fixedStrategy({
          baseBackoffSeconds: 0,
          maxRetries: 2,
          maxDurationSeconds: 600,
          sameRegion: false,
        });
      `,
    );
    await writeFile(
      path.join(rootDir, "src/utils/checkGroup.ts"),
      `
        import { CheckGroupV2 } from 'checkly/constructs';
        import { BaseRetryStrategy } from '../strategies/base';

        export const createCheckGroup = (name: string, options: Record<string, unknown>) => {
          const logicalId = name
            .replace(/ \\/ /gi, '-')
            .replace(/ /gi, '-')
            .replace(/[()]/gi, '')
            .toLocaleLowerCase();

          return new CheckGroupV2(logicalId, {
            name,
            activated: true,
            retryStrategy: BaseRetryStrategy,
            ...options,
          });
        };
      `,
    );
    await writeFile(
      path.join(checksDir, "group.ts"),
      `
        import { createCheckGroup } from '@utils/checkGroup';

        export const billingCheckGroup = createCheckGroup('App / Billing', {
          tags: ['app', 'billing'],
        });
      `,
    );
    await writeFile(
      path.join(checksDir, "rest.limit-checks.check.ts"),
      `
        import { Frequency } from 'checkly/constructs';
        import { createBrowserCheck } from '@utils/browserCheck';
        import { billingCheckGroup } from './group';

        createBrowserCheck('Limits checks', './rest.limit-checks.spec.ts', {
          group: billingCheckGroup,
          frequency: Frequency.EVERY_24H,
        });
      `,
    );

    await expect(
      importCheckDefinitions({
        projectSlug: "account",
        rootDir,
      }),
    ).resolves.toMatchObject({
      checks: [
        {
          entrypoint: "src/__checks__/UI/App/billing/rest.limit-checks.spec.ts",
          groupKey: "app-billing",
          groupName: "App / Billing",
          key: "Limits-checks",
          name: "Limits checks",
          retryStrategy: {
            baseBackoffSeconds: 0,
            maxDurationSeconds: 600,
            maxRetries: 2,
            sameRegion: false,
            type: "FIXED",
          },
          type: "browser",
        },
      ],
      warnings: [],
    });
  });

  it("imports webhook alert channels and attaches them through a group factory", async () => {
    const rootDir = await createTempProject();
    const checksDir = path.join(rootDir, "src/__checks__/UI/App/smoke");

    await mkdir(path.join(rootDir, "src/channels"), { recursive: true });
    await mkdir(path.join(rootDir, "src/utils"), { recursive: true });
    await mkdir(checksDir, { recursive: true });
    await writeFile(
      path.join(rootDir, "src/channels/rocketchat.ts"),
      `
        const WEBHOOK_URL = 'https://chat.example.test/hooks/unit-test';
        const RocketChatFail = new WebhookAlertChannel('RocketChatFail', {
          name: 'RocketChatFail',
          method: 'POST',
          url: new URL(WEBHOOK_URL),
          sendFailure: true,
          sendRecovery: false,
          template: '{ "text": "{{GROUP_NAME}} / {{ALERT_TITLE}}" }',
        });
        const RocketChatRecover = new WebhookAlertChannel('RocketChatRecover', {
          name: 'RocketChatRecover',
          method: 'POST',
          url: new URL(WEBHOOK_URL),
          sendFailure: false,
          sendRecovery: true,
        });
        export const RocketChatChannel = [
          RocketChatFail,
          RocketChatRecover,
        ];
      `,
    );
    await writeFile(
      path.join(rootDir, "src/utils/checkGroup.ts"),
      `
        export const createCheckGroup = (name: string, options: object) =>
          new CheckGroupV2(name, {
            name,
            alertChannels: [...RocketChatChannel],
            ...options,
          });
      `,
    );
    await writeFile(
      path.join(checksDir, "group.ts"),
      `
        export const smokeCheckGroup = createCheckGroup('App / Smoke', {});
      `,
    );
    await writeFile(
      path.join(checksDir, "homepage.check.ts"),
      `
        createBrowserCheck('Homepage', './homepage.spec.ts', {
          group: smokeCheckGroup,
        });
      `,
    );

    const result = await importCheckDefinitions({
      projectSlug: "account",
      rootDir,
    });

    expect(result.alertChannels).toEqual([
      expect.objectContaining({
        logicalId: "RocketChatFail",
        sendFailure: true,
        sendRecovery: false,
        url: "https://chat.example.test/hooks/unit-test",
      }),
      expect.objectContaining({
        logicalId: "RocketChatRecover",
        sendFailure: false,
        sendRecovery: true,
        url: "https://chat.example.test/hooks/unit-test",
      }),
    ]);
    expect(result.checks[0]).toMatchObject({
      alertChannelLogicalIds: ["RocketChatFail", "RocketChatRecover"],
      groupKey: "app-smoke",
    });
    expect(JSON.stringify(toDeploySummary(result))).not.toContain("chat.example.test");
  });

  it("warns and skips webhook channels whose URL is not static", async () => {
    const rootDir = await createTempProject();

    await writeFile(
      path.join(rootDir, "invalid-channel.ts"),
      `
        const InvalidChannel = new WebhookAlertChannel('InvalidChannel', {
          name: 'Invalid channel',
          method: 'POST',
          url: new URL(process.env.WEBHOOK_URL),
        });
      `,
    );

    const result = await importCheckDefinitions({
      projectSlug: "account",
      rootDir,
    });

    expect(result.alertChannels).toEqual([]);
    expect(result.warnings).toEqual([
      expect.stringContaining("skipped WebhookAlertChannel InvalidChannel"),
    ]);
    expect(result.warnings[0]).not.toContain("WEBHOOK_URL");
  });
});
