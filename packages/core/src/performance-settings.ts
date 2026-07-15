export const performanceSettingsLimits = {
  failedArtifactRetentionDays: {
    default: 14,
    max: 60,
    min: 2,
  },
  passedArtifactRetentionDays: {
    default: 14,
    max: 60,
    min: 2,
  },
  historyRetentionDays: {
    default: 180,
    max: 365,
    min: 30,
  },
  queuedRunTimeoutMinutes: {
    default: 30,
    max: 120,
    min: 10,
  },
  runningRunTimeoutMinutes: {
    default: 120,
    max: 240,
    min: 10,
  },
  testSessionTimeoutMinutes: {
    default: 30,
    max: 60,
    min: 10,
  },
  testSessionWorkspaceRetentionDays: {
    default: 14,
    max: 60,
    min: 2,
  },
  workerConcurrency: {
    default: 2,
    max: 24,
    min: 1,
  },
} as const;

export type PerformanceSettingsData = {
  failedArtifactRetentionDays: number;
  historyRetentionDays: number;
  passedArtifactRetentionDays: number;
  queuedRunTimeoutMinutes: number;
  runningRunTimeoutMinutes: number;
  testSessionTimeoutMinutes: number;
  testSessionWorkspaceRetentionDays: number;
  workerConcurrency: number;
};

export const defaultPerformanceSettings: PerformanceSettingsData = {
  failedArtifactRetentionDays:
    performanceSettingsLimits.failedArtifactRetentionDays.default,
  historyRetentionDays: performanceSettingsLimits.historyRetentionDays.default,
  passedArtifactRetentionDays:
    performanceSettingsLimits.passedArtifactRetentionDays.default,
  queuedRunTimeoutMinutes: performanceSettingsLimits.queuedRunTimeoutMinutes.default,
  runningRunTimeoutMinutes: performanceSettingsLimits.runningRunTimeoutMinutes.default,
  testSessionTimeoutMinutes:
    performanceSettingsLimits.testSessionTimeoutMinutes.default,
  testSessionWorkspaceRetentionDays:
    performanceSettingsLimits.testSessionWorkspaceRetentionDays.default,
  workerConcurrency: performanceSettingsLimits.workerConcurrency.default,
};

export function normalizePerformanceSettingValue(
  key: keyof PerformanceSettingsData,
  value: unknown,
): number {
  const limits = performanceSettingsLimits[key];
  const parsedValue =
    typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);

  if (!Number.isSafeInteger(parsedValue)) {
    return limits.default;
  }

  return Math.min(limits.max, Math.max(limits.min, parsedValue));
}

export function normalizePerformanceSettings(
  value: Partial<PerformanceSettingsData> | null | undefined,
): PerformanceSettingsData {
  return {
    failedArtifactRetentionDays: normalizePerformanceSettingValue(
      "failedArtifactRetentionDays",
      value?.failedArtifactRetentionDays,
    ),
    historyRetentionDays: normalizePerformanceSettingValue(
      "historyRetentionDays",
      value?.historyRetentionDays,
    ),
    passedArtifactRetentionDays: normalizePerformanceSettingValue(
      "passedArtifactRetentionDays",
      value?.passedArtifactRetentionDays,
    ),
    queuedRunTimeoutMinutes: normalizePerformanceSettingValue(
      "queuedRunTimeoutMinutes",
      value?.queuedRunTimeoutMinutes,
    ),
    runningRunTimeoutMinutes: normalizePerformanceSettingValue(
      "runningRunTimeoutMinutes",
      value?.runningRunTimeoutMinutes,
    ),
    testSessionTimeoutMinutes: normalizePerformanceSettingValue(
      "testSessionTimeoutMinutes",
      value?.testSessionTimeoutMinutes,
    ),
    testSessionWorkspaceRetentionDays: normalizePerformanceSettingValue(
      "testSessionWorkspaceRetentionDays",
      value?.testSessionWorkspaceRetentionDays,
    ),
    workerConcurrency: normalizePerformanceSettingValue(
      "workerConcurrency",
      value?.workerConcurrency,
    ),
  };
}
