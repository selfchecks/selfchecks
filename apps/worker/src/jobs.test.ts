import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkRunUpdate: vi.fn(),
  runCheckById: vi.fn(),
}));

vi.mock("@selfchecks/cli/runner", () => ({
  runCheckById: mocks.runCheckById,
}));

vi.mock("@selfchecks/db", () => ({
  prisma: {
    checkRun: {
      update: mocks.checkRunUpdate,
    },
  },
}));

import { handleCheckJob } from "./jobs.js";

describe("handleCheckJob", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("runs a queued check through the shared runner", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    mocks.runCheckById.mockResolvedValue({
      checkKey: "issue.get",
      checkName: "issue.get",
      durationMs: 42,
      runId: "run_1",
      status: "passed",
    });

    await expect(
      handleCheckJob({
        data: {
          checkId: "check_1",
          checkKey: "issue.get",
          env: [{ name: "BASE_URL", value: "https://example.test" }],
          projectSlug: "account",
          reporter: "dot",
          rootDir: "/repo/config/checkly",
          runId: "run_1",
          runSource: "SCHEDULE",
          type: "browser",
        },
      }),
    ).resolves.toEqual({
      checkKey: "issue.get",
      checkName: "issue.get",
      durationMs: 42,
      runId: "run_1",
      status: "passed",
    });

    expect(log).toHaveBeenCalledWith("Running browser check issue.get for account");
    expect(mocks.runCheckById).toHaveBeenCalledWith({
      checkId: "check_1",
      env: [{ name: "BASE_URL", value: "https://example.test" }],
      projectSlug: "account",
      record: true,
      reporter: "dot",
      rootDir: "/repo/config/checkly",
      runId: "run_1",
      runSource: "SCHEDULE",
    });
  });

  it("marks the queued run failed when runner execution throws", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    mocks.runCheckById.mockRejectedValue(new Error("Playwright failed"));

    await expect(
      handleCheckJob({
        data: {
          checkId: "check_1",
          checkKey: "issue.get",
          projectSlug: "account",
          rootDir: "/repo/config/checkly",
          runId: "run_1",
          type: "browser",
        },
      }),
    ).rejects.toThrow("Playwright failed");

    expect(mocks.checkRunUpdate).toHaveBeenCalledWith({
      data: {
        errorMessage: "Playwright failed",
        finishedAt: expect.any(Date),
        status: "FAILED",
      },
      where: {
        id: "run_1",
      },
    });
  });
});
