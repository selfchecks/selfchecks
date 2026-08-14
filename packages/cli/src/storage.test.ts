import type { ManifestImportResult } from "@selfchecks/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkFindMany: vi.fn(),
  checkGroupDeleteMany: vi.fn(),
  checkGroupWebhookCreateMany: vi.fn(),
  checkGroupWebhookDeleteMany: vi.fn(),
  checkUpdateMany: vi.fn(),
  checkGroupUpsert: vi.fn(),
  checkUpsert: vi.fn(),
  deploymentCreate: vi.fn(),
  projectUpsert: vi.fn(),
  transaction: vi.fn(),
  webhookEndpointUpdateMany: vi.fn(),
  webhookEndpointUpsert: vi.fn(),
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
      checkGroupWebhookEndpoint: {
        createMany: mocks.checkGroupWebhookCreateMany,
        deleteMany: mocks.checkGroupWebhookDeleteMany,
      },
      deployment: {
        create: mocks.deploymentCreate,
      },
      project: {
        upsert: mocks.projectUpsert,
      },
      webhookEndpoint: {
        updateMany: mocks.webhookEndpointUpdateMany,
        upsert: mocks.webhookEndpointUpsert,
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
    mocks.webhookEndpointUpsert.mockResolvedValue({
      id: "webhook_1",
    });
    mocks.webhookEndpointUpdateMany.mockResolvedValue({ count: 0 });
    mocks.checkGroupWebhookCreateMany.mockResolvedValue({ count: 1 });
    mocks.checkGroupWebhookDeleteMany.mockResolvedValue({ count: 0 });
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
    const summary: ManifestImportResult = {
      alertChannels: [
        {
          adapter: "generic",
          logicalId: "RocketChatFail",
          method: "POST",
          name: "RocketChatFail",
          sendDegraded: false,
          sendFailure: true,
          sendRecovery: false,
          sslExpiry: false,
          template: '{"text":"{{ALERT_TITLE}}"}',
          url: "https://chat.example.test/hooks/unit-test",
        },
      ],
      checks: [
        {
          alertChannelLogicalIds: ["RocketChatFail"],
          degradedResponseTime: 2500,
          enabled: true,
          frequency: {
            intervalMinutes: 5,
          },
          groupKey: "api",
          groupName: "API",
          key: "api-health",
          maxResponseTime: 5000,
          muted: true,
          name: "API health",
          request: {
            assertions: [],
            headers: {},
            method: "GET",
            url: "https://api.example.test/health",
          },
          tags: ["api", "smoke"],
          shouldFail: true,
          type: "api",
        },
        {
          alertChannelLogicalIds: [],
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
        summary: {
          checks: expect.arrayContaining([
            expect.objectContaining({
              key: "api-health",
              maxResponseTime: 5000,
              muted: true,
              shouldFail: true,
            }),
            expect.objectContaining({
              key: "homepage",
              muted: false,
              shouldFail: false,
            }),
          ]),
          created: 0,
          projectSlug: "account",
          removed: 0,
          updated: 0,
          warnings: [],
        },
      },
    });
    expect(JSON.stringify(mocks.deploymentCreate.mock.calls[0]?.[0])).not.toContain(
      "chat.example.test",
    );
    expect(mocks.webhookEndpointUpsert).toHaveBeenCalledWith({
      create: expect.objectContaining({
        logicalId: "RocketChatFail",
        projectId: "project_1",
        source: "MANIFEST",
        urlCiphertext: expect.stringMatching(/^v1:/),
      }),
      update: expect.objectContaining({
        enabled: true,
        sendFailure: true,
        sendRecovery: false,
        urlCiphertext: expect.stringMatching(/^v1:/),
      }),
      where: {
        projectId_logicalId: {
          logicalId: "RocketChatFail",
          projectId: "project_1",
        },
      },
    });
    expect(mocks.webhookEndpointUpdateMany).toHaveBeenCalledWith({
      data: {
        enabled: false,
      },
      where: {
        logicalId: {
          notIn: ["RocketChatFail"],
        },
        projectId: "project_1",
        source: "MANIFEST",
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
    expect(mocks.checkGroupWebhookDeleteMany).toHaveBeenCalledWith({
      where: {
        checkGroupId: "group_api",
        webhookEndpoint: {
          source: "MANIFEST",
        },
        webhookEndpointId: {
          notIn: ["webhook_1"],
        },
      },
    });
    expect(mocks.checkGroupWebhookCreateMany).toHaveBeenCalledWith({
      data: [
        {
          checkGroupId: "group_api",
          webhookEndpointId: "webhook_1",
        },
      ],
      skipDuplicates: true,
    });
    expect(mocks.checkUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          degradedResponseTime: 2500,
          deploymentId: "deployment_1",
          frequencyMinutes: 5,
          groupId: "group_api",
          key: "api-health",
          maxResponseTime: 5000,
          muted: true,
          projectId: "project_1",
          shouldFail: true,
          type: "API",
        }),
        update: expect.objectContaining({
          degradedResponseTime: 2500,
          frequencyMinutes: 5,
          groupId: "group_api",
          maxResponseTime: 5000,
          muted: true,
          shouldFail: true,
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
    const summary: ManifestImportResult = {
      alertChannels: [],
      checks: [
        {
          alertChannelLogicalIds: [],
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
