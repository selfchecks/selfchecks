import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  cancelRemoteTestSession,
  collectBundleFiles,
  fetchRemoteStatus,
  runRemoteTestSession,
} from "./remote-test-session.js";

const tempDirs: string[] = [];

async function createProject() {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "selfchecks-remote-"));
  tempDirs.push(rootDir);
  await mkdir(path.join(rootDir, "src"), { recursive: true });
  await mkdir(path.join(rootDir, "node_modules", "ignored"), { recursive: true });
  await mkdir(path.join(rootDir, "test-results"), { recursive: true });
  await writeFile(
    path.join(rootDir, "checkly.config.ts"),
    `export default { logicalId: "demo", projectName: "Demo" };`,
  );
  const constructsUrl = pathToFileURL(
    path.resolve(
      process.env.INIT_CWD ?? process.cwd(),
      "packages/checkly-compat/src/constructs.ts",
    ),
  ).href;
  await writeFile(
    path.join(rootDir, "src", "health.check.ts"),
    `import { ApiCheck } from ${JSON.stringify(constructsUrl)};
     new ApiCheck("health", {
       request: { method: "GET", url: "https://api.example.test/health" }
     });`,
  );
  await writeFile(
    path.join(rootDir, "package.json"),
    JSON.stringify({
      dependencies: { axios: "1.0.0" },
      devDependencies: { private: "workspace:^" },
      name: "checks",
      version: "1.2.3",
    }),
  );
  await writeFile(
    path.join(rootDir, "tsconfig.json"),
    JSON.stringify({ extends: "workspace-config", include: ["src"] }),
  );
  await writeFile(path.join(rootDir, "src", "check.spec.ts"), "test('ok', () => {});");
  await writeFile(path.join(rootDir, ".env"), "SECRET=do-not-upload");
  await writeFile(path.join(rootDir, ".env.local"), "TOKEN=do-not-upload");
  await writeFile(path.join(rootDir, "node_modules", "ignored", "index.js"), "");
  await writeFile(path.join(rootDir, "test-results", "screenshot.png"), "old");

  return rootDir;
}

afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  await Promise.all(
    tempDirs
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("remote test sessions", () => {
  it("cancels a remote session without polling for completion", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ sessionId: "session_1", status: "cancelled" })),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      cancelRemoteTestSession(
        "https://checks.example.test/",
        "secret-token",
        "session_1",
      ),
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://checks.example.test/api/cli/test-sessions/session_1",
      expect.objectContaining({
        headers: {
          Authorization: "Bearer secret-token",
        },
        method: "DELETE",
      }),
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("retries transient remote status responses", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "passed" }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = expect(
      fetchRemoteStatus<{ status: string }>(
        "https://checks.example.test/api/cli/test-sessions/session_1",
        "secret-token",
        "Unable to read remote test session.",
      ),
    ).resolves.toEqual({ status: "passed" });

    await vi.runAllTimersAsync();
    await result;

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries network errors while reading remote status", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "running" }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = expect(
      fetchRemoteStatus<{ status: string }>(
        "https://checks.example.test/api/cli/test-sessions/session_1",
        "secret-token",
        "Unable to read remote test session.",
      ),
    ).resolves.toEqual({ status: "running" });

    await vi.runAllTimersAsync();
    await result;

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry permanent remote status errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Unauthorized." }), {
        status: 401,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchRemoteStatus(
        "https://checks.example.test/api/cli/test-sessions/session_1",
        "secret-token",
        "Unable to read remote test session.",
      ),
    ).rejects.toThrow("Unauthorized.");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports the HTTP status after transient retries are exhausted", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = expect(
      fetchRemoteStatus(
        "https://checks.example.test/api/cli/test-sessions/session_1",
        "secret-token",
        "Unable to read remote test session.",
      ),
    ).rejects.toThrow("Unable to read remote test session. (HTTP 503).");

    await vi.runAllTimersAsync();
    await result;

    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("builds a runtime bundle without secrets, dependencies or previous artifacts", async () => {
    const rootDir = await createProject();
    const files = await collectBundleFiles(rootDir);

    expect(files.map((file) => file.path)).toEqual([
      "checkly.config.ts",
      "package.json",
      "src/check.spec.ts",
      "src/health.check.ts",
      "tsconfig.json",
    ]);
    expect(
      JSON.parse(
        Buffer.from(
          files.find((file) => file.path === "package.json")!.content,
        ).toString(),
      ),
    ).toEqual({
      dependencies: { axios: "1.0.0" },
      name: "checks",
      private: true,
      version: "1.2.3",
    });
    expect(
      JSON.parse(
        Buffer.from(
          files.find((file) => file.path === "tsconfig.json")!.content,
        ).toString(),
      ),
    ).toEqual({ include: ["src"] });
  });

  it("uploads the bundle and polls the remote session with bearer authentication", async () => {
    const rootDir = await createProject();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            sessionId: "session_1",
            statusUrl: "/api/cli/test-sessions/session_1",
          }),
          { status: 202 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: "passed",
            summary: {
              durationMs: 10,
              failed: 0,
              passed: 1,
              results: [],
              sessionId: "session_1",
              skipped: 0,
              total: 1,
            },
          }),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      runRemoteTestSession({
        apiToken: "secret-token",
        apiUrl: "https://checks.example.test/",
        checkKeys: [],
        checkTypes: ["browser"],
        commitSha: "abc123def456",
        env: [],
        jobUrl: "https://gitlab.example.test/jobs/456",
        pipelineUrl: "https://gitlab.example.test/pipelines/123",
        projectSlug: "account",
        ref: "release/1.2.3",
        reporter: "github",
        repository: "sendsay-ru/frontend/account",
        rootDir,
        tagSets: [],
      }),
    ).resolves.toMatchObject({
      passed: 1,
      sessionId: "session_1",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://checks.example.test/api/cli/test-sessions",
      expect.objectContaining({
        headers: {
          Authorization: "Bearer secret-token",
        },
        method: "POST",
      }),
    );
    const uploadBody = fetchMock.mock.calls[0]?.[1]?.body as FormData;

    expect(JSON.parse(String(uploadBody.get("metadata")))).toMatchObject({
      commitSha: "abc123def456",
      deploymentManifest: {
        checks: [
          expect.objectContaining({
            key: "health",
            request: expect.objectContaining({
              url: "https://api.example.test/health",
            }),
          }),
        ],
        project: { logicalId: "demo", name: "Demo" },
        version: 1,
      },
      jobUrl: "https://gitlab.example.test/jobs/456",
      pipelineUrl: "https://gitlab.example.test/pipelines/123",
      ref: "release/1.2.3",
      repository: "sendsay-ru/frontend/account",
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://checks.example.test/api/cli/test-sessions/session_1",
      {
        headers: {
          Authorization: "Bearer secret-token",
        },
      },
    );
  });

  it("queues an asynchronous session without polling for completion", async () => {
    const rootDir = await createProject();
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          sessionId: "session_1",
          statusUrl: "/api/cli/test-sessions/session_1",
          total: 1,
        }),
        { status: 202 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      runRemoteTestSession({
        apiToken: "secret-token",
        apiUrl: "https://checks.example.test/",
        checkKeys: [],
        checkTypes: ["browser"],
        env: [],
        projectSlug: "account",
        reporter: "github",
        rootDir,
        tagSets: [],
        waitForCompletion: false,
      }),
    ).resolves.toEqual({
      durationMs: 0,
      failed: 0,
      passed: 0,
      results: [],
      sessionId: "session_1",
      skipped: 0,
      total: 1,
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://checks.example.test/api/cli/test-sessions",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
