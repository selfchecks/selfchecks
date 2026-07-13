import {
  defaultPerformanceSettings,
  normalizePerformanceSettings,
  type PerformanceSettingsData,
} from "@selfchecks/core";
import { prisma } from "@selfchecks/db";

const GLOBAL_SETTINGS_PROJECT_SLUG = "default";

export type ReadPerformanceRuntimeSettingsOptions = {
  fallback?: PerformanceSettingsData;
  logger?: Pick<Console, "warn">;
  projectSlug?: string;
};

export async function readPerformanceRuntimeSettings({
  fallback = defaultPerformanceSettings,
  logger,
  projectSlug: _projectSlug,
}: ReadPerformanceRuntimeSettingsOptions = {}): Promise<PerformanceSettingsData> {
  try {
    const project =
      (await prisma.project.findUnique({
        select: {
          performanceSettings: {
            select: {
              artifactRetentionDays: true,
              historyRetentionDays: true,
              queuedRunTimeoutMinutes: true,
              runningRunTimeoutMinutes: true,
              testSessionTimeoutMinutes: true,
              workerConcurrency: true,
            },
          },
        },
        where: {
          slug: GLOBAL_SETTINGS_PROJECT_SLUG,
        },
      })) ??
      (await prisma.project.findFirst({
        orderBy: {
          createdAt: "desc",
        },
        select: {
          performanceSettings: {
            select: {
              artifactRetentionDays: true,
              historyRetentionDays: true,
              queuedRunTimeoutMinutes: true,
              runningRunTimeoutMinutes: true,
              testSessionTimeoutMinutes: true,
              workerConcurrency: true,
            },
          },
        },
      }));

    return normalizePerformanceSettings(project?.performanceSettings ?? fallback);
  } catch (error) {
    logger?.warn("Unable to load performance settings.", error);

    return {
      ...fallback,
    };
  }
}
