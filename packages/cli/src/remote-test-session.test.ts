import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { collectBundleFiles, runRemoteTestSession } from "./remote-test-session.js";

const tempDirs: string[] = [];

async function createProject() {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "selfchecks-remote-"));
  tempDirs.push(rootDir);
  await mkdir(path.join(rootDir, "src"), { recursive: true });
  await mkdir(path.join(rootDir, "node_modules", "ignored"), { recursive: true });
  await mkdir(path.join(rootDir, "test-results"), { recursive: true });
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
  vi.unstubAllGlobals();
  await Promise.all(
    tempDirs
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("remote test sessions", () => {
  it("builds a runtime bundle without secrets, dependencies or previous artifacts", async () => {
    const rootDir = await createProject();
    const files = await collectBundleFiles(rootDir);

    expect(files.map((file) => file.path)).toEqual([
      "package.json",
      "src/check.spec.ts",
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
        env: [],
        projectSlug: "account",
        reporter: "github",
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
});
