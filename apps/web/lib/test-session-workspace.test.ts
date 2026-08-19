import { describe, expect, it, vi } from "vitest";

import {
  cloneTestSessionWorkspace,
  resolveTestSessionSourceWorkspace,
} from "./test-session-workspace";

describe("test session workspace", () => {
  it("accepts only source workspaces inside the configured sessions root", () => {
    expect(
      resolveTestSessionSourceWorkspace("/runtime/test-sessions/session_1", {
        testSessionsRoot: "/runtime/test-sessions",
      }),
    ).toBe("/runtime/test-sessions/session_1");
    expect(
      resolveTestSessionSourceWorkspace("/runtime/deployments/stable", {
        testSessionsRoot: "/runtime/test-sessions",
      }),
    ).toBeUndefined();
    expect(
      resolveTestSessionSourceWorkspace(null, {
        testSessionsRoot: "/runtime/test-sessions",
      }),
    ).toBeUndefined();
  });

  it("copies a source workspace into a directory owned by the cloned session", async () => {
    const copyDirectory = vi.fn().mockResolvedValue(undefined);
    const createDirectory = vi.fn().mockResolvedValue(undefined);

    await expect(
      cloneTestSessionWorkspace("/runtime/test-sessions/session_1", "session_clone", {
        fileSystem: {
          copyDirectory,
          createDirectory,
        },
        testSessionsRoot: "/runtime/test-sessions",
      }),
    ).resolves.toBe("/runtime/test-sessions/session_clone");
    expect(createDirectory).toHaveBeenCalledWith("/runtime/test-sessions", {
      recursive: true,
    });
    expect(copyDirectory).toHaveBeenCalledWith(
      "/runtime/test-sessions/session_1",
      "/runtime/test-sessions/session_clone",
      {
        errorOnExist: true,
        force: false,
        recursive: true,
      },
    );
  });
});
