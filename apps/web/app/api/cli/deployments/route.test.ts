import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queueAdd: vi.fn(),
  queueClose: vi.fn(),
  queueConstructor: vi.fn(),
}));

vi.mock("bullmq", () => ({
  Queue: mocks.queueConstructor.mockImplementation(() => ({
    add: mocks.queueAdd,
    close: mocks.queueClose,
  })),
}));

import { POST } from "./route";

describe("CLI deployment route", () => {
  let deploymentsDir: string;

  beforeEach(async () => {
    deploymentsDir = await mkdtemp(path.join(os.tmpdir(), "selfchecks-deployments-"));
    vi.stubEnv("SELFCHECKS_API_TOKEN", "api-token");
    vi.stubEnv("SELFCHECKS_DEPLOYMENTS_DIR", deploymentsDir);
  });

  afterEach(async () => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    await rm(deploymentsDir, { force: true, recursive: true });
  });

  it("stores the bundle and queues a deployment job", async () => {
    const formData = new FormData();
    const file = Buffer.from("new ApiCheck('health', {});\n");
    formData.set(
      "metadata",
      JSON.stringify({
        allowRemovals: true,
        deploymentManifest: {
          alertChannels: [],
          checks: [
            {
              enabled: true,
              key: "health",
              muted: false,
              name: "Health",
              request: { method: "GET", url: "https://example.test/health" },
              shouldFail: false,
              tags: [],
              type: "api",
            },
          ],
          project: { logicalId: "account", name: "Account" },
          version: 1,
          warnings: [],
        },
        gitRef: "refs/tags/v1.2.3",
        gitSha: "1234567890abcdef",
        projectSlug: "account",
      }),
    );
    formData.set(
      "manifest",
      JSON.stringify([{ path: "health.check.ts", size: file.length }]),
    );
    formData.set("file-0", new Blob([file]), "health.check.ts");

    const response = await POST({
      formData: async () => formData,
      headers: new Headers({ Authorization: "Bearer api-token" }),
    } as Request);
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body).toMatchObject({ status: "queued" });
    expect(mocks.queueAdd).toHaveBeenCalledWith(
      "deploy-checks",
      expect.objectContaining({
        allowRemovals: true,
        deploymentManifest: expect.objectContaining({ version: 1 }),
        gitRef: "refs/tags/v1.2.3",
        gitSha: "1234567890abcdef",
        kind: "deployment",
        projectSlug: "account",
      }),
      expect.objectContaining({ jobId: body.deploymentId }),
    );
    const rootDir = mocks.queueAdd.mock.calls[0]?.[1].rootDir;
    await expect(readFile(path.join(rootDir, "health.check.ts"), "utf8")).resolves.toBe(
      "new ApiCheck('health', {});\n",
    );
  });
});
