export const performanceSettingsLimits = {
  artifactRetentionDays: {
    default: 14,
    max: 60,
    min: 2,
  },
  historyRetentionDays: {
    default: 180,
    max: 365,
    min: 30,
  },
  workerConcurrency: {
    default: 2,
    max: 24,
    min: 1,
  },
} as const;

export type PerformanceSettingsData = {
  artifactRetentionDays: number;
  historyRetentionDays: number;
  workerConcurrency: number;
};

export const defaultPerformanceSettings: PerformanceSettingsData = {
  artifactRetentionDays: performanceSettingsLimits.artifactRetentionDays.default,
  historyRetentionDays: performanceSettingsLimits.historyRetentionDays.default,
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
    artifactRetentionDays: normalizePerformanceSettingValue(
      "artifactRetentionDays",
      value?.artifactRetentionDays,
    ),
    historyRetentionDays: normalizePerformanceSettingValue(
      "historyRetentionDays",
      value?.historyRetentionDays,
    ),
    workerConcurrency: normalizePerformanceSettingValue(
      "workerConcurrency",
      value?.workerConcurrency,
    ),
  };
}
