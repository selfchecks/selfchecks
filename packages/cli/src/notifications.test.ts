import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import { encryptSecretValue, type WebhookPayload } from "@selfchecks/core";

const mocks = vi.hoisted(() => ({
  checkRunFindFirst: vi.fn(),
  checkRunFindUnique: vi.fn(),
  notificationCreate: vi.fn(),
  notificationUpdate: vi.fn(),
}));

vi.mock("@selfchecks/db", () => ({
  Prisma: {},
  prisma: {
    checkRun: {
      findFirst: mocks.checkRunFindFirst,
      findUnique: mocks.checkRunFindUnique,
    },
    notification: {
      create: mocks.notificationCreate,
      update: mocks.notificationUpdate,
    },
  },
}));

import {
  deliverRunNotifications,
  renderWebhookBody,
  resolveSelfchecksPublicUrl,
  resolveWebhookEvent,
} from "./notifications.js";

const secretEnv = {
  SELFCHECKS_PUBLIC_URL: "https://checks.example.test/",
  SELFCHECKS_SECRET_KEY: "unit-test-secret",
};

function createEndpoint(
  overrides: Partial<{
    adapter: string;
    enabled: boolean;
    id: string;
    method: string;
    name: string;
    sendFailure: boolean;
    sendRecovery: boolean;
    template: string | null;
    urlCiphertext: string;
  }> = {},
) {
  return {
    adapter: "GENERIC",
    enabled: true,
    id: "webhook_failure",
    method: "POST",
    name: "RocketChatFail",
    sendFailure: true,
    sendRecovery: false,
    template: '{ "text": "{{GROUP_NAME}} / {{ALERT_TITLE}}\\n{{RESULT_LINK}}" }',
    urlCiphertext: encryptSecretValue(
      "https://chat.example.test/hooks/unit-test",
      secretEnv,
    ),
    ...overrides,
  };
}

function createRun(
  overrides: Partial<{
    runSource: string | null;
    status: string;
    testSession: { kind: string } | null;
    webhookEndpoints: Array<{ webhookEndpoint: ReturnType<typeof createEndpoint> }>;
  }> = {},
) {
  return {
    attempt: 1,
    check: {
      group: {
        name: "App / Smoke",
        webhookEndpoints: overrides.webhookEndpoints ?? [
          { webhookEndpoint: createEndpoint() },
        ],
      },
      id: "check_1",
      key: "homepage",
      name: 'Homepage "critical"',
    },
    checkId: "check_1",
    createdAt: new Date("2026-07-18T10:00:00.000Z"),
    id: "run_1",
    project: {
      slug: "account",
    },
    projectId: "project_1",
    retryGroupId: "retry_1",
    runSource: overrides.runSource ?? "SCHEDULE",
    status: overrides.status ?? "FAILED",
    testSession: overrides.testSession ?? null,
  };
}

describe("deliverRunNotifications", () => {
  beforeEach(() => {
    mocks.checkRunFindUnique.mockResolvedValue(createRun());
    mocks.checkRunFindFirst.mockResolvedValue({ status: "PASSED" });
    mocks.notificationCreate.mockResolvedValue({ id: "notification_1" });
    mocks.notificationUpdate.mockResolvedValue({});
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("delivers a failure notification after a monitoring state transition", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response("ok", {
        status: 200,
        statusText: "OK",
      }),
    );

    await deliverRunNotifications("run_1", {
      env: secretEnv,
      fetchImpl,
      logger: { warn: vi.fn() },
    });

    expect(mocks.notificationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        event: "check.failed",
        projectId: "project_1",
        runId: "run_1",
        status: "PENDING",
        webhookEndpointId: "webhook_failure",
      }),
      select: {
        id: true,
      },
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://chat.example.test/hooks/unit-test",
      expect.objectContaining({
        body: expect.stringContaining('App / Smoke / Homepage \\"critical\\"'),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
        signal: expect.any(AbortSignal),
      }),
    );
    expect(mocks.notificationUpdate).toHaveBeenCalledWith({
      data: {
        error: null,
        responseStatus: 200,
        status: "SENT",
      },
      where: {
        id: "notification_1",
      },
    });
  });

  it("does not notify again while a check remains failed", async () => {
    mocks.checkRunFindFirst.mockResolvedValue({ status: "TIMED_OUT" });
    const fetchImpl = vi.fn();

    await deliverRunNotifications("run_1", {
      env: secretEnv,
      fetchImpl,
    });

    expect(mocks.notificationCreate).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("uses recovery-only endpoints when a check recovers", async () => {
    const recoveryEndpoint = createEndpoint({
      id: "webhook_recovery",
      name: "RocketChatRecover",
      sendFailure: false,
      sendRecovery: true,
      template: '{"text":"Recovered {{ALERT_TITLE}}"}',
    });
    mocks.checkRunFindUnique.mockResolvedValue(
      createRun({
        status: "PASSED",
        webhookEndpoints: [
          { webhookEndpoint: createEndpoint() },
          { webhookEndpoint: recoveryEndpoint },
        ],
      }),
    );
    mocks.checkRunFindFirst.mockResolvedValue({ status: "FAILED" });
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));

    await deliverRunNotifications("run_1", {
      env: secretEnv,
      fetchImpl,
    });

    expect(mocks.notificationCreate).toHaveBeenCalledTimes(1);
    expect(mocks.notificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          event: "check.recovered",
          webhookEndpointId: "webhook_recovery",
        }),
      }),
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://chat.example.test/hooks/unit-test",
      expect.objectContaining({
        body: '{"text":"Recovered Homepage \\"critical\\""}',
      }),
    );
  });

  it("skips manual runs and test sessions", async () => {
    const fetchImpl = vi.fn();

    mocks.checkRunFindUnique.mockResolvedValueOnce(createRun({ runSource: "MANUAL" }));
    await deliverRunNotifications("manual_run", { fetchImpl });

    mocks.checkRunFindUnique.mockResolvedValueOnce(
      createRun({ testSession: { kind: "TEST" } }),
    );
    await deliverRunNotifications("test_run", { fetchImpl });

    expect(mocks.checkRunFindFirst).not.toHaveBeenCalled();
    expect(mocks.notificationCreate).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("records non-successful webhook responses without failing the run", async () => {
    const warn = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response("denied", {
        status: 403,
        statusText: "Forbidden",
      }),
    );

    await expect(
      deliverRunNotifications("run_1", {
        env: secretEnv,
        fetchImpl,
        logger: { warn },
      }),
    ).resolves.toBeUndefined();

    expect(mocks.notificationUpdate).toHaveBeenCalledWith({
      data: {
        error: "Webhook responded with HTTP 403 Forbidden",
        responseStatus: 403,
        status: "FAILED",
      },
      where: {
        id: "notification_1",
      },
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it("records transport errors and keeps notification failures isolated", async () => {
    const warn = vi.fn();
    const fetchImpl = vi.fn().mockRejectedValue(new Error("connection refused"));

    await expect(
      deliverRunNotifications("run_1", {
        env: secretEnv,
        fetchImpl,
        logger: { warn },
      }),
    ).resolves.toBeUndefined();

    expect(mocks.notificationUpdate).toHaveBeenCalledWith({
      data: {
        error: "connection refused",
        status: "FAILED",
      },
      where: {
        id: "notification_1",
      },
    });
    expect(warn).toHaveBeenCalledWith(
      "Unable to deliver webhook RocketChatFail.",
      expect.any(Error),
    );
  });

  it("treats the notification uniqueness constraint as an idempotent replay", async () => {
    mocks.notificationCreate.mockRejectedValue({ code: "P2002" });
    const fetchImpl = vi.fn();

    await deliverRunNotifications("run_1", {
      env: secretEnv,
      fetchImpl,
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(mocks.notificationUpdate).not.toHaveBeenCalled();
  });
});

describe("notification helpers", () => {
  it("derives failure and recovery events only on state transitions", () => {
    expect(resolveWebhookEvent("FAILED", undefined)).toBe("check.failed");
    expect(resolveWebhookEvent("TIMED_OUT", "PASSED")).toBe("check.failed");
    expect(resolveWebhookEvent("FAILED", "FAILED")).toBeUndefined();
    expect(resolveWebhookEvent("PASSED", "TIMED_OUT")).toBe("check.recovered");
    expect(resolveWebhookEvent("PASSED", "PASSED")).toBeUndefined();
  });

  it("renders a Rocket.Chat fallback body", () => {
    const payload: WebhookPayload = {
      checkKey: "homepage",
      checkName: "Homepage",
      event: "check.failed",
      projectSlug: "account",
      runId: "run_1",
      runUrl: "https://checks.example.test/checks/check_1/runs/run_1",
      status: "failed",
      summary: "Homepage failed",
    };

    expect(JSON.parse(renderWebhookBody(null, payload, "App", "ROCKET_CHAT"))).toEqual({
      text: "Homepage failed\nhttps://checks.example.test/checks/check_1/runs/run_1",
    });
  });

  it("reads the public URL from the shared runtime config", async () => {
    const readFileImpl = vi.fn().mockResolvedValue(
      JSON.stringify({
        server: {
          publicUrl: "https://checks.example.test/",
        },
      }),
    );

    await expect(
      resolveSelfchecksPublicUrl(
        { SELFCHECKS_CONFIG_PATH: "/runtime/selfchecks.config.json" },
        readFileImpl,
      ),
    ).resolves.toBe("https://checks.example.test");
  });
});
