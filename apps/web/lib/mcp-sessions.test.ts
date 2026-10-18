// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  sessions: vi.fn(),
  session: vi.fn(),
  runs: vi.fn(),
}));
vi.mock("./prisma", () => ({
  prisma: {
    testSession: { findMany: mocks.sessions, findFirst: mocks.session },
    checkRun: { findMany: mocks.runs },
  },
}));
import {
  getTestSession,
  listTestSessionRuns,
  listTestSessions,
  sessionWindow,
} from "./mcp-sessions";
const access = { scopes: ["read"], projectSlugs: ["account"] };
const session = {
  id: "session",
  status: "FAILED",
  createdAt: new Date("2026-10-17T01:00:00Z"),
  targetUrl: "https://deploy.test/path?token=hidden&variant=a",
};
const run = {
  id: "new",
  projectId: "project",
  checkId: "check",
  status: "PASSED",
  check: { key: "checkout", enabled: true },
};
describe("MCP test sessions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.session.mockResolvedValue(session);
    mocks.runs.mockResolvedValue([]);
  });
  it("filters activity overlapping the window, including earlier running sessions", () => {
    const from = "2026-10-18T06:00:00Z",
      to = "2026-10-19T06:00:00Z";
    expect(sessionWindow(from, to)).toMatchObject({
      OR: [
        { createdAt: { gte: from, lt: to } },
        {
          runs: {
            some: {
              OR: expect.arrayContaining([
                { startedAt: { gte: from, lt: to } },
                { finishedAt: { gte: from, lt: to } },
                {
                  startedAt: { not: null, lt: to },
                  OR: [
                    { finishedAt: { gte: from } },
                    { status: "RUNNING", finishedAt: null },
                  ],
                },
              ]),
            },
          },
        },
      ],
    });
    expect(() => sessionWindow(to, from)).toThrow("earlier");
  });
  it("scopes the parent and every run before pagination and preserves distinct target URLs", async () => {
    mocks.sessions.mockResolvedValue([session, { ...session, id: "extra" }]);
    const result = await listTestSessions(access, {
      limit: 1,
      offset: 3,
      from: "2026-10-18T00:00:00Z",
    });
    expect(mocks.sessions.mock.calls[0]![0]).toMatchObject({
      where: {
        project: { slug: { in: ["account"] } },
        runs: { every: { project: { slug: { in: ["account"] } } } },
      },
      take: 2,
      skip: 3,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    expect(result.nextOffset).toBe(4);
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]).toMatchObject({
      targetUrl: session.targetUrl,
      windowRelation: "earlier_session_with_activity",
    });
    await expect(
      listTestSessions(access, { project: "private", limit: 1, offset: 0 }),
    ).rejects.toThrow("access denied");
  });
  it("does not expose session runs when any project is inaccessible", async () => {
    mocks.session.mockResolvedValue(null);
    await expect(
      listTestSessionRuns(access, { sessionId: "private", limit: 5, offset: 0 }),
    ).rejects.toThrow("not accessible");
    expect(mocks.runs).not.toHaveBeenCalled();
  });
  it("counts only latest attempts for enabled checks, preserving stored session status", async () => {
    mocks.runs.mockResolvedValue([
      run,
      { ...run, id: "old", status: "FAILED" },
      {
        ...run,
        id: "disabled",
        check: { key: "disabled", enabled: false },
        status: "FAILED",
      },
    ]);
    const result = await getTestSession(access, "session");
    expect(result).toMatchObject({
      status: "FAILED",
      summary: { checks: 1, statuses: { PASSED: 1 }, complete: true },
    });
    expect(JSON.stringify(result)).not.toContain("hidden");
    expect(JSON.stringify(result)).toContain("variant=a");
  });
  it("reports incomplete totals for unknown enabled state and bounded evidence", async () => {
    mocks.runs.mockResolvedValue([{ ...run, check: null }]);
    expect(await getTestSession(access, "session")).toMatchObject({
      summary: { checks: 0, unknownEnabled: 1, complete: false },
    });
    mocks.runs.mockResolvedValue(Array.from({ length: 10001 }, () => run));
    expect(await getTestSession(access, "session")).toMatchObject({
      summary: { complete: false, runLimitReached: true },
    });
  });
  it("paginates all attempts without large logs, responses or AI bodies", async () => {
    mocks.runs.mockResolvedValue([run, { ...run, id: "older" }]);
    const result = await listTestSessionRuns(access, {
      sessionId: "session",
      limit: 1,
      offset: 10,
    });
    expect(result).toMatchObject({
      runs: [{ id: "new", enabled: true }],
      nextOffset: 11,
    });
    expect(mocks.runs.mock.calls[0]![0]).toMatchObject({
      where: { testSessionId: "session", project: { slug: { in: ["account"] } } },
      take: 2,
      skip: 10,
    });
    expect(mocks.runs.mock.calls[0]![0].select).not.toHaveProperty("result");
  });
});
