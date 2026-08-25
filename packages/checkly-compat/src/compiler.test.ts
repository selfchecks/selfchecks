import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { compileProject } from "./compiler.js";

const tempDirs: string[] = [];

async function createProject(): Promise<string> {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "selfchecks-compiler-"));
  tempDirs.push(rootDir);
  await mkdir(path.join(rootDir, "checks"), { recursive: true });
  return rootDir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((rootDir) => rm(rootDir, { force: true, recursive: true })),
  );
});

describe("compileProject", () => {
  it("compiles dynamic TypeScript constructs into DeploymentManifest v1", async () => {
    const rootDir = await createProject();
    const constructsUrl = pathToFileURL(
      path.join(resolvePackageRoot(), "src/constructs.ts"),
    ).href;

    await writeFile(
      path.join(rootDir, "checkly.config.ts"),
      `export default {
        logicalId: "public-demo",
        projectName: "Public demo",
        checks: { activated: true, frequency: 15, tags: ["production"] }
      };`,
    );
    await writeFile(
      path.join(rootDir, "checks/helpers.ts"),
      `import { ApiCheck } from ${JSON.stringify(constructsUrl)};
       export function createHealthCheck(name: string, url: string, group: never) {
         return new ApiCheck(name, {
           group,
           request: {
             assertions: [{ comparison: "EQUALS", source: "STATUS_CODE", target: 200 }],
             method: "GET",
             url,
           },
         });
       }`,
    );
    await writeFile(
      path.join(rootDir, "checks/services.check.ts"),
      `import { CheckGroupV2, WebhookAlertChannel } from ${JSON.stringify(constructsUrl)};
       import { createHealthCheck } from "./helpers.ts";
       const channel = new WebhookAlertChannel("operations", {
         method: "POST",
         name: "Operations",
         url: new URL("https://hooks.example.test/selfchecks")
       });
       const group = new CheckGroupV2("services", {
         alertChannels: [channel],
         name: "Services"
       });
       for (const service of ["catalog", "billing"]) {
         createHealthCheck(
           service,
           "https://" + service + ".example.test/health",
           group as never
         );
       }`,
    );

    await expect(compileProject({ rootDir })).resolves.toEqual({
      alertChannels: [
        {
          adapter: "generic",
          logicalId: "operations",
          method: "POST",
          name: "Operations",
          sendDegraded: false,
          sendFailure: true,
          sendRecovery: true,
          sslExpiry: false,
          url: "https://hooks.example.test/selfchecks",
        },
      ],
      checks: [
        expect.objectContaining({
          enabled: true,
          frequency: { intervalMinutes: 15 },
          groupKey: "services",
          groupName: "Services",
          key: "catalog",
          name: "catalog",
          request: expect.objectContaining({
            assertions: [
              {
                comparison: "EQUALS",
                source: "STATUS_CODE",
                target: 200,
              },
            ],
            method: "GET",
            url: "https://catalog.example.test/health",
          }),
          tags: ["production"],
          alertChannelLogicalIds: ["operations"],
          type: "api",
        }),
        expect.objectContaining({
          key: "billing",
          request: expect.objectContaining({
            url: "https://billing.example.test/health",
          }),
        }),
      ],
      project: {
        logicalId: "public-demo",
        name: "Public demo",
      },
      version: 1,
      warnings: [],
    });
  });

  it("rejects properties that the compatibility profile cannot honor", async () => {
    const rootDir = await createProject();
    const constructsUrl = pathToFileURL(
      path.join(resolvePackageRoot(), "src/constructs.ts"),
    ).href;

    await writeFile(
      path.join(rootDir, "checkly.config.ts"),
      `export default { logicalId: "demo", projectName: "Demo" };`,
    );
    await writeFile(
      path.join(rootDir, "checks/private.check.ts"),
      `import { ApiCheck } from ${JSON.stringify(constructsUrl)};
       new ApiCheck("private", {
         privateLocations: ["office"],
         request: { method: "GET", url: "https://example.test" }
       } as never);`,
    );

    await expect(compileProject({ rootDir })).rejects.toThrow(
      "ApiCheck private uses unsupported property: privateLocations",
    );
  });

  it("compiles the account requirements of a browser check", async () => {
    const rootDir = await createProject();
    const constructsUrl = pathToFileURL(
      path.join(resolvePackageRoot(), "src/constructs.ts"),
    ).href;

    await writeFile(
      path.join(rootDir, "checkly.config.ts"),
      `export default { logicalId: "demo", projectName: "Demo" };`,
    );
    await writeFile(
      path.join(rootDir, "checks/signin.check.ts"),
      `import { BrowserCheck } from ${JSON.stringify(constructsUrl)};
       new BrowserCheck("signin", {
         accounts: [" free ", "actionmedia-user2", "free"],
         code: { entrypoint: "signin.spec.ts" }
       });`,
    );

    await expect(compileProject({ rootDir })).resolves.toMatchObject({
      checks: [
        {
          accounts: ["free", "actionmedia-user2"],
          entrypoint: "signin.spec.ts",
          key: "signin",
          type: "browser",
        },
      ],
    });
  });

  it("rejects invalid browser account requirements", async () => {
    const rootDir = await createProject();
    const constructsUrl = pathToFileURL(
      path.join(resolvePackageRoot(), "src/constructs.ts"),
    ).href;

    await writeFile(
      path.join(rootDir, "checkly.config.ts"),
      `export default { logicalId: "demo", projectName: "Demo" };`,
    );
    await writeFile(
      path.join(rootDir, "checks/signin.check.ts"),
      `import { BrowserCheck } from ${JSON.stringify(constructsUrl)};
       new BrowserCheck("signin", {
         accounts: ["free", ""],
         code: { entrypoint: "signin.spec.ts" }
       });`,
    );

    await expect(compileProject({ rootDir })).rejects.toThrow(
      "BrowserCheck signin account at index 1 must be a non-empty string.",
    );
  });
});

function resolvePackageRoot(): string {
  return path.basename(process.cwd()) === "checkly-compat"
    ? process.cwd()
    : path.join(process.cwd(), "packages/checkly-compat");
}
