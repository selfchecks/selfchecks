import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deploymentFindFirst: vi.fn(),
  projectFindUnique: vi.fn(),
  testSessionCreate: vi.fn(),
  testSessionUpdateMany: vi.fn(),
  checkRunUpdateMany: vi.fn(),
  transaction: vi.fn(),
  getRunEnvironment: vi.fn(),
  queueAddBulk: vi.fn(),
  queueClose: vi.fn(),
  queueConstructor: vi.fn(),
}));

vi.mock("bullmq", () => ({
  Queue: mocks.queueConstructor.mockImplementation(() => ({
    addBulk: mocks.queueAddBulk,
    close: mocks.queueClose,
  })),
}));

vi.mock("@selfchecks/cli/environment", () => ({
  getRunEnvironment: mocks.getRunEnvironment,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    project: { findUnique: mocks.projectFindUnique },
    testSession: {
      create: mocks.testSessionCreate,
      updateMany: mocks.testSessionUpdateMany,
    },
    checkRun: { updateMany: mocks.checkRunUpdateMany },
    deployment: {
      findFirst: mocks.deploymentFindFirst,
    },
  },
}));

import { POST } from "./route";

describe("CLI trigger route", () => {
  beforeEach(() => {
    vi.stubEnv("SELFCHECKS_API_TOKEN", "api-token");
    mocks.deploymentFindFirst.mockResolvedValue({
      source: "/app/runtime/deployments/deployment_1",
    });
    mocks.getRunEnvironment.mockResolvedValue([
      { name: "API_URL", value: "https://api.example.test" },
    ]);
    mocks.projectFindUnique.mockResolvedValue({
      id: "project_1",
      checks: Array.from({ length: 211 }, (_, index) => ({
        id: `check_${index}`,
        key: `key_${index}`,
        name: `Check ${index}`,
        type: "BROWSER",
        accounts: [index % 2 ? "free" : "paid"],
        tags: [],
      })),
    });
    mocks.queueAddBulk.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("queues 211 independent checks with one persisted trigger summary", async () => {
    const response = await POST(
      new Request("http://localhost/api/cli/triggers", {
        body: JSON.stringify({
          env: [
            { name: "API_URL", value: "https://override.example.test" },
            { name: "BASE_URL", value: "https://example.test" },
          ],
          projectSlug: "account",
          ref: "stable",
          reporter: "github",
          retries: 1,
        }),
        headers: {
          Authorization: "Bearer api-token",
          "Content-Type": "application/json",
        },
        method: "POST",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body).toMatchObject({ status: "queued" });
    const jobs = mocks.queueAddBulk.mock.calls[0]?.[0];
    expect(jobs).toHaveLength(211);
    expect(
      new Set(jobs.map((job: { opts: { jobId: string } }) => job.opts.jobId)).size,
    ).toBe(211);
    expect(jobs[0]).toMatchObject({
      name: "run-check",
      data: {
        accounts: ["paid"],
        checkId: "check_0",
        checkKey: "key_0",
        env: [
          { name: "API_URL", value: "https://override.example.test" },
          { name: "BASE_URL", value: "https://example.test" },
        ],
        triggerSessionId: body.triggerId,
        projectSlug: "account",
        retries: 1,
        runSource: "CLI",
        rootDir: "/app/runtime/deployments/deployment_1",
      },
      opts: { jobId: jobs[0].data.runId },
    });
    expect(jobs.every((job: { data: object }) => !("kind" in job.data))).toBe(true);
    const session = mocks.testSessionCreate.mock.calls[0]?.[0].data;
    expect(session).toMatchObject({
      id: body.triggerId,
      kind: "TRIGGER",
      ref: "stable",
      status: "QUEUED",
    });
    expect(session.runs.create).toHaveLength(211);
    expect(session.runs.create.map((run: { id: string }) => run.id)).toEqual(
      jobs.map((job: { data: { runId: string } }) => job.data.runId),
    );
    expect(mocks.testSessionCreate.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.queueAddBulk.mock.invocationCallOrder[0]!,
    );
    expect(mocks.projectFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          checks: expect.objectContaining({ where: { enabled: true } }),
        }),
      }),
    );
  });

  it("does not deduplicate separate invocations", async () => {
    await Promise.all(Array.from({ length: 5 }, () => POST(triggerRequest())));
    const ids = mocks.queueAddBulk.mock.calls.flatMap(([jobs]) =>
      jobs.map((job: { opts: { jobId: string } }) => job.opts.jobId),
    );
    expect(ids).toHaveLength(211 * 5);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("completes an empty project without an execution job", async () => {
    mocks.projectFindUnique.mockResolvedValue({ id: "project_1", checks: [] });
    expect((await POST(triggerRequest())).status).toBe(202);
    expect(mocks.queueAddBulk).not.toHaveBeenCalled();
    expect(mocks.testSessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PASSED" }) }),
    );
  });

  it("marks queued runs cancelled when Redis rejects the batch", async () => {
    mocks.queueAddBulk.mockRejectedValueOnce(new Error("Redis unavailable"));
    expect((await POST(triggerRequest())).status).toBe(503);
    expect(mocks.checkRunUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { testSessionId: expect.any(String), status: "QUEUED" },
        data: expect.objectContaining({ status: "CANCELLED" }),
      }),
    );
    expect(mocks.queueClose).toHaveBeenCalled();
  });
});

function triggerRequest() {
  return new Request("http://localhost/api/cli/triggers", {
    method: "POST",
    headers: { Authorization: "Bearer api-token", "Content-Type": "application/json" },
    body: JSON.stringify({ projectSlug: "account" }),
  });
}
