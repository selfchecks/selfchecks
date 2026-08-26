import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkFindMany: vi.fn(),
  checkRunCreate: vi.fn(),
  checkRunUpdateMany: vi.fn(),
  copyWorkspace: vi.fn(),
  getRunEnvironment: vi.fn(),
  projectFindMany: vi.fn(),
  queueAddBulk: vi.fn(),
  queueClose: vi.fn(),
  queueConstructor: vi.fn(),
  testSessionCreate: vi.fn(),
  testSessionFindFirst: vi.fn(),
  testSessionUpdate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/test-session-workspace", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/test-session-workspace")>();

  return {
    ...actual,
    cloneTestSessionWorkspace: mocks.copyWorkspace,
  };
});

vi.mock("bullmq", () => ({
  Queue: mocks.queueConstructor.mockImplementation(() => ({
    addBulk: mocks.queueAddBulk,
    close: mocks.queueClose,
  })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    check: {
      findMany: mocks.checkFindMany,
    },
    checkRun: {
      updateMany: mocks.checkRunUpdateMany,
    },
    project: {
      findMany: mocks.projectFindMany,
    },
    testSession: {
      findFirst: mocks.testSessionFindFirst,
      update: mocks.testSessionUpdate,
    },
  },
}));

vi.mock("@selfchecks/cli/environment", () => ({
  getRunEnvironment: mocks.getRunEnvironment,
}));

import { GET, POST } from "./route";

const sourceSession = {
  commitSha: "abc123",
  id: "session_1",
  jobUrl: "https://git.example/jobs/1",
  name: "Release 3.192.52",
  pipelineUrl: "https://git.example/pipelines/1",
  project: {
    slug: "account",
  },
  projectId: "project_account",
  ref: "release/3.192.52",
  repository: "frontend/account",
  runs: [
    createSessionRun({
      checkId: "check_signin",
      checkKey: "signin",
      createdAt: "2026-08-17T15:00:00.000Z",
      projectSlug: "account",
      status: "FAILED",
    }),
    createSessionRun({
      checkId: "check_signin",
      checkKey: "signin",
      createdAt: "2026-08-17T14:00:00.000Z",
      projectSlug: "account",
      status: "PASSED",
    }),
    createSessionRun({
      checkId: "check_health",
      checkKey: "health",
      createdAt: "2026-08-17T15:00:00.000Z",
      projectSlug: "api",
      status: "PASSED",
    }),
    createSessionRun({
      checkId: "check_health",
      checkKey: "health",
      createdAt: "2026-08-17T14:00:00.000Z",
      projectSlug: "api",
      status: "FAILED",
    }),
  ],
  source: "/runtime/source-session",
  status: "FAILED",
  targetUrl: "https://pr-331.app.example.test",
  workspacePath: "/runtime/test-sessions/session_1",
};

describe("test session bulk run route", () => {
  beforeEach(() => {
    let runNumber = 0;

    mocks.getRunEnvironment.mockResolvedValue([
      { name: "BASE_URL", value: "https://production.example.test" },
      { name: "TOKEN", value: "secret" },
    ]);
    mocks.copyWorkspace.mockImplementation(async (_source, sessionId) =>
      pathForClonedWorkspace(sessionId),
    );
    mocks.queueAddBulk.mockResolvedValue([]);
    mocks.queueClose.mockResolvedValue(undefined);
    mocks.checkRunCreate.mockImplementation(async () => ({
      id: `run_new_${++runNumber}`,
    }));
    mocks.testSessionCreate.mockResolvedValue({ id: "session_clone" });
    mocks.testSessionUpdate.mockResolvedValue({ id: "session_1" });
    mocks.transaction.mockImplementation(async (input) => {
      if (Array.isArray(input)) {
        return Promise.all(input);
      }

      return input({
        checkRun: {
          create: mocks.checkRunCreate,
        },
        testSession: {
          create: mocks.testSessionCreate,
          update: mocks.testSessionUpdate,
        },
      });
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("lists projects that have enabled tests", async () => {
    mocks.testSessionFindFirst.mockResolvedValue({ id: "session_1" });
    mocks.projectFindMany.mockResolvedValue([
      {
        _count: { checks: 12 },
        name: "Account",
        slug: "account",
      },
    ]);

    const response = await GET(
      new Request("http://localhost/api/test-sessions/session_1/runs"),
      createContext(),
    );

    await expect(response.json()).resolves.toEqual({
      projects: [{ checkCount: 12, name: "Account", slug: "account" }],
    });
    expect(response.status).toBe(200);
  });

  it("reruns only tests whose latest session run failed", async () => {
    vi.stubEnv("SELFCHECKS_CHECKS_ROOT", "/runtime/deployments/stable");
    mocks.testSessionFindFirst.mockResolvedValue(sourceSession);
    mocks.checkFindMany.mockResolvedValue([createCheck()]);

    const response = await POST(
      createRequest({ action: "rerun-failed" }),
      createContext(),
    );

    await expect(response.json()).resolves.toEqual({
      runCount: 1,
      sessionId: "session_1",
      status: "queued",
    });
    expect(response.status).toBe(202);
    expect(mocks.checkFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          enabled: true,
          OR: [
            {
              key: "signin",
              project: {
                slug: "account",
              },
            },
          ],
        },
      }),
    );
    expect(mocks.testSessionUpdate).toHaveBeenCalledWith({
      data: {
        aiAnalysis: expect.anything(),
        status: "RUNNING",
      },
      select: { id: true },
      where: { id: "session_1" },
    });
    expect(mocks.queueAddBulk).toHaveBeenCalledWith([
      expect.objectContaining({
        data: expect.objectContaining({
          checkId: "check_signin",
          env: expect.arrayContaining([
            { name: "BASE_URL", value: "https://pr-331.app.example.test" },
            {
              name: "PLAYWRIGHT_BASE_URL",
              value: "https://pr-331.app.example.test",
            },
            { name: "TOKEN", value: "secret" },
          ]),
          projectSlug: "account",
          rootDir: "/runtime/test-sessions/session_1",
          runId: "run_new_1",
          testSessionId: "session_1",
        }),
        name: "run-check",
        opts: { jobId: "run_new_1" },
      }),
    ]);
  });

  it("clones the source project and uses deployed roots for other projects", async () => {
    vi.stubEnv("SELFCHECKS_TEST_SESSIONS_DIR", "/runtime/test-sessions");
    mocks.testSessionFindFirst.mockResolvedValue(sourceSession);
    mocks.projectFindMany.mockResolvedValue([
      { slug: "account" },
      { slug: "x-editor" },
    ]);
    mocks.getRunEnvironment.mockImplementation(async (projectSlug) =>
      projectSlug === "x-editor"
        ? [
            {
              name: "PLAYWRIGHT_BASE_URL",
              value: "https://stable.x-editor.example.test",
            },
          ]
        : [
            { name: "BASE_URL", value: "https://production.example.test" },
            { name: "TOKEN", value: "secret" },
          ],
    );
    mocks.checkFindMany.mockResolvedValue([
      createCheck(),
      createCheck({
        deployment: {
          source: "/repo/config/x-editor",
        },
        id: "check_editor",
        key: "editor",
        name: "X Editor",
        project: { id: "project_x_editor", slug: "x-editor" },
      }),
    ]);

    const response = await POST(
      createRequest({
        action: "full-regression",
        projectSlugs: ["account", "x-editor"],
      }),
      createContext(),
    );

    await expect(response.json()).resolves.toEqual({
      runCount: 2,
      sessionId: "session_clone",
      status: "queued",
    });
    expect(mocks.testSessionCreate).toHaveBeenCalledWith({
      data: {
        commitSha: "abc123",
        jobUrl: "https://git.example/jobs/1",
        kind: "TEST",
        name: "Release 3.192.52",
        pipelineUrl: "https://git.example/pipelines/1",
        projectId: "project_account",
        ref: "release/3.192.52",
        repository: "frontend/account",
        source: "/runtime/source-session",
        status: "RUNNING",
        targetUrl: "https://pr-331.app.example.test",
        workspacePath: null,
      },
      select: { id: true },
    });
    expect(mocks.copyWorkspace).toHaveBeenCalledWith(
      "/runtime/test-sessions/session_1",
      "session_clone",
    );
    expect(mocks.testSessionUpdate).toHaveBeenCalledWith({
      data: {
        workspacePath: "/runtime/test-sessions/session_clone",
      },
      where: {
        id: "session_clone",
      },
    });
    expect(mocks.checkRunCreate).toHaveBeenCalledTimes(2);
    expect(mocks.checkRunCreate).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        checkId: "check_editor",
        checkSnapshotProjectSlug: "x-editor",
        projectId: "project_x_editor",
        testSessionId: "session_clone",
      }),
      select: { id: true },
    });
    expect(mocks.queueAddBulk).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            accounts: ["free", "actionmedia-user2"],
            env: expect.arrayContaining([
              { name: "BASE_URL", value: "https://pr-331.app.example.test" },
              {
                name: "PLAYWRIGHT_BASE_URL",
                value: "https://pr-331.app.example.test",
              },
            ]),
            projectSlug: "account",
            rootDir: "/runtime/test-sessions/session_clone",
            testSessionId: "session_clone",
          }),
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            accounts: ["free", "actionmedia-user2"],
            env: [
              {
                name: "PLAYWRIGHT_BASE_URL",
                value: "https://stable.x-editor.example.test",
              },
            ],
            projectSlug: "x-editor",
            rootDir: "/repo/config/x-editor",
            testSessionId: "session_clone",
          }),
        }),
      ]),
    );
  });

  it("refuses a full regression when another project source is unavailable", async () => {
    vi.stubEnv("SELFCHECKS_TEST_SESSIONS_DIR", "/runtime/test-sessions");
    mocks.testSessionFindFirst.mockResolvedValue(sourceSession);
    mocks.projectFindMany.mockResolvedValue([{ slug: "account" }, { slug: "api" }]);
    mocks.checkFindMany.mockResolvedValue([
      createCheck(),
      createCheck({
        deployment: { source: "" },
        id: "check_health",
        key: "health",
        name: "API health",
        project: { id: "project_api", slug: "api" },
      }),
    ]);

    const response = await POST(
      createRequest({
        action: "full-regression",
        projectSlugs: ["account", "api"],
      }),
      createContext(),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error:
        "Check source root is unknown for api/health. Redeploy checks or set SELFCHECKS_CHECKS_ROOT.",
    });
    expect(mocks.copyWorkspace).not.toHaveBeenCalled();
    expect(mocks.testSessionCreate).not.toHaveBeenCalled();
    expect(mocks.queueAddBulk).not.toHaveBeenCalled();
  });

  it("refuses a full regression when the branch workspace is unavailable", async () => {
    mocks.testSessionFindFirst.mockResolvedValue({
      ...sourceSession,
      workspacePath: null,
    });
    mocks.projectFindMany.mockResolvedValue([{ slug: "account" }]);
    mocks.checkFindMany.mockResolvedValue([createCheck()]);

    const response = await POST(
      createRequest({
        action: "full-regression",
        projectSlugs: ["account"],
      }),
      createContext(),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error:
        "The source test session workspace is unavailable. Start a new test session for this branch before running a full regression.",
    });
    expect(mocks.copyWorkspace).not.toHaveBeenCalled();
    expect(mocks.testSessionCreate).not.toHaveBeenCalled();
    expect(mocks.queueAddBulk).not.toHaveBeenCalled();
  });

  it("marks the cloned session failed when its workspace cannot be copied", async () => {
    vi.stubEnv("SELFCHECKS_TEST_SESSIONS_DIR", "/runtime/test-sessions");
    mocks.testSessionFindFirst.mockResolvedValue(sourceSession);
    mocks.projectFindMany.mockResolvedValue([{ slug: "account" }]);
    mocks.checkFindMany.mockResolvedValue([createCheck()]);
    mocks.copyWorkspace.mockRejectedValueOnce(new Error("Source directory is gone"));

    const response = await POST(
      createRequest({
        action: "full-regression",
        projectSlugs: ["account"],
      }),
      createContext(),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Unable to clone the source test session workspace.",
    });
    expect(mocks.testSessionUpdate).toHaveBeenCalledWith({
      data: {
        status: "FAILED",
      },
      where: {
        id: "session_clone",
      },
    });
    expect(mocks.checkRunUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          errorMessage: "Source directory is gone",
          status: "FAILED",
        }),
      }),
    );
    expect(mocks.queueAddBulk).not.toHaveBeenCalled();
  });

  it("requires a project for a full regression", async () => {
    const response = await POST(
      createRequest({ action: "full-regression", projectSlugs: [] }),
      createContext(),
    );

    await expect(response.json()).resolves.toEqual({
      error: "Select at least one project.",
    });
    expect(response.status).toBe(400);
    expect(mocks.testSessionFindFirst).not.toHaveBeenCalled();
  });
});

function createContext() {
  return {
    params: Promise.resolve({
      sessionId: "session_1",
    }),
  };
}

function pathForClonedWorkspace(sessionId: string) {
  return `/runtime/test-sessions/${sessionId}`;
}

function createRequest(body: unknown) {
  return new Request("http://localhost/api/test-sessions/session_1/runs", {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });
}

function createCheck(overrides: Partial<ReturnType<typeof buildCheck>> = {}) {
  return {
    ...buildCheck(),
    ...overrides,
  };
}

function buildCheck() {
  return {
    accounts: ["free", "actionmedia-user2"],
    degradedResponseTime: 10_000,
    deployment: {
      source: "/repo/config/checkly",
    },
    enabled: true,
    entrypoint: "checks/signin.spec.ts",
    group: {
      name: "Browser",
    },
    id: "check_signin",
    key: "signin",
    name: "Sign in",
    project: {
      id: "project_account",
      slug: "account",
    },
    request: null,
    tags: ["app"],
    type: "BROWSER",
  };
}

function createSessionRun({
  checkId,
  checkKey,
  createdAt,
  projectSlug,
  status,
}: {
  checkId: string;
  checkKey: string;
  createdAt: string;
  projectSlug: string;
  status: string;
}) {
  return {
    attempt: 1,
    check: {
      id: checkId,
      key: checkKey,
      project: {
        slug: projectSlug,
      },
    },
    checkSnapshotKey: checkKey,
    checkSnapshotProjectSlug: projectSlug,
    createdAt: new Date(createdAt),
    status,
  };
}
