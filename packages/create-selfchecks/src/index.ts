import { spawn } from "node:child_process";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { createPackageJson, starterFiles } from "./templates.js";

export type CreateSelfchecksOptions = {
  install?: boolean;
  targetDir: string;
};

export type CreateSelfchecksResult = {
  installed: boolean;
  projectName: string;
  targetDir: string;
};

export async function createSelfchecksProject(
  options: CreateSelfchecksOptions,
): Promise<CreateSelfchecksResult> {
  const targetDir = path.resolve(options.targetDir);
  const projectName = normalizePackageName(path.basename(targetDir));

  await ensureEmptyDirectory(targetDir);

  const files: Record<string, string> = {
    ...starterFiles,
    "package.json": createPackageJson(projectName),
  };

  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(targetDir, relativePath);

    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content, "utf8");
  }

  const install = options.install ?? true;

  if (install) {
    await installDependencies(targetDir);
  }

  return { installed: install, projectName, targetDir };
}

async function ensureEmptyDirectory(targetDir: string): Promise<void> {
  await mkdir(targetDir, { recursive: true });
  const entries = await readdir(targetDir);

  if (entries.length > 0) {
    throw new Error(`Target directory is not empty: ${targetDir}`);
  }
}

async function installDependencies(targetDir: string): Promise<void> {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

  await new Promise<void>((resolve, reject) => {
    const child = spawn(npmCommand, ["install", "--no-audit", "--no-fund"], {
      cwd: targetDir,
      stdio: "inherit",
    });

    child.once("error", reject);
    child.once("close", (status) => {
      if (status === 0) {
        resolve();
        return;
      }

      reject(new Error(`npm install exited with status ${status ?? "unknown"}.`));
    });
  });
}

function normalizePackageName(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "");

  return normalized || "selfchecks-project";
}
