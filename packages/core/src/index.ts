import { z } from "zod";

export const checkTypes = ["api", "browser"] as const;
export type CheckType = (typeof checkTypes)[number];

export const checkRunStatuses = [
  "queued",
  "running",
  "passed",
  "failed",
  "timed_out",
  "cancelled",
] as const;
export type CheckRunStatus = (typeof checkRunStatuses)[number];

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

export const frequencySchema = z.object({
  intervalMinutes: z.number().int().positive(),
});
export type Frequency = z.infer<typeof frequencySchema>;

export const apiAssertionSchema = z.object({
  operator: z.string().min(1),
  source: z.string().min(1),
  target: z.unknown().optional(),
});
export type ApiAssertion = z.infer<typeof apiAssertionSchema>;

export const apiRequestSchema = z.object({
  assertions: z.array(apiAssertionSchema).default([]),
  body: z.string().optional(),
  headers: z.record(z.string()).default({}),
  method: z.string().min(1),
  url: z.string().min(1),
});
export type ApiRequest = z.infer<typeof apiRequestSchema>;

export const checkDefinitionSchema = z
  .object({
    enabled: z.boolean().default(true),
    entrypoint: z.string().optional(),
    frequency: frequencySchema.optional(),
    groupKey: z.string().optional(),
    groupName: z.string().optional(),
    key: z.string().min(1),
    name: z.string().min(1),
    request: apiRequestSchema.optional(),
    tags: z.array(z.string()).default([]),
    type: z.enum(checkTypes),
  })
  .superRefine((value, context) => {
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
  type ManifestImportOptions,
  type ManifestImportResult,
  type ParsedManifestFile,
} from "./manifest-import.js";
