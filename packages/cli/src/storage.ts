import {
  encryptSecretValue,
  toDeploySummary,
  type CheckDefinition,
  type DeploySummary,
  type ManifestImportResult,
  type WebhookAlertChannelDefinition,
} from "@selfchecks/core";
import { prisma, Prisma } from "@selfchecks/db";

type PrismaTransaction = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export type PersistDeployOptions = {
  allowRemovals?: boolean;
  deployedBy?: string;
  gitRef?: string;
  gitSha?: string;
  projectSlug: string;
  rootDir: string;
  source?: string;
  summary: ManifestImportResult;
};

type PersistedGroupDefinition = Pick<
  CheckDefinition,
  "alertChannelLogicalIds" | "groupKey" | "groupName"
> & {
  groupKey: string;
};

export async function persistDeploySummary({
  allowRemovals = false,
  deployedBy = "selfchecks deploy",
  gitRef,
  gitSha,
  projectSlug,
  rootDir,
  source = rootDir,
  summary,
}: PersistDeployOptions): Promise<DeploySummary> {
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.upsert({
      create: {
        name: projectSlug,
        slug: projectSlug,
      },
      update: {
        name: projectSlug,
      },
      where: {
        slug: projectSlug,
      },
    });

    const existingChecks = await tx.check.findMany({
      select: {
        key: true,
      },
      where: {
        projectId: project.id,
      },
    });
    const existingKeys = new Set(existingChecks.map((check) => check.key));
    const nextKeys = new Set(summary.checks.map((check) => check.key));
    const removed = [...existingKeys].filter((key) => !nextKeys.has(key));
    const publicSummary = toDeploySummary(summary);

    if (removed.length > 0 && !allowRemovals) {
      const preview = removed.slice(0, 10).join(", ");
      const suffix = removed.length > 10 ? `, and ${removed.length - 10} more` : "";

      throw new Error(
        `Refusing to remove ${removed.length} stale checks without --force: ${preview}${suffix}`,
      );
    }

    const deployment = await tx.deployment.create({
      data: {
        deployedBy,
        ...(gitRef ? { gitRef } : {}),
        ...(gitSha ? { gitSha } : {}),
        projectId: project.id,
        source,
        summary: publicSummary as unknown as Prisma.InputJsonValue,
      },
    });

    const webhookEndpoints = await upsertManifestWebhookEndpoints(
      tx,
      project.id,
      summary.alertChannels,
    );
    const groupIds = new Map<string, string>();

    for (const group of collectGroupDefinitions(summary.checks)) {
      const groupId = await upsertCheckGroup(tx, project.id, group, webhookEndpoints);

      groupIds.set(group.groupKey, groupId);
    }

    for (const check of summary.checks) {
      const groupId = check.groupKey ? groupIds.get(check.groupKey) : undefined;

      await tx.check.upsert({
        create: {
          accounts: check.accounts,
          degradedResponseTime: check.degradedResponseTime,
          deploymentId: deployment.id,
          enabled: check.enabled,
          entrypoint: check.entrypoint,
          frequencyMinutes: check.frequency?.intervalMinutes,
          groupId,
          key: check.key,
          maxResponseTime: check.maxResponseTime,
          muted: check.muted,
          name: check.name,
          projectId: project.id,
          request: check.request as unknown as Prisma.InputJsonValue,
          retryStrategy: check.retryStrategy as unknown as Prisma.InputJsonValue,
          shouldFail: check.shouldFail,
          tags: check.tags,
          type: check.type.toUpperCase() as Prisma.CheckCreateInput["type"],
        },
        update: {
          accounts: check.accounts,
          degradedResponseTime: check.degradedResponseTime,
          deploymentId: deployment.id,
          enabled: check.enabled,
          entrypoint: check.entrypoint,
          frequencyMinutes: check.frequency?.intervalMinutes,
          groupId,
          maxResponseTime: check.maxResponseTime,
          muted: check.muted,
          name: check.name,
          request: check.request as unknown as Prisma.InputJsonValue,
          retryStrategy: check.retryStrategy as unknown as Prisma.InputJsonValue,
          shouldFail: check.shouldFail,
          tags: check.tags,
          type: check.type.toUpperCase() as Prisma.CheckUpdateInput["type"],
        },
        where: {
          projectId_key: {
            key: check.key,
            projectId: project.id,
          },
        },
      });
    }

    if (removed.length > 0) {
      await tx.check.updateMany({
        data: {
          enabled: false,
        },
        where: {
          key: {
            in: removed,
          },
          projectId: project.id,
        },
      });
    }

    await tx.checkGroup.deleteMany({
      where: {
        checks: {
          none: {
            enabled: true,
          },
        },
        projectId: project.id,
      },
    });

    return {
      ...publicSummary,
      created: summary.checks.filter((check) => !existingKeys.has(check.key)).length,
      removed: removed.length,
      updated: summary.checks.filter((check) => existingKeys.has(check.key)).length,
    };
  });
}

function collectGroupDefinitions(
  checks: CheckDefinition[],
): PersistedGroupDefinition[] {
  const groups = new Map<string, PersistedGroupDefinition>();

  for (const check of checks) {
    if (!check.groupKey) {
      continue;
    }

    const existing = groups.get(check.groupKey);

    groups.set(check.groupKey, {
      alertChannelLogicalIds: [
        ...new Set([
          ...(existing?.alertChannelLogicalIds ?? []),
          ...check.alertChannelLogicalIds,
        ]),
      ],
      groupKey: check.groupKey,
      groupName: check.groupName ?? existing?.groupName,
    });
  }

  return [...groups.values()];
}

async function upsertManifestWebhookEndpoints(
  tx: PrismaTransaction,
  projectId: string,
  channels: WebhookAlertChannelDefinition[],
): Promise<Map<string, string>> {
  const endpoints = new Map<string, string>();

  for (const channel of channels) {
    const endpoint = await tx.webhookEndpoint.upsert({
      create: {
        adapter: toPrismaWebhookAdapter(channel.adapter),
        enabled: true,
        logicalId: channel.logicalId,
        method: channel.method,
        name: channel.name,
        projectId,
        sendDegraded: channel.sendDegraded,
        sendFailure: channel.sendFailure,
        sendRecovery: channel.sendRecovery,
        source: "MANIFEST",
        sslExpiry: channel.sslExpiry,
        template: channel.template,
        urlCiphertext: encryptSecretValue(channel.url),
      },
      update: {
        adapter: toPrismaWebhookAdapter(channel.adapter),
        enabled: true,
        method: channel.method,
        name: channel.name,
        sendDegraded: channel.sendDegraded,
        sendFailure: channel.sendFailure,
        sendRecovery: channel.sendRecovery,
        source: "MANIFEST",
        sslExpiry: channel.sslExpiry,
        template: channel.template,
        urlCiphertext: encryptSecretValue(channel.url),
      },
      where: {
        projectId_logicalId: {
          logicalId: channel.logicalId,
          projectId,
        },
      },
    });

    endpoints.set(channel.logicalId, endpoint.id);
  }

  await tx.webhookEndpoint.updateMany({
    data: {
      enabled: false,
    },
    where: {
      projectId,
      source: "MANIFEST",
      ...(channels.length > 0
        ? {
            logicalId: {
              notIn: channels.map((channel) => channel.logicalId),
            },
          }
        : {}),
    },
  });

  return endpoints;
}

function toPrismaWebhookAdapter(
  adapter: WebhookAlertChannelDefinition["adapter"],
): Prisma.WebhookEndpointCreateInput["adapter"] {
  return adapter === "rocket-chat" ? "ROCKET_CHAT" : "GENERIC";
}

async function upsertCheckGroup(
  tx: PrismaTransaction,
  projectId: string,
  groupDefinition: PersistedGroupDefinition,
  webhookEndpoints: Map<string, string>,
): Promise<string> {
  const group = await tx.checkGroup.upsert({
    create: {
      key: groupDefinition.groupKey,
      name: groupDefinition.groupName ?? groupDefinition.groupKey,
      projectId,
      tags: [],
    },
    update: {
      name: groupDefinition.groupName ?? groupDefinition.groupKey,
    },
    where: {
      projectId_key: {
        key: groupDefinition.groupKey,
        projectId,
      },
    },
  });

  const endpointIds = groupDefinition.alertChannelLogicalIds.flatMap((logicalId) => {
    const endpointId = webhookEndpoints.get(logicalId);

    return endpointId ? [endpointId] : [];
  });

  await tx.checkGroupWebhookEndpoint.deleteMany({
    where: {
      checkGroupId: group.id,
      webhookEndpoint: {
        source: "MANIFEST",
      },
      ...(endpointIds.length > 0
        ? {
            webhookEndpointId: {
              notIn: endpointIds,
            },
          }
        : {}),
    },
  });

  if (endpointIds.length > 0) {
    await tx.checkGroupWebhookEndpoint.createMany({
      data: endpointIds.map((webhookEndpointId) => ({
        checkGroupId: group.id,
        webhookEndpointId,
      })),
      skipDuplicates: true,
    });
  }

  return group.id;
}
