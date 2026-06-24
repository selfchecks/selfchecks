import type { CheckDefinition, DeploySummary } from "@selfchecks/core";
import { prisma, Prisma } from "@selfchecks/db";

type PrismaTransaction = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export type PersistDeployOptions = {
  deployedBy?: string;
  projectSlug: string;
  rootDir: string;
  source?: string;
  summary: DeploySummary;
};

export async function persistDeploySummary({
  deployedBy = "selfchecks deploy",
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

    const deployment = await tx.deployment.create({
      data: {
        deployedBy,
        projectId: project.id,
        source,
        summary: summary as unknown as Prisma.InputJsonValue,
      },
    });

    for (const check of summary.checks) {
      const groupId = await upsertCheckGroup(tx, project.id, check);

      await tx.check.upsert({
        create: {
          deploymentId: deployment.id,
          enabled: check.enabled,
          entrypoint: check.entrypoint,
          frequencyMinutes: check.frequency?.intervalMinutes,
          groupId,
          key: check.key,
          name: check.name,
          projectId: project.id,
          request: check.request as unknown as Prisma.InputJsonValue,
          tags: check.tags,
          type: check.type.toUpperCase() as Prisma.CheckCreateInput["type"],
        },
        update: {
          deploymentId: deployment.id,
          enabled: check.enabled,
          entrypoint: check.entrypoint,
          frequencyMinutes: check.frequency?.intervalMinutes,
          groupId,
          name: check.name,
          request: check.request as unknown as Prisma.InputJsonValue,
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

    const removed = [...existingKeys].filter((key) => !nextKeys.has(key));

    if (removed.length > 0) {
      await tx.check.deleteMany({
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
          none: {},
        },
        projectId: project.id,
      },
    });

    return {
      ...summary,
      created: summary.checks.filter((check) => !existingKeys.has(check.key)).length,
      removed: removed.length,
      updated: summary.checks.filter((check) => existingKeys.has(check.key)).length,
    };
  });
}

async function upsertCheckGroup(
  tx: PrismaTransaction,
  projectId: string,
  check: CheckDefinition,
): Promise<string | undefined> {
  if (!check.groupKey) {
    return undefined;
  }

  const group = await tx.checkGroup.upsert({
    create: {
      key: check.groupKey,
      name: check.groupName ?? check.groupKey,
      projectId,
      tags: [],
    },
    update: {
      name: check.groupName ?? check.groupKey,
    },
    where: {
      projectId_key: {
        key: check.groupKey,
        projectId,
      },
    },
  });

  return group.id;
}
