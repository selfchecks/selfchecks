import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  default: {
    spawn: mocks.spawn,
  },
  spawn: mocks.spawn,
}));

import {
  applyDatabaseMigrations,
  findWorkspaceRoot,
  isAutoMigrateEnabled,
} from "./migrations.js";

const tempDirs: string[] = [];

afterEach(async () => {
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

describe("isAutoMigrateEnabled", () => {
  it("enables automatic migrations by default", () => {
    expect(isAutoMigrateEnabled(undefined)).toBe(true);
    expect(isAutoMigrateEnabled("1")).toBe(true);
    expect(isAutoMigrateEnabled("true")).toBe(true);
  });

  it("accepts common disabled values", () => {
    expect(isAutoMigrateEnabled("0")).toBe(false);
    expect(isAutoMigrateEnabled("false")).toBe(false);
    expect(isAutoMigrateEnabled("OFF")).toBe(false);
    expect(isAutoMigrateEnabled(" no ")).toBe(false);
  });
});

describe("applyDatabaseMigrations", () => {
  it("skips migrations when automatic migrations are disabled", async () => {
    const logger = {
      error: vi.fn(),
    };

    await applyDatabaseMigrations({
      env: {
        SELFCHECKS_AUTO_MIGRATE: "false",
      },
      logger,
      workspaceRoot: "/repo",
    });

    expect(logger.error).toHaveBeenCalledWith(
      "Skipping database migrations because SELFCHECKS_AUTO_MIGRATE is disabled.",
    );
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it("runs deploy migrations from the workspace root", async () => {
    const logger = {
      error: vi.fn(),
    };
    mocks.spawn.mockReturnValue(createProcess({ exitCode: 0 }));

    await applyDatabaseMigrations({
      env: {
        DATABASE_URL: "postgresql://localhost/selfchecks",
      },
      logger,
      workspaceRoot: "/repo",
    });

    expect(logger.error).toHaveBeenCalledWith(
      "Applying database migrations before deploy.",
    );
    expect(mocks.spawn).toHaveBeenCalledWith("yarn", ["db:migrate:deploy"], {
      cwd: "/repo",
      env: expect.objectContaining({
        DATABASE_URL: "postgresql://localhost/selfchecks",
      }),
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
  });

  it("surfaces migration command output when the command fails", async () => {
    mocks.spawn.mockReturnValue(
      createProcess({
        exitCode: 1,
        stderr: "database is unavailable",
      }),
    );

    await expect(
      applyDatabaseMigrations({
        logger: {
          error: vi.fn(),
        },
        workspaceRoot: "/repo",
      }),
    ).rejects.toThrow(
      "Database migration command failed with exit code 1.\ndatabase is unavailable",
    );
  });
});

describe("findWorkspaceRoot", () => {
  it("walks up to the directory containing the Prisma schema", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "selfchecks-root-"));
    const nestedDirectory = path.join(workspaceRoot, "packages", "cli", "src");
    const prismaDirectory = path.join(workspaceRoot, "packages", "db", "prisma");
    tempDirs.push(workspaceRoot);

    await mkdir(nestedDirectory, {
      recursive: true,
    });
    await mkdir(prismaDirectory, {
      recursive: true,
    });
    await writeFile(path.join(prismaDirectory, "schema.prisma"), "datasource db {}");

    await expect(findWorkspaceRoot(nestedDirectory)).resolves.toBe(workspaceRoot);
  });
});

function createProcess({
  exitCode,
  stderr,
  stdout,
}: {
  exitCode: number | null;
  stderr?: string;
  stdout?: string;
}) {
  const child = new EventEmitter() as EventEmitter & {
    stderr: EventEmitter;
    stdout: EventEmitter;
  };
  child.stderr = new EventEmitter();
  child.stdout = new EventEmitter();

  setImmediate(() => {
    if (stdout) {
      child.stdout.emit("data", Buffer.from(stdout));
    }

    if (stderr) {
      child.stderr.emit("data", Buffer.from(stderr));
    }

    child.emit("close", exitCode);
  });

  return child;
}
