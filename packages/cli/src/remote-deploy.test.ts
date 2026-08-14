import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import { runRemoteDeploy } from "./remote-deploy.js";

describe("remote deploy", () => {
  let rootDir: string | undefined;

  afterEach(async () => {
    vi.unstubAllGlobals();
    if (rootDir) {
      await rm(rootDir, { force: true, recursive: true });
    }
  });

  it("uploads a bundle and polls the deployment job", async () => {
    rootDir = await mkdtemp(path.join(os.tmpdir(), "selfchecks-deploy-"));
    await mkdir(path.join(rootDir, "src"));
    await writeFile(path.join(rootDir, "package.json"), '{"name":"checks"}');
    await writeFile(
      path.join(rootDir, "checkly.config.ts"),
      `export default { logicalId: "account", projectName: "Account" };`,
    );
    const constructsUrl = pathToFileURL(
      path.resolve(
        process.env.INIT_CWD ?? process.cwd(),
        "packages/checkly-compat/src/constructs.ts",
      ),
    ).href;
    await writeFile(
      path.join(rootDir, "src/home.check.ts"),
      `import { ApiCheck } from ${JSON.stringify(constructsUrl)};
       new ApiCheck("health", {
         request: { method: "GET", url: "https://example.test/health" }
       });`,
    );
    const summary = {
      checks: [],
      created: 1,
      projectSlug: "account",
      removed: 0,
      updated: 0,
      warnings: [],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            deploymentId: "deployment_1",
            statusUrl: "/api/cli/deployments/deployment_1",
          }),
          { status: 202 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "completed", summary })),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      runRemoteDeploy({
        allowRemovals: true,
        apiToken: "secret",
        apiUrl: "https://checks.example.test",
        projectSlug: "account",
        rootDir,
      }),
    ).resolves.toEqual(summary);

    const upload = fetchMock.mock.calls[0]?.[1];
    const metadata = JSON.parse(String((upload?.body as FormData).get("metadata")));

    expect(metadata).toMatchObject({
      allowRemovals: true,
      deploymentManifest: {
        checks: [
          expect.objectContaining({
            key: "health",
            request: expect.objectContaining({
              url: "https://example.test/health",
            }),
          }),
        ],
        project: { logicalId: "account", name: "Account" },
        version: 1,
      },
      projectSlug: "account",
    });
    expect(upload?.headers).toEqual({ Authorization: "Bearer secret" });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://checks.example.test/api/cli/deployments/deployment_1",
      { headers: { Authorization: "Bearer secret" } },
    );
  });
});
