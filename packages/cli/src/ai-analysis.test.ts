import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { Check } from "@selfchecks/db";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  projectFindUnique: vi.fn(),
}));

vi.mock("@selfchecks/db", () => ({
  prisma: {
    project: {
      findUnique: mocks.projectFindUnique,
    },
  },
}));

import { analyzeFailedCheck } from "./ai-analysis.js";
import type { CheckExecutionResult, RunChecksOptions } from "./runner.js";

const tempDirs: string[] = [];

async function createTempProject() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "selfchecks-ai-"));
  tempDirs.push(directory);
  return directory;
}

describe("AI failure analysis", () => {
  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    await Promise.all(
      tempDirs.splice(0).map((directory) =>
        rm(directory, {
          force: true,
          recursive: true,
        }),
      ),
    );
  });

  it("sends failed run context to an OpenAI-compatible chat endpoint", async () => {
    const rootDir = await createTempProject();
    const sourcePath = path.join(rootDir, "tests", "header.spec.ts");
    const logPath = path.join(rootDir, ".selfchecks", "runs", "run_1.log");
    const tracePath = path.join(rootDir, "test-results", "trace.zip");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "Селектор не найден, проверьте разметку поиска.",
              },
            },
          ],
        }),
        {
          headers: {
            "content-type": "application/json",
          },
          status: 200,
        },
      ),
    );

    await mkdir(path.dirname(sourcePath), { recursive: true });
    await mkdir(path.dirname(logPath), { recursive: true });
    await mkdir(path.dirname(tracePath), { recursive: true });
    await writeFile(
      sourcePath,
      "test('header search', async ({ page }) => { await page.getByLabel('Search').click(); });",
    );
    await writeFile(logPath, "Error: locator Search not found");
    await writeFile(tracePath, "trace payload");

    mocks.projectFindUnique.mockResolvedValue({
      aiSettings: {
        apiEndpoint: "https://openrouter.ai/api/v1",
        apiKeyCiphertext: "test-api-key",
        model: "openai/gpt-5-mini",
        responseLanguage: "Russian",
      },
    });
    vi.stubGlobal("fetch", fetchMock);

    const analysis = await analyzeFailedCheck({
      check: {
        entrypoint: "tests/header.spec.ts",
        key: "header-search",
        name: "Header search",
        request: null,
        type: "BROWSER",
      } as Check,
      options: {
        checkKeys: ["header-search"],
        env: [],
        projectSlug: "default",
        record: true,
        reporter: "line",
        rootDir,
        tagSets: [],
      } satisfies RunChecksOptions,
      result: {
        artifacts: [
          {
            mimeType: "application/zip",
            path: tracePath,
            sizeBytes: 13,
            type: "TRACE",
          },
        ],
        errorMessage: "locator Search not found",
        logsPath: logPath,
        resultJson: {
          command: "npx playwright test tests/header.spec.ts",
          exitCode: 1,
        },
        status: "failed",
      } satisfies CheckExecutionResult,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/chat/completions",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-api-key",
        }),
        method: "POST",
      }),
    );
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      messages: Array<{ content: string; role: string }>;
      model: string;
    };
    const prompt = requestBody.messages.map((message) => message.content).join("\n");

    expect(requestBody.model).toBe("openai/gpt-5-mini");
    expect(prompt).toContain("Respond in Russian");
    expect(prompt).toContain("tests/header.spec.ts");
    expect(prompt).toContain("locator Search not found");
    expect(prompt).toContain("TRACE");
    expect(analysis).toMatchObject({
      content: "Селектор не найден, проверьте разметку поиска.",
      model: "openai/gpt-5-mini",
      status: "completed",
    });
  });
});
