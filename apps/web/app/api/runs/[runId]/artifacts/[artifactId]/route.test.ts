import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  artifactFindFirst: vi.fn(),
  checkRunFindUnique: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    artifact: {
      findFirst: mocks.artifactFindFirst,
    },
    checkRun: {
      findUnique: mocks.checkRunFindUnique,
    },
  },
}));

import { createTraceAccessToken } from "@/lib/trace-access";

import { GET, OPTIONS } from "./route";

const tempDirs: string[] = [];
const originalNextAuthSecret = process.env.NEXTAUTH_SECRET;

async function createTempFile(name: string, content: string) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "selfchecks-artifact-"));
  const filePath = path.join(directory, name);

  tempDirs.push(directory);
  await writeFile(filePath, content);

  return filePath;
}

function createContext(runId = "run_1", artifactId = "artifact_1") {
  return {
    params: Promise.resolve({
      artifactId,
      runId,
    }),
  };
}

describe("artifact route", () => {
  afterEach(async () => {
    vi.clearAllMocks();
    if (originalNextAuthSecret === undefined) {
      delete process.env.NEXTAUTH_SECRET;
    } else {
      process.env.NEXTAUTH_SECRET = originalNextAuthSecret;
    }
    await Promise.all(
      tempDirs.splice(0).map((directory) =>
        rm(directory, {
          force: true,
          recursive: true,
        }),
      ),
    );
  });

  it("streams a stored artifact for viewing or download", async () => {
    const filePath = await createTempFile("trace.zip", "trace payload");
    mocks.artifactFindFirst.mockResolvedValue({
      mimeType: "application/zip",
      path: filePath,
      type: "TRACE",
    });

    const response = await GET(
      new Request("http://localhost/api/runs/run_1/artifacts/artifact_1?download=1"),
      createContext("run_1", "artifact_1"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("content-disposition")).toContain("attachment");
    await expect(response.text()).resolves.toBe("trace payload");
    expect(mocks.artifactFindFirst).toHaveBeenCalledWith({
      select: {
        mimeType: true,
        path: true,
        type: true,
      },
      where: {
        id: "artifact_1",
        runId: "run_1",
      },
    });
  });

  it("streams a legacy run log from logsPath", async () => {
    const filePath = await createTempFile("run_1.log", "log payload");
    mocks.checkRunFindUnique.mockResolvedValue({
      logsPath: filePath,
    });

    const response = await GET(
      new Request("http://localhost/api/runs/run_1/artifacts/log"),
      createContext("run_1", "log"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(response.headers.get("content-disposition")).toContain("inline");
    await expect(response.text()).resolves.toBe("log payload");
    expect(mocks.artifactFindFirst).not.toHaveBeenCalled();
    expect(mocks.checkRunFindUnique).toHaveBeenCalledWith({
      select: {
        logsPath: true,
      },
      where: {
        id: "run_1",
      },
    });
  });

  it("allows the embedded trace viewer to read a signed trace artifact", async () => {
    process.env.NEXTAUTH_SECRET = "test-secret";
    const filePath = await createTempFile("trace.zip", "trace payload");
    const token = createTraceAccessToken("run_1", "artifact_1");

    mocks.artifactFindFirst.mockResolvedValue({
      mimeType: "application/zip",
      path: filePath,
      type: "TRACE",
    });

    const response = await GET(
      new Request(
        `http://localhost/api/runs/run_1/artifacts/artifact_1?traceViewer=1&token=${token}`,
        {
          headers: {
            origin: "https://trace.playwright.dev",
          },
        },
      ),
      createContext("run_1", "artifact_1"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://trace.playwright.dev",
    );
    expect(response.headers.get("content-disposition")).toContain("inline");
    await expect(response.text()).resolves.toBe("trace payload");
  });

  it("rejects unsigned trace viewer artifact requests", async () => {
    process.env.NEXTAUTH_SECRET = "test-secret";
    const filePath = await createTempFile("trace.zip", "trace payload");

    mocks.artifactFindFirst.mockResolvedValue({
      mimeType: "application/zip",
      path: filePath,
      type: "TRACE",
    });

    const response = await GET(
      new Request(
        "http://localhost/api/runs/run_1/artifacts/artifact_1?traceViewer=1&token=bad",
        {
          headers: {
            origin: "https://trace.playwright.dev",
          },
        },
      ),
      createContext("run_1", "artifact_1"),
    );

    await expect(response.json()).resolves.toEqual({
      error: "Trace access token is invalid or expired.",
    });
    expect(response.status).toBe(401);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://trace.playwright.dev",
    );
  });

  it("answers trace viewer CORS preflight requests", () => {
    const response = OPTIONS(
      new Request(
        "http://localhost/api/runs/run_1/artifacts/artifact_1?traceViewer=1&token=abc",
        {
          headers: {
            origin: "https://trace.playwright.dev",
          },
          method: "OPTIONS",
        },
      ),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-methods")).toBe("GET, OPTIONS");
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://trace.playwright.dev",
    );
  });

  it("returns not found when the file is missing", async () => {
    mocks.artifactFindFirst.mockResolvedValue({
      mimeType: "image/png",
      path: "/missing/screenshot.png",
      type: "SCREENSHOT",
    });

    const response = await GET(
      new Request("http://localhost/api/runs/run_1/artifacts/artifact_1"),
      createContext(),
    );

    await expect(response.json()).resolves.toEqual({
      error: "Artifact file was not found.",
    });
    expect(response.status).toBe(404);
  });
});
