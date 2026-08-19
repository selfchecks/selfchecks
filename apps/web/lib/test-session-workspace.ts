import { cp, mkdir } from "node:fs/promises";
import path from "node:path";

type WorkspaceFileSystem = {
  copyDirectory: typeof cp;
  createDirectory: typeof mkdir;
};

type WorkspaceOptions = {
  fileSystem?: WorkspaceFileSystem;
  testSessionsRoot?: string;
};

const defaultFileSystem: WorkspaceFileSystem = {
  copyDirectory: cp,
  createDirectory: mkdir,
};

export function resolveTestSessionSourceWorkspace(
  workspacePath: string | null,
  options: Pick<WorkspaceOptions, "testSessionsRoot"> = {},
) {
  const value = workspacePath?.trim();

  if (!value) {
    return undefined;
  }

  const root = path.resolve(options.testSessionsRoot ?? resolveTestSessionsRoot());
  const source = path.resolve(value);

  return source.startsWith(`${root}${path.sep}`) ? source : undefined;
}

export async function cloneTestSessionWorkspace(
  source: string,
  sessionId: string,
  options: WorkspaceOptions = {},
) {
  const root = path.resolve(options.testSessionsRoot ?? resolveTestSessionsRoot());
  const destination = path.join(root, sessionId);
  const fileSystem = options.fileSystem ?? defaultFileSystem;

  await fileSystem.createDirectory(root, { recursive: true });
  await fileSystem.copyDirectory(source, destination, {
    errorOnExist: true,
    force: false,
    recursive: true,
  });

  return destination;
}

function resolveTestSessionsRoot() {
  return (
    process.env.SELFCHECKS_TEST_SESSIONS_DIR?.trim() || "/app/runtime/test-sessions"
  );
}
