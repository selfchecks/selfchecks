import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createSelfchecksProject } from "./index.js";

describe("createSelfchecksProject", () => {
  it("creates a runnable starter project", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "create-selfchecks-"));
    const targetDir = path.join(tempRoot, "My Checks");

    const result = await createSelfchecksProject({ install: false, targetDir });
    const packageJson = JSON.parse(
      await readFile(path.join(targetDir, "package.json"), "utf8"),
    ) as { name: string; scripts: Record<string, string> };
    const spec = await readFile(
      path.join(targetDir, "checks/homepage.spec.ts"),
      "utf8",
    );
    const manifest = await readFile(
      path.join(targetDir, "checks/homepage.check.ts"),
      "utf8",
    );

    expect(result).toEqual({
      installed: false,
      projectName: "my-checks",
      targetDir,
    });
    expect(packageJson.scripts.test).toBe("playwright test");
    expect(spec).toContain("https://selfchecks.github.io/");
    expect(manifest).toContain('new BrowserCheck("selfchecks-homepage"');
  });

  it("does not overwrite an existing project", async () => {
    const targetDir = await mkdtemp(path.join(os.tmpdir(), "create-selfchecks-"));

    await writeFile(path.join(targetDir, "existing.txt"), "keep", "utf8");

    await expect(
      createSelfchecksProject({ install: false, targetDir }),
    ).rejects.toThrow("Target directory is not empty");
  });
});
