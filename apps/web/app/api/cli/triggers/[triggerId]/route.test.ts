import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  getJob: vi.fn(),
  close: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { testSession: { findUnique: mocks.findUnique } },
}));
vi.mock("bullmq", () => ({
  Queue: vi.fn(() => ({ getJob: mocks.getJob, close: mocks.close })),
}));
import { GET } from "./route";

const createdAt = new Date("2026-10-08T00:00:00Z");
const session = { id: "trigger_1", kind: "TRIGGER", status: "RUNNING", createdAt };
function run(id: string, retryGroupId: string, status: string) {
  return {
    id,
    retryGroupId,
    status,
    checkSnapshotKey: retryGroupId,
    checkSnapshotName: retryGroupId,
    durationMs: 100,
    errorMessage: status === "FAILED" ? "Failed check" : null,
    finishedAt: new Date(createdAt.getTime() + 500),
  };
}
async function poll() {
  return GET(
    new Request("http://localhost/api/cli/triggers/trigger_1", {
      headers: { Authorization: "Bearer api-token" },
    }),
    { params: Promise.resolve({ triggerId: "trigger_1" }) },
  );
}

describe("trigger status", () => {
  beforeEach(() => vi.stubEnv("SELFCHECKS_API_TOKEN", "api-token"));
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("waits while a sibling check or retry remains queued", async () => {
    mocks.findUnique.mockResolvedValue({
      ...session,
      runs: [
        run("a1", "a", "FAILED"),
        run("a2", "a", "QUEUED"),
        run("b1", "b", "PASSED"),
      ],
    });
    expect(await (await poll()).json()).toEqual({
      status: "active",
      triggerId: session.id,
    });
    expect(mocks.getJob).not.toHaveBeenCalled();
  });

  it("counts final attempts only and preserves the CLI summary contract", async () => {
    mocks.findUnique.mockResolvedValue({
      ...session,
      status: "FAILED",
      runs: [
        run("a1", "a", "FAILED"),
        run("b1", "b", "FAILED"),
        run("a2", "a", "PASSED"),
      ],
    });
    const body = await (await poll()).json();
    expect(body).toMatchObject({
      status: "completed",
      summary: {
        total: 2,
        passed: 1,
        failed: 1,
        skipped: 0,
        durationMs: 500,
        sessionId: session.id,
      },
    });
    expect(
      body.summary.results.map((result: { runId: string }) => result.runId),
    ).toEqual(["a2", "b1"]);
  });

  it("completes a trigger with no enabled checks", async () => {
    mocks.findUnique.mockResolvedValue({ ...session, status: "PASSED", runs: [] });
    expect(await (await poll()).json()).toMatchObject({
      status: "completed",
      summary: { total: 0, results: [] },
    });
  });

  it("includes a check cancelled by the queue timeout in the final summary", async () => {
    mocks.findUnique.mockResolvedValue({
      ...session,
      status: "CANCELLED",
      runs: [run("a1", "a", "CANCELLED")],
    });
    expect(await (await poll()).json()).toMatchObject({
      status: "completed",
      summary: { total: 1, failed: 1, passed: 0 },
    });
  });

  it("supports legacy project jobs already in Redis", async () => {
    mocks.findUnique.mockResolvedValue(null);
    mocks.getJob.mockResolvedValue({
      getState: async () => "completed",
      returnvalue: { total: 211 },
    });
    expect(await (await poll()).json()).toMatchObject({
      status: "completed",
      summary: { total: 211 },
    });
    expect(mocks.close).toHaveBeenCalled();
  });
});
