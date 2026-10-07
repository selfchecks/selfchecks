// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  findRun: vi.fn(),
  findCheck: vi.fn(),
  logs: vi.fn(),
  trace: vi.fn(),
  runs: vi.fn(),
  previous: vi.fn(),
  session: vi.fn(),
  checks: vi.fn(),
  group: vi.fn(),
  enqueue: vi.fn(),
  project: vi.fn(),
  upsert: vi.fn(),
  deployments: vi.fn(),
}));
vi.mock("./prisma", () => ({
  prisma: {
    checkRun: { findMany: mocks.runs, findFirst: mocks.previous },
    testSession: { findFirst: mocks.session },
    check: { findMany: mocks.checks },
    checkGroup: { findFirst: mocks.group },
    project: { findFirst: mocks.project },
    applicationDeployment: { upsert: mocks.upsert, findMany: mocks.deployments },
  },
}));
vi.mock("./mcp-data", async (original) => ({
  ...(await original<typeof import("./mcp-data")>()),
  findRun: mocks.findRun,
  findCheck: mocks.findCheck,
  presentRun: (run: unknown) => run,
  logs: mocks.logs,
  trace: mocks.trace,
}));
vi.mock("./run-check", () => ({ enqueueCheckRun: mocks.enqueue }));
import {
  checkTimeline,
  comparePeriods,
  executionStatus,
  failureContext,
  failureFingerprint,
  getSavedAnalysis,
  recordDeployment,
  releaseReadiness,
  savedAnalysis,
  similarFailures,
  triggerGroup,
  deployments,
} from "./mcp-workflows";
import { TEST_SESSION_FAILURE_CLASSIFIER_VERSION } from "./test-session-analysis";
const access = { scopes: ["read"], projectSlugs: ["shop"] };
const write = { ...access, scopes: ["read", "run", "deploy"] };
const from = "2026-10-01T00:00:00Z",
  to = "2026-10-02T00:00:00Z";
const analysis = {
  status: "completed",
  content: "Likely a locator failure. Authorization: Bearer secretvalue123456789",
  model: "stored-model",
};
const run = {
  id: "run",
  checkId: "check",
  project: { slug: "shop" },
  status: "FAILED",
  createdAt: new Date(from),
  testSessionId: null,
  result: { aiAnalysis: analysis },
  errorMessage: "Timeout 5000 ms",
};
describe("MCP investigation workflows", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.findRun.mockResolvedValue(run);
    mocks.findCheck.mockResolvedValue({
      id: "check",
      key: "checkout",
      enabled: true,
      project: { slug: "shop" },
    });
    mocks.previous.mockResolvedValue({ id: "baseline" });
    mocks.runs.mockResolvedValue([]);
    mocks.checks.mockResolvedValue([]);
    mocks.deployments.mockResolvedValue([]);
  });
  it("reads stored analysis without artifacts and returns a concise interpretation instruction", async () => {
    const context = await failureContext(access, { runId: "run" });
    expect(context.baselineRunId).toBe("baseline");
    expect(context.logs).toMatchObject({ deferred: true });
    expect(context.storedAnalysis.run).toMatchObject({
      available: true,
      reusable: true,
    });
    expect(JSON.stringify(context)).not.toContain("secretvalue123456789");
    expect(mocks.logs).not.toHaveBeenCalled();
    expect(mocks.trace).not.toHaveBeenCalled();
    expect(mocks.previous.mock.calls[0]![0].where.project).toEqual({
      slug: { in: ["shop"] },
    });
  });
  it("redacts before character pagination and marks incomplete excerpts", () => {
    const first = savedAnalysis(analysis, true, "exact run", 0, 20),
      next = savedAnalysis(analysis, true, "exact run", 20, 1000);
    expect(first).toMatchObject({ nextOffset: 20, isExcerpt: true });
    expect(JSON.stringify([first, next])).not.toContain("secretvalue123456789");
    expect(
      savedAnalysis({ status: "failed", error: "secret" }, true, "", 0, 20),
    ).toMatchObject({ available: false, reusable: false });
  });
  it("validates session cache against final latest failed runs and classifier version", async () => {
    const session = {
      id: "session",
      status: "FAILED",
      runs: [
        {
          id: "run",
          status: "FAILED",
          projectId: "project",
          check: { key: "checkout" },
        },
      ],
      aiAnalysis: {
        analysis,
        failedRunIds: ["run"],
        failureClassifierVersion: TEST_SESSION_FAILURE_CLASSIFIER_VERSION,
      },
    };
    mocks.session.mockResolvedValue(session);
    expect(
      await getSavedAnalysis(access, { sessionId: "session", offset: 0, limit: 1000 }),
    ).toMatchObject({ available: true, reusable: true });
    expect(mocks.session.mock.calls[0]![0].where.runs.every.project).toEqual({
      slug: { in: ["shop"] },
    });
    mocks.session.mockResolvedValue({
      ...session,
      runs: [{ ...session.runs[0], id: "new-run" }],
    });
    expect(
      await getSavedAnalysis(access, { sessionId: "session", offset: 0, limit: 1000 }),
    ).toMatchObject({ reusable: false });
    mocks.session.mockResolvedValue({ ...session, status: "RUNNING" });
    expect(
      await getSavedAnalysis(access, { sessionId: "session", offset: 0, limit: 1000 }),
    ).toMatchObject({ reusable: false });
    mocks.session.mockResolvedValue({
      ...session,
      aiAnalysis: { ...session.aiAnalysis, failureClassifierVersion: 0 },
    });
    expect(
      await getSavedAnalysis(access, { sessionId: "session", offset: 0, limit: 1000 }),
    ).toMatchObject({ reusable: false });
    await expect(
      getSavedAnalysis(access, {
        runId: "run",
        sessionId: "session",
        offset: 0,
        limit: 10,
      }),
    ).rejects.toThrow("exactly one");
  });
  it("reads evidence when no usable cache exists, including a session cache that does not cover this run", async () => {
    mocks.findRun.mockResolvedValue({ ...run, result: {}, testSessionId: "session" });
    mocks.session.mockResolvedValue({
      id: "session",
      status: "FAILED",
      runs: [
        {
          id: "other-run",
          status: "FAILED",
          projectId: "project",
          check: { key: "other" },
        },
      ],
      aiAnalysis: {
        analysis,
        failedRunIds: ["other-run"],
        failureClassifierVersion: TEST_SESSION_FAILURE_CLASSIFIER_VERSION,
      },
    });
    mocks.logs.mockResolvedValue({ text: "recorded evidence" });
    mocks.trace.mockResolvedValue({ events: [] });
    expect((await failureContext(access, { runId: "run" })).logs).toEqual({
      text: "recorded evidence",
    });
    expect(mocks.trace).toHaveBeenCalledOnce();
  });
  it("treats missing period samples as unknown and scopes bounded queries", async () => {
    mocks.checks.mockResolvedValue([{ id: "check", key: "checkout" }]);
    const compared = await comparePeriods(access, {
      project: "shop",
      beforeFrom: from,
      beforeTo: to,
      afterFrom: to,
      afterTo: "2026-10-03T00:00:00Z",
      limit: 10,
      offset: 0,
    });
    expect(compared.checks[0]?.changes).toMatchObject({
      insufficientData: true,
      checkPassRateDelta: null,
      newObservedFailures: false,
    });
    expect(mocks.runs.mock.calls[0]![0]).toMatchObject({
      take: 5001,
      where: { project: { slug: { in: ["shop"] } } },
    });
    await expect(
      comparePeriods(access, {
        project: "other",
        beforeFrom: from,
        beforeTo: to,
        afterFrom: from,
        afterTo: to,
        limit: 1,
        offset: 0,
      }),
    ).rejects.toThrow("access denied");
  });
  it("clusters normalized errors without implying shared cause", async () => {
    expect(failureFingerprint("Timeout 5000 ms")).toBe(
      failureFingerprint("Timeout 3000 ms"),
    );
    mocks.runs.mockResolvedValue([
      { ...run, errorMessage: "Timeout 5000 ms" },
      { ...run, id: "run2", errorMessage: "Timeout 3000 ms" },
      { ...run, id: "run3", errorMessage: null },
    ]);
    const found = await similarFailures(access, {
      project: "shop",
      from,
      to,
      limit: 5,
      offset: 0,
    });
    expect(found.clusters[0]?.count).toBe(2);
    expect(found.missingErrorCount).toBe(1);
    mocks.findRun.mockResolvedValue({ ...run, project: { slug: "other" } });
    await expect(
      similarFailures(access, {
        project: "shop",
        from,
        to,
        referenceRunId: "run",
        limit: 5,
        offset: 0,
      }),
    ).rejects.toThrow("requested project");
  });
  it("does not infer readiness from missing, active, stale or insufficient evidence", async () => {
    const policy = {
      project: "shop",
      requiredCheckIds: ["check"],
      maxAgeMinutes: 30,
      consecutivePasses: 2,
    };
    expect((await releaseReadiness(access, policy)).decision).toBe("insufficient_data");
    const passed = {
      id: "pass",
      status: "PASSED",
      createdAt: new Date(),
      finishedAt: new Date(),
    };
    mocks.runs.mockResolvedValue([passed]);
    expect((await releaseReadiness(access, policy)).decision).toBe("insufficient_data");
    mocks.runs.mockResolvedValue([passed, { ...passed, status: "FAILED" }]);
    expect((await releaseReadiness(access, policy)).decision).toBe("blocked");
    mocks.runs.mockResolvedValue([passed, passed]);
    expect((await releaseReadiness(access, policy)).decision).toBe("ready");
    mocks.runs.mockResolvedValue([{ ...passed, status: "RUNNING", finishedAt: null }]);
    expect((await releaseReadiness(access, policy)).decision).toBe("insufficient_data");
    mocks.runs.mockResolvedValue([{ ...passed, finishedAt: new Date(from) }]);
    expect((await releaseReadiness(access, policy)).decision).toBe("insufficient_data");
  });
  it("reports unknown executions as incomplete rather than passing", async () => {
    mocks.runs.mockResolvedValue([{ id: "run", status: "PASSED" }]);
    expect(await executionStatus(access, ["run", "unknown"])).toMatchObject({
      complete: false,
      passed: false,
      unavailableRunIds: ["unknown"],
    });
    expect(await executionStatus(access, ["run"])).toMatchObject({
      complete: true,
      passed: true,
    });
  });
  it("enforces group permission and size before queueing, and reports partial success", async () => {
    await expect(
      triggerGroup(access, { project: "shop", groupId: "smoke" }),
    ).rejects.toThrow("Run permission");
    mocks.group.mockResolvedValue({ id: "group" });
    mocks.checks.mockResolvedValue(
      Array.from({ length: 51 }, (_, i) => ({ id: `check${i}` })),
    );
    await expect(
      triggerGroup(write, { project: "shop", groupId: "smoke" }),
    ).rejects.toThrow("50");
    expect(mocks.enqueue).not.toHaveBeenCalled();
    mocks.checks.mockResolvedValue([
      { id: "one", key: "one" },
      { id: "two", key: "two" },
    ]);
    mocks.enqueue
      .mockResolvedValueOnce(
        Response.json({ runId: "queued", status: "queued" }, { status: 202 }),
      )
      .mockRejectedValueOnce(new Error("queue down"));
    expect(
      (await triggerGroup(write, { project: "shop", groupId: "smoke" })).executions,
    ).toEqual([
      expect.objectContaining({ runId: "queued" }),
      expect.objectContaining({ error: expect.stringContaining("unknown") }),
    ]);
    await expect(
      triggerGroup(write, { project: "other", groupId: "smoke" }),
    ).rejects.toThrow("access denied");
  });
  it("records immutable idempotent deployment events with separate permission and project scope", async () => {
    const args = {
      project: "shop",
      environment: "production",
      externalId: "ci-42",
      version: "v42",
      deployedAt: from,
    };
    await expect(recordDeployment(access, args)).rejects.toThrow("Deploy permission");
    await expect(
      recordDeployment(write, { ...args, project: "other" }),
    ).rejects.toThrow("access denied");
    mocks.project.mockResolvedValue({ id: "project" });
    mocks.upsert.mockResolvedValue({
      ...args,
      id: "deployment",
      projectId: "project",
      deployedAt: new Date(from),
    });
    expect(await recordDeployment(write, args)).toMatchObject({
      deployment: { id: "deployment" },
    });
    expect(await recordDeployment(write, args)).toMatchObject({
      deployment: { id: "deployment" },
    });
    expect(mocks.upsert.mock.calls[0]![0]).toMatchObject({
      update: {},
      where: {
        projectId_environment_externalId: {
          projectId: "project",
          environment: "production",
          externalId: "ci-42",
        },
      },
    });
    await expect(
      recordDeployment(write, { ...args, version: "conflicting" }),
    ).rejects.toThrow("different data");
  });
  it("keeps timelines and deployment history scoped and validates time ranges", async () => {
    mocks.runs.mockResolvedValue([{ id: "new" }, { id: "old" }]);
    const timeline = await checkTimeline(access, {
      checkId: "check",
      from,
      to,
      limit: 1,
      offset: 0,
      environment: "production",
    });
    expect(timeline.runs).toEqual([{ id: "new" }]);
    expect(timeline.nextOffset).toBe(1);
    expect(mocks.deployments.mock.calls[0]![0].where).toMatchObject({
      project: { slug: "shop" },
      environment: "production",
    });
    await expect(
      deployments(access, { project: "other", limit: 5, offset: 0 }),
    ).rejects.toThrow("access denied");
    await expect(
      checkTimeline(access, {
        checkId: "check",
        from: to,
        to: from,
        limit: 1,
        offset: 0,
      }),
    ).rejects.toThrow("Period");
  });
});
