import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  findCheckManifestFiles,
  importCheckDefinitions,
  parseCheckManifestSource,
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
  it("extracts account helper browser check definitions", () => {
    expect(
      parseCheckManifestSource(
        `
          import { Frequency } from 'checkly/constructs';
          import { Tags } from '@constants';
          import { createBrowserCheck } from '@utils/browserCheck';
          import { smokeCheckGroup } from './group';

          createBrowserCheck('Free login', './free.login.spec.ts', {
            tags: [Tags.App, Tags.Core, Tags.PR],
            group: smokeCheckGroup,
            frequency: Frequency.EVERY_24H,
          });
        `,
        "src/__checks__/UI/App/core/free.login.check.ts",
      ),
    ).toMatchObject({
      checks: [
        {
          entrypoint: "./free.login.spec.ts",
          frequency: {
            intervalMinutes: 1440,
          },
          groupKey: "smokeCheckGroup",
          key: "Free-login",
          name: "Free login",
          tags: ["app", "core", "pr"],
          type: "browser",
        },
      ],
      warnings: [],
    });
  });

  it("extracts account helper API checks with BFF request spreads", () => {
    expect(
      parseCheckManifestSource(
        `
          import { AssertionBuilder, Frequency } from 'checkly/constructs';
          import { Tags } from '@constants';
          import { createApiCheck } from '@utils/apiCheck';
          import { createRequest } from '@utils/requestBff';
          import { bffCheckGroup } from './group';

          const request = createRequest('gtm.js?id=GTM-MP43XM');

          createApiCheck('bff-gtm-js', {
            tags: [Tags.API, Tags.Bff],
            group: bffCheckGroup,
            frequency: Frequency.EVERY_3H,
            request: {
              ...request,
              assertions: [
                AssertionBuilder.statusCode().equals(200),
              ],
            },
          });
        `,
        "src/__checks__/API/bff/gtm.check.ts",
      ),
    ).toMatchObject({
      checks: [
        {
          frequency: {
            intervalMinutes: 180,
          },
          groupKey: "bffCheckGroup",
          key: "bff-gtm-js",
          name: "bff-gtm-js",
          request: {
            method: "GET",
            url: "https://bff.sndsy.ru/gtm.js?id=GTM-MP43XM",
          },
          tags: ["api", "bff"],
          type: "api",
        },
      ],
      warnings: [],
    });
  });

  it("extracts account helper API checks with account API request spreads", () => {
    expect(
      parseCheckManifestSource(
        `
          import { createApiCheck } from '@utils/apiCheck';
          import { createRequest } from '@utils/request';

          const request = createRequest('codeception', {
            action: 'member.list',
          });

          createApiCheck('member.list', {
            request: {
              ...request,
              assertions: [],
            },
          });
        `,
        "src/__checks__/API/core/member.list.check.ts",
      ).checks[0],
    ).toMatchObject({
      key: "member-list",
      name: "member.list",
      request: {
        body: "{\n            action: 'member.list',\n          }",
        method: "POST",
        url: "{{API_URL}}/general/api/v100/json/{{ACCOUNT}}",
      },
      type: "api",
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
});
