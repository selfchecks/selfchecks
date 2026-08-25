import { z } from "zod";

export {
  browserTraceModes,
  defaultBrowserRunTimeoutMs,
  resolveBrowserTraceModeConfig,
  resolveBrowserTraceModeForAttempt,
  resolveBrowserRunTimeoutConfig,
  type BrowserTraceMode,
  type BrowserTraceModeConfig,
  type BrowserRunTimeoutConfig,
} from "./browser-run-config.js";

export {
  defaultPerformanceSettings,
  normalizePerformanceSettingValue,
  normalizePerformanceSettings,
  performanceSettingsLimits,
  type PerformanceSettingsData,
} from "./performance-settings.js";

export const checkTypes = ["api", "browser"] as const;
export type CheckType = (typeof checkTypes)[number];
export const defaultDegradedResponseTimeMs = 10_000;

export const checkRunStatuses = [
  "queued",
  "running",
  "passed",
  "failed",
  "timed_out",
  "cancelled",
] as const;
export type CheckRunStatus = (typeof checkRunStatuses)[number];

export type PersistedCheckRunStatus =
  | "CANCELLED"
  | "FAILED"
  | "PASSED"
  | "QUEUED"
  | "RUNNING"
  | "TIMED_OUT";

export function summarizeTerminalRunStatuses(
  statuses: readonly string[],
): Exclude<PersistedCheckRunStatus, "QUEUED" | "RUNNING"> | undefined {
  if (
    statuses.length === 0 ||
    statuses.some((status) => status === "QUEUED" || status === "RUNNING")
  ) {
    return undefined;
  }

  if (statuses.every((status) => status === "PASSED")) {
    return "PASSED";
  }

  if (statuses.some((status) => status === "TIMED_OUT")) {
    return "TIMED_OUT";
  }

  return statuses.some((status) => status === "CANCELLED") ? "CANCELLED" : "FAILED";
}

export const defaultCheckQueueName = "selfchecks-checks";

export function normalizeCheckQueueName(value: string | undefined): string {
  const queueName = value?.trim() || defaultCheckQueueName;

  if (queueName.includes(":")) {
    throw new Error(
      'SELFCHECKS_QUEUE_NAME cannot contain ":" because BullMQ reserves it for Redis keys. Use "-" or "_" instead.',
    );
  }

  return queueName;
}

export const artifactTypes = [
  "log",
  "screenshot",
  "trace",
  "video",
  "request_response",
  "json",
] as const;
export type ArtifactType = (typeof artifactTypes)[number];

export const webhookAdapters = ["generic", "rocket-chat"] as const;
export type WebhookAdapter = (typeof webhookAdapters)[number];

export const webhookEvents = [
  "check.failed",
  "check.recovered",
  "check.failure_streak",
] as const;
export type WebhookEvent = (typeof webhookEvents)[number];

export const webhookMethods = ["DELETE", "GET", "PATCH", "POST", "PUT"] as const;
export type WebhookMethod = (typeof webhookMethods)[number];

export const webhookAlertChannelSchema = z.object({
  adapter: z.enum(webhookAdapters).default("generic"),
  logicalId: z.string().min(1),
  method: z.enum(webhookMethods).default("POST"),
  name: z.string().min(1),
  sendDegraded: z.boolean().default(false),
  sendFailure: z.boolean().default(true),
  sendRecovery: z.boolean().default(true),
  sslExpiry: z.boolean().default(false),
  template: z.string().optional(),
  url: z
    .string()
    .url()
    .refine((value) => value.startsWith("http://") || value.startsWith("https://"), {
      message: "Webhook URLs must use HTTP or HTTPS.",
    }),
});
export type WebhookAlertChannelDefinition = z.infer<typeof webhookAlertChannelSchema>;

export const frequencySchema = z.object({
  intervalMinutes: z.number().int().positive(),
});
export type Frequency = z.infer<typeof frequencySchema>;

export const retryStrategyTypes = [
  "NO_RETRIES",
  "SINGLE_RETRY",
  "FIXED",
  "LINEAR",
  "EXPONENTIAL",
] as const;
export type RetryStrategyType = (typeof retryStrategyTypes)[number];

export const retryStrategySchema = z.object({
  baseBackoffSeconds: z.number().int().nonnegative().optional(),
  maxDurationSeconds: z.number().int().positive().optional(),
  maxRetries: z.number().int().min(0).max(10).optional(),
  onlyOn: z.union([z.literal("NETWORK_ERROR"), z.array(z.string().min(1))]).optional(),
  sameRegion: z.boolean().optional(),
  type: z.enum(retryStrategyTypes),
});
export type RetryStrategy = z.infer<typeof retryStrategySchema>;

export const apiAssertionSchema = z
  .object({
    comparison: z.string().min(1).optional(),
    operator: z.string().min(1).optional(),
    property: z.string().optional(),
    regex: z.string().nullable().optional(),
    source: z.string().min(1),
    target: z.unknown().optional(),
  })
  .superRefine((value, context) => {
    if (!value.comparison && !value.operator) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "API assertions require a comparison.",
        path: ["comparison"],
      });
    }
  });
export type ApiAssertion = z.infer<typeof apiAssertionSchema>;

export const apiRequestSchema = z.object({
  assertions: z.array(apiAssertionSchema).default([]),
  basicAuth: z
    .object({
      password: z.string(),
      username: z.string(),
    })
    .optional(),
  body: z.string().optional(),
  bodyType: z.enum(["FORM", "GRAPHQL", "JSON", "NONE", "RAW"]).optional(),
  followRedirects: z.boolean().optional(),
  headers: z.record(z.string()).default({}),
  method: z
    .string()
    .min(1)
    .transform((value) => value.toUpperCase()),
  queryParameters: z.record(z.string()).default({}),
  url: z.string().min(1),
});
export type ApiRequest = z.infer<typeof apiRequestSchema>;

export const checkDefinitionSchema = z
  .object({
    accounts: z
      .array(z.string().trim().min(1))
      .default([])
      .transform((accounts) => [...new Set(accounts)]),
    alertChannelLogicalIds: z.array(z.string().min(1)).default([]),
    degradedResponseTime: z.number().int().nonnegative().optional(),
    enabled: z.boolean().default(true),
    entrypoint: z.string().optional(),
    frequency: frequencySchema.optional(),
    groupKey: z.string().optional(),
    groupName: z.string().optional(),
    key: z.string().min(1),
    maxResponseTime: z.number().int().nonnegative().optional(),
    muted: z.boolean().default(false),
    name: z.string().min(1),
    request: apiRequestSchema.optional(),
    retryStrategy: retryStrategySchema.optional(),
    shouldFail: z.boolean().default(false),
    tags: z.array(z.string()).default([]),
    type: z.enum(checkTypes),
  })
  .superRefine((value, context) => {
    if (value.type === "api" && value.accounts.length > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Only browser checks can require accounts.",
        path: ["accounts"],
      });
    }

    if (value.type === "api" && !value.request) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "API checks require a request definition.",
        path: ["request"],
      });
    }

    if (value.type === "browser" && !value.entrypoint) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Browser checks require a Playwright entrypoint.",
        path: ["entrypoint"],
      });
    }
  });
export type CheckDefinition = z.infer<typeof checkDefinitionSchema>;

export const deploymentManifestSchema = z.object({
  alertChannels: z.array(webhookAlertChannelSchema).default([]),
  checks: z.array(checkDefinitionSchema),
  project: z.object({
    logicalId: z.string().min(1),
    name: z.string().min(1),
  }),
  version: z.literal(1),
  warnings: z.array(z.string()).default([]),
});
export type DeploymentManifest = z.infer<typeof deploymentManifestSchema>;

export function manifestToImportResult(
  manifest: DeploymentManifest,
  projectSlug: string,
) {
  return {
    alertChannels: manifest.alertChannels,
    checks: manifest.checks,
    created: manifest.checks.length,
    projectSlug,
    removed: 0,
    updated: 0,
    warnings: manifest.warnings,
  };
}

export const deploySummarySchema = z.object({
  checks: z.array(checkDefinitionSchema),
  created: z.number().int().nonnegative(),
  projectSlug: z.string().min(1),
  removed: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  warnings: z.array(z.string()).default([]),
});
export type DeploySummary = z.infer<typeof deploySummarySchema>;

export type WebhookPayload = {
  checkKey: string;
  checkName: string;
  event: WebhookEvent;
  projectSlug: string;
  runId: string;
  runUrl?: string;
  status: CheckRunStatus;
  summary: string;
};

export function normalizeTags(tags: Iterable<string>): string[] {
  return [...new Set([...tags].map((tag) => tag.trim()).filter(Boolean))].sort();
}

export function getCheckIdentity(projectSlug: string, checkKey: string): string {
  return `${projectSlug}:${checkKey}`;
}

export {
  findCheckManifestFiles,
  importCheckDefinitions,
  parseCheckManifestFile,
  parseCheckManifestSource,
  toDeploySummary,
  type ManifestImportOptions,
  type ManifestImportResult,
  type ParsedManifestFile,
} from "./manifest-import.js";

export {
  decryptSecretValue,
  encryptSecretValue,
  type SecretStoreEnv,
} from "./secret-store.js";
