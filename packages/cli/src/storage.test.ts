import type { DeploySummary } from "@selfchecks/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkFindMany: vi.fn(),
  checkGroupDeleteMany: vi.fn(),
  checkUpdateMany: vi.fn(),
  checkGroupUpsert: vi.fn(),
  checkUpsert: vi.fn(),
  deploymentCreate: vi.fn(),
  projectUpsert: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@selfchecks/db", () => ({
  Prisma: {},
  prisma: {
    $transaction: mocks.transaction,
  },
}));

import { persistDeploySummary } from "./storage.js";

describe("persistDeploySummary", () => {
  beforeEach(() => {
    const tx = {
      check: {
        findMany: mocks.checkFindMany,
        updateMany: mocks.checkUpdateMany,
        upsert: mocks.checkUpsert,
      },
      checkGroup: {
        deleteMany: mocks.checkGroupDeleteMany,
        upsert: mocks.checkGroupUpsert,
      },
      deployment: {
        create: mocks.deploymentCreate,
      },
      project: {
        upsert: mocks.projectUpsert,
      },
    };

    mocks.transaction.mockImplementation((callback) => callback(tx));
    mocks.projectUpsert.mockResolvedValue({
      id: "project_1",
      slug: "account",
    });
    mocks.checkFindMany.mockResolvedValue([
      {
        key: "api-health",
      },
      {
        key: "old-check",
      },
    ]);
    mocks.deploymentCreate.mockResolvedValue({
      id: "deployment_1",
    });
    mocks.checkGroupUpsert.mockResolvedValue({
      id: "group_api",
    });
    mocks.checkUpsert.mockResolvedValue({});
    mocks.checkUpdateMany.mockResolvedValue({
      count: 1,
    });
    mocks.checkGroupDeleteMany.mockResolvedValue({
      count: 0,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("upserts project checks, disables stale checks when allowed, and returns fresh counters", async () => {
    const summary: DeploySummary = {
      checks: [
        {
          enabled: true,
          frequency: {
            intervalMinutes: 5,
          },
          groupKey: "api",
          groupName: "API",
          key: "api-health",
          name: "API health",
          request: {
            assertions: [],
            headers: {},
            method: "GET",
            url: "https://api.example.test/health",
          },
          tags: ["api", "smoke"],
          type: "api",
        },
        {
          enabled: false,
          entrypoint: "checks/homepage.spec.ts",
          key: "homepage",
          name: "Homepage",
          tags: ["browser"],
          type: "browser",
        },
      ],
      created: 0,
      projectSlug: "account",
      removed: 0,
      updated: 0,
      warnings: [],
    };

    await expect(
      persistDeploySummary({
        allowRemovals: true,
        deployedBy: "ci",
        projectSlug: "account",
        rootDir: "/repo",
        source: "git:abc123",
        summary,
      }),
    ).resolves.toMatchObject({
      created: 1,
      removed: 1,
      updated: 1,
    });

    expect(mocks.projectUpsert).toHaveBeenCalledWith({
      create: {
        name: "account",
        slug: "account",
      },
      update: {
        name: "account",
      },
      where: {
        slug: "account",
      },
    });
    expect(mocks.deploymentCreate).toHaveBeenCalledWith({
      data: {
        deployedBy: "ci",
        projectId: "project_1",
        source: "git:abc123",
        summary,
      },
    });
    expect(mocks.checkGroupUpsert).toHaveBeenCalledWith({
      create: {
        key: "api",
        name: "API",
        projectId: "project_1",
        tags: [],
      },
      update: {
        name: "API",
      },
      where: {
        projectId_key: {
          key: "api",
          projectId: "project_1",
        },
      },
    });
    expect(mocks.checkUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          deploymentId: "deployment_1",
          frequencyMinutes: 5,
          groupId: "group_api",
          key: "api-health",
          projectId: "project_1",
          type: "API",
        }),
        update: expect.objectContaining({
          frequencyMinutes: 5,
          groupId: "group_api",
          type: "API",
        }),
        where: {
          projectId_key: {
            key: "api-health",
            projectId: "project_1",
          },
        },
      }),
    );
    expect(mocks.checkUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          enabled: false,
          entrypoint: "checks/homepage.spec.ts",
          groupId: undefined,
          key: "homepage",
          type: "BROWSER",
        }),
      }),
    );
    expect(mocks.checkUpdateMany).toHaveBeenCalledWith({
      data: {
        enabled: false,
      },
      where: {
        key: {
          in: ["old-check"],
        },
        projectId: "project_1",
      },
    });
    expect(mocks.checkGroupDeleteMany).toHaveBeenCalledWith({
      where: {
        checks: {
          none: {
            enabled: true,
          },
        },
        projectId: "project_1",
      },
    });
  });

  it("refuses to remove stale checks by default", async () => {
    const summary: DeploySummary = {
      checks: [
        {
          enabled: true,
          frequency: {
            intervalMinutes: 5,
          },
          groupKey: "api",
          groupName: "API",
          key: "api-health",
          name: "API health",
          request: {
            assertions: [],
            headers: {},
            method: "GET",
            url: "https://api.example.test/health",
          },
          tags: ["api", "smoke"],
          type: "api",
        },
      ],
      created: 0,
      projectSlug: "account",
      removed: 0,
      updated: 0,
      warnings: [],
    };

    await expect(
      persistDeploySummary({
        deployedBy: "ci",
        projectSlug: "account",
        rootDir: "/repo",
        source: "git:abc123",
        summary,
      }),
    ).rejects.toThrow("Refusing to remove 1 stale checks without --force: old-check");

    expect(mocks.deploymentCreate).not.toHaveBeenCalled();
    expect(mocks.checkUpsert).not.toHaveBeenCalled();
    expect(mocks.checkUpdateMany).not.toHaveBeenCalled();
  });
});
