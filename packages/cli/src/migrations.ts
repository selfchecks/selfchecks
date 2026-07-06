import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type ApplyDatabaseMigrationsOptions = {
  env?: NodeJS.ProcessEnv;
  logger?: Pick<Console, "error">;
  workspaceRoot?: string;
};

export async function applyDatabaseMigrations({
  env = process.env,
  logger = console,
  workspaceRoot,
}: ApplyDatabaseMigrationsOptions = {}): Promise<void> {
  if (!isAutoMigrateEnabled(env.SELFCHECKS_AUTO_MIGRATE)) {
    logger.error(
      "Skipping database migrations because SELFCHECKS_AUTO_MIGRATE is disabled.",
    );
    return;
  }

  const cwd = workspaceRoot ?? (await findWorkspaceRoot());

  logger.error("Applying database migrations before deploy.");
  await runCommand("yarn", ["db:migrate:deploy"], {
    cwd,
    env,
  });
}

export function isAutoMigrateEnabled(value: string | undefined): boolean {
  if (!value) {
    return true;
  }

  return !["0", "false", "no", "off"].includes(value.trim().toLowerCase());
}

export async function findWorkspaceRoot(startDir = moduleDirectory()): Promise<string> {
  let currentDir = startDir;

  while (true) {
    if (await hasPrismaSchema(currentDir)) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);

    if (parentDir === currentDir) {
      throw new Error(
        "Unable to find selfchecks workspace root for database migrations.",
      );
    }

    currentDir = parentDir;
  }
}

function moduleDirectory(): string {
  return path.dirname(fileURLToPath(import.meta.url));
}

async function hasPrismaSchema(directory: string): Promise<boolean> {
  try {
    await access(path.join(directory, "packages/db/prisma/schema.prisma"));
    return true;
  } catch {
    return false;
  }
}

async function runCommand(
  command: string,
  args: string[],
  {
    cwd,
    env,
  }: {
    cwd: string;
    env: NodeJS.ProcessEnv;
  },
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        ...env,
      },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const outputChunks: Buffer[] = [];

    child.stdout?.on("data", (chunk: Buffer) => outputChunks.push(chunk));
    child.stderr?.on("data", (chunk: Buffer) => outputChunks.push(chunk));

    child.on("error", reject);
    child.on("close", (exitCode) => {
      if (exitCode === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          [
            `Database migration command failed with exit code ${
              exitCode ?? "unknown"
            }.`,
            Buffer.concat(outputChunks).toString("utf8").trim(),
          ]
            .filter(Boolean)
            .join("\n"),
        ),
      );
    });
  });
}
