import { readFile } from "node:fs/promises";

import {
  decryptSecretValue,
  type CheckRunStatus,
  type WebhookEvent,
  type WebhookPayload,
} from "@selfchecks/core";
import { prisma, Prisma } from "@selfchecks/db";

export type NotificationRuntimeEnv = {
  [key: string]: string | undefined;
  NEXTAUTH_URL?: string;
  SELFCHECKS_CONFIG_PATH?: string;
  SELFCHECKS_PUBLIC_URL?: string;
  SELFCHECKS_WEBHOOK_TIMEOUT_MS?: string;
};

export type NotificationLogger = Pick<Console, "warn">;

type DeliverRunNotificationsOptions = {
  env?: NotificationRuntimeEnv;
  fetchImpl?: typeof fetch;
  logger?: NotificationLogger;
  readFileImpl?: typeof readFile;
};

const failureStatuses = ["FAILED", "TIMED_OUT"] as const;
const monitoringTerminalStatuses = ["FAILED", "PASSED", "TIMED_OUT"] as const;
const defaultWebhookTimeoutMs = 5_000;
const maxWebhookTimeoutMs = 60_000;

export async function deliverRunNotifications(
  runId: string,
  {
    env = process.env,
    fetchImpl = fetch,
    logger = console,
    readFileImpl = readFile,
  }: DeliverRunNotificationsOptions = {},
): Promise<void> {
  try {
    const run = await prisma.checkRun.findUnique({
      include: {
        check: {
          include: {
            group: {
              include: {
                webhookEndpoints: {
                  include: {
                    webhookEndpoint: true,
                  },
                },
              },
            },
          },
        },
        project: true,
        testSession: true,
      },
      where: {
        id: runId,
      },
    });

    if (
      !run?.check ||
      !run.check.group ||
      run.testSession?.kind === "TEST" ||
      run.runSource === "MANUAL" ||
      !isMonitoringTerminalStatus(run.status)
    ) {
      return;
    }

    const retryGroupId = run.retryGroupId ?? run.id;
    const previousRun = await prisma.checkRun.findFirst({
      orderBy: [{ createdAt: "desc" }, { attempt: "desc" }],
      select: {
        status: true,
      },
      where: {
        AND: [
          {
            OR: [
              { retryGroupId: null },
              {
                retryGroupId: {
                  not: retryGroupId,
                },
              },
            ],
          },
          {
            OR: [
              { testSessionId: null },
              {
                testSession: {
                  is: {
                    kind: "TRIGGER",
                  },
                },
              },
            ],
          },
          {
            OR: [{ runSource: null }, { runSource: { not: "MANUAL" } }],
          },
        ],
        checkId: run.checkId,
        id: {
          not: run.id,
        },
        status: {
          in: [...monitoringTerminalStatuses],
        },
      },
    });
    const event = resolveWebhookEvent(run.status, previousRun?.status);

    if (!event) {
      return;
    }

    const publicUrl = await resolveSelfchecksPublicUrl(env, readFileImpl);
    const runUrl = publicUrl
      ? `${publicUrl}/checks/${encodeURIComponent(run.check.id)}/runs/${encodeURIComponent(run.id)}`
      : undefined;
    const status = run.status.toLowerCase() as CheckRunStatus;
    const payload: WebhookPayload = {
      checkKey: run.check.key,
      checkName: run.check.name,
      event,
      projectSlug: run.project.slug,
      runId: run.id,
      runUrl,
      status,
      summary:
        event === "check.recovered"
          ? `${run.check.name} recovered`
          : `${run.check.name} failed`,
    };
    const endpoints = run.check.group.webhookEndpoints
      .map((link) => link.webhookEndpoint)
      .filter(
        (endpoint) =>
          endpoint.enabled &&
          (event === "check.failed" ? endpoint.sendFailure : endpoint.sendRecovery),
      );

    await Promise.all(
      endpoints.map((endpoint) =>
        deliverWebhookNotification(
          {
            endpoint,
            groupName: run.check?.group?.name ?? "",
            payload,
            projectId: run.projectId,
            runId: run.id,
          },
          {
            env,
            fetchImpl,
            logger,
          },
        ),
      ),
    );
  } catch (error) {
    logger.warn(`Unable to deliver notifications for run ${runId}.`, error);
  }
}

export function resolveWebhookEvent(
  status: string,
  previousStatus: string | undefined,
): WebhookEvent | undefined {
  if (isFailureStatus(status)) {
    return previousStatus && isFailureStatus(previousStatus)
      ? undefined
      : "check.failed";
  }

  if (status === "PASSED" && previousStatus && isFailureStatus(previousStatus)) {
    return "check.recovered";
  }

  return undefined;
}

export function renderWebhookBody(
  template: string | null,
  payload: WebhookPayload,
  groupName: string,
  adapter: string,
): string {
  if (!template) {
    return adapter === "ROCKET_CHAT"
      ? JSON.stringify({
          text: [payload.summary, payload.runUrl].filter(Boolean).join("\n"),
        })
      : JSON.stringify(payload);
  }

  const replacements: Record<string, string> = {
    ALERT_TITLE: payload.checkName,
    CHECK_KEY: payload.checkKey,
    CHECK_NAME: payload.checkName,
    GROUP_NAME: groupName,
    PROJECT_NAME: payload.projectSlug,
    RESULT_LINK: payload.runUrl ?? "",
    STATUS: payload.status,
  };

  return template.replace(/\{\{\s*([A-Z_]+)\s*\}\}/g, (placeholder, key) => {
    const value = replacements[key];

    return value === undefined ? placeholder : escapeJsonString(value);
  });
}

export async function resolveSelfchecksPublicUrl(
  env: NotificationRuntimeEnv,
  readFileImpl: typeof readFile = readFile,
): Promise<string | undefined> {
  const explicitUrl = normalizePublicUrl(env.SELFCHECKS_PUBLIC_URL ?? env.NEXTAUTH_URL);

  if (explicitUrl) {
    return explicitUrl;
  }

  if (!env.SELFCHECKS_CONFIG_PATH) {
    return undefined;
  }

  try {
    const config = JSON.parse(
      await readFileImpl(env.SELFCHECKS_CONFIG_PATH, "utf8"),
    ) as {
      server?: {
        publicUrl?: unknown;
      };
    };

    return normalizePublicUrl(config.server?.publicUrl);
  } catch {
    return undefined;
  }
}

function isMonitoringTerminalStatus(
  status: string,
): status is (typeof monitoringTerminalStatuses)[number] {
  return monitoringTerminalStatuses.some((item) => item === status);
}

function isFailureStatus(status: string): boolean {
  return failureStatuses.some((item) => item === status);
}

function normalizePublicUrl(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  try {
    const url = new URL(value.trim());

    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString().replace(/\/$/, "")
      : undefined;
  } catch {
    return undefined;
  }
}

function escapeJsonString(value: string): string {
  return JSON.stringify(value).slice(1, -1);
}

async function deliverWebhookNotification(
  {
    endpoint,
    groupName,
    payload,
    projectId,
    runId,
  }: {
    endpoint: {
      adapter: string;
      id: string;
      method: string;
      name: string;
      template: string | null;
      urlCiphertext: string;
    };
    groupName: string;
    payload: WebhookPayload;
    projectId: string;
    runId: string;
  },
  {
    env,
    fetchImpl,
    logger,
  }: {
    env: NotificationRuntimeEnv;
    fetchImpl: typeof fetch;
    logger: NotificationLogger;
  },
): Promise<void> {
  let notification: { id: string };

  try {
    notification = await prisma.notification.create({
      data: {
        event: payload.event,
        payload: payload as unknown as Prisma.InputJsonValue,
        projectId,
        runId,
        status: "PENDING",
        webhookEndpointId: endpoint.id,
        webhookName: endpoint.name,
      },
      select: {
        id: true,
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return;
    }

    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    readWebhookTimeoutMs(env.SELFCHECKS_WEBHOOK_TIMEOUT_MS),
  );
  timeout.unref?.();

  try {
    const body = renderWebhookBody(
      endpoint.template,
      payload,
      groupName,
      endpoint.adapter,
    );
    const response = await fetchImpl(decryptSecretValue(endpoint.urlCiphertext, env), {
      body: endpoint.method === "GET" ? undefined : body,
      headers: {
        "Content-Type": "application/json",
      },
      method: endpoint.method,
      signal: controller.signal,
    });

    await prisma.notification.update({
      data: {
        error: response.ok
          ? null
          : `Webhook responded with HTTP ${response.status} ${response.statusText}`.trim(),
        responseStatus: response.status,
        status: response.ok ? "SENT" : "FAILED",
      },
      where: {
        id: notification.id,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await prisma.notification.update({
      data: {
        error: message,
        status: "FAILED",
      },
      where: {
        id: notification.id,
      },
    });
    logger.warn(`Unable to deliver webhook ${endpoint.name}.`, error);
  } finally {
    clearTimeout(timeout);
  }
}

function readWebhookTimeoutMs(value: string | undefined): number {
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN;

  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= maxWebhookTimeoutMs
    ? parsed
    : defaultWebhookTimeoutMs;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}
