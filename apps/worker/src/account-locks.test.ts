import { DelayedError } from "bullmq";
import { describe, expect, it, vi } from "vitest";

import { AccountJobDispatcher, type DispatchableAccountJob } from "./account-locks.js";

describe("AccountJobDispatcher", () => {
  it("defers an overlapping job without blocking a later disjoint job", async () => {
    const dispatcher = new AccountJobDispatcher({ now: () => 1_000 });
    const finishPaid = createDeferred<void>();
    const paidJob = createJob("paid_1", ["paid"]);
    const blockedPaidJob = createJob("paid_2", ["paid"]);
    const freeJob = createJob("free_1", ["free"]);
    const paidOperation = vi.fn(() => finishPaid.promise);
    const blockedPaidOperation = vi.fn(async () => "blocked paid ran");
    const freeOperation = vi.fn(async () => "free ran");
    const paidRun = dispatcher.dispatch(paidJob, "token_paid_1", paidOperation);

    await vi.waitFor(() => expect(paidOperation).toHaveBeenCalled());
    await expect(
      dispatcher.dispatch(blockedPaidJob, "token_paid_2", blockedPaidOperation),
    ).rejects.toBeInstanceOf(DelayedError);
    await expect(
      dispatcher.dispatch(freeJob, "token_free_1", freeOperation),
    ).resolves.toBe("free ran");

    expect(blockedPaidOperation).not.toHaveBeenCalled();
    expect(blockedPaidJob.moveToDelayed).toHaveBeenCalledWith(31_000, "token_paid_2");
    expect(freeJob.moveToDelayed).not.toHaveBeenCalled();

    finishPaid.resolve();
    await paidRun;

    expect(blockedPaidJob.promote).toHaveBeenCalledTimes(1);
    await expect(
      dispatcher.dispatch(blockedPaidJob, "token_paid_2_retry", blockedPaidOperation),
    ).resolves.toBe("blocked paid ran");
  });

  it("runs jobs with disjoint accounts concurrently", async () => {
    const dispatcher = new AccountJobDispatcher();
    const finish = createDeferred<void>();
    let active = 0;
    let maximumActive = 0;
    const run = (job: DispatchableAccountJob) =>
      dispatcher.dispatch(job, `token_${job.id}`, async () => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await finish.promise;
        active -= 1;
      });
    const runs = [run(createJob("free", ["free"])), run(createJob("paid", ["paid"]))];

    await vi.waitFor(() => expect(maximumActive).toBe(2));
    finish.resolve();
    await Promise.all(runs);
  });

  it("uses account requirements from test-session check jobs", async () => {
    const dispatcher = new AccountJobDispatcher();
    const finishSessionCheck = createDeferred<void>();
    const sessionJob = createTestSessionJob("session_check", ["paid"]);
    const blockedJob = createJob("manual_check", ["paid"]);
    const sessionRun = dispatcher.dispatch(
      sessionJob,
      "token_session",
      () => finishSessionCheck.promise,
    );

    await expect(
      dispatcher.dispatch(blockedJob, "token_manual", async () => undefined),
    ).rejects.toBeInstanceOf(DelayedError);

    finishSessionCheck.resolve();
    await sessionRun;
    expect(blockedJob.promote).toHaveBeenCalledTimes(1);
  });

  it("does not reserve free accounts when a multi-account job is deferred", async () => {
    const dispatcher = new AccountJobDispatcher();
    const finishPaid = createDeferred<void>();
    const paidRun = dispatcher.dispatch(
      createJob("paid", ["paid"]),
      "token_paid",
      () => finishPaid.promise,
    );
    const mixedJob = createJob("mixed", ["paid", "free"]);
    const mixedOperation = vi.fn(async () => undefined);

    await expect(
      dispatcher.dispatch(mixedJob, "token_mixed", mixedOperation),
    ).rejects.toBeInstanceOf(DelayedError);
    await expect(
      dispatcher.dispatch(
        createJob("free", ["free"]),
        "token_free",
        async () => "free ran",
      ),
    ).resolves.toBe("free ran");

    expect(mixedOperation).not.toHaveBeenCalled();
    finishPaid.resolve();
    await paidRun;
    expect(mixedJob.promote).toHaveBeenCalledTimes(1);
  });

  it("releases accounts and resumes a deferred job after an operation fails", async () => {
    const dispatcher = new AccountJobDispatcher();
    const finishFirst = createDeferred<void>();
    const firstJob = createJob("first", ["paid"]);
    const nextJob = createJob("next", ["paid"]);
    const firstRun = dispatcher.dispatch(firstJob, "token_first", async () => {
      await finishFirst.promise;
      throw new Error("Check failed");
    });

    await expect(
      dispatcher.dispatch(nextJob, "token_next", async () => "next ran"),
    ).rejects.toBeInstanceOf(DelayedError);
    finishFirst.resolve();
    await expect(firstRun).rejects.toThrow("Check failed");

    expect(nextJob.promote).toHaveBeenCalledTimes(1);
    await expect(
      dispatcher.dispatch(nextJob, "token_next_retry", async () => "next ran"),
    ).resolves.toBe("next ran");
  });

  it("continues promoting compatible jobs when an earlier promotion fails", async () => {
    const logger = { warn: vi.fn() };
    const dispatcher = new AccountJobDispatcher({ logger });
    const finishFirst = createDeferred<void>();
    const firstRun = dispatcher.dispatch(
      createJob("first", ["paid"]),
      "token_first",
      () => finishFirst.promise,
    );
    const failedPromotionJob = createJob("failed_promotion", ["paid"]);
    const nextJob = createJob("next", ["paid"]);

    failedPromotionJob.promote.mockRejectedValueOnce(new Error("Redis unavailable"));
    await expect(
      dispatcher.dispatch(
        failedPromotionJob,
        "token_failed_promotion",
        async () => undefined,
      ),
    ).rejects.toBeInstanceOf(DelayedError);
    await expect(
      dispatcher.dispatch(nextJob, "token_next", async () => undefined),
    ).rejects.toBeInstanceOf(DelayedError);

    finishFirst.resolve();
    await firstRun;

    expect(logger.warn).toHaveBeenCalledWith(
      "Unable to resume account-scoped job failed_promotion.",
      expect.any(Error),
    );
    expect(nextJob.promote).toHaveBeenCalledTimes(1);
  });

  it("keeps a resumed job's accounts claimed if promotion reports a late failure", async () => {
    const logger = { warn: vi.fn() };
    const dispatcher = new AccountJobDispatcher({ logger });
    const finishFirst = createDeferred<void>();
    const finishResumed = createDeferred<void>();
    const promotion = createDeferred<void>();
    const firstRun = dispatcher.dispatch(
      createJob("first", ["paid"]),
      "token_first",
      () => finishFirst.promise,
    );
    const resumedJob = createJob("resumed", ["paid"]);
    const nextJob = createJob("next", ["paid"]);

    vi.mocked(resumedJob.promote).mockImplementation(() => promotion.promise);
    await expect(
      dispatcher.dispatch(resumedJob, "token_resumed", async () => undefined),
    ).rejects.toBeInstanceOf(DelayedError);
    finishFirst.resolve();
    await vi.waitFor(() => expect(resumedJob.promote).toHaveBeenCalledTimes(1));

    const resumedRun = dispatcher.dispatch(
      resumedJob,
      "token_resumed_retry",
      () => finishResumed.promise,
    );

    promotion.reject(new Error("Late promote failure"));
    await firstRun;
    await expect(
      dispatcher.dispatch(nextJob, "token_next", async () => undefined),
    ).rejects.toBeInstanceOf(DelayedError);

    finishResumed.resolve();
    await resumedRun;
    expect(nextJob.promote).toHaveBeenCalledTimes(1);
  });
});

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, reject, resolve };
}

function createJob(id: string, accounts: string[]): DispatchableAccountJob {
  return {
    data: {
      accounts,
      checkId: `check_${id}`,
      checkKey: id,
      projectSlug: "account",
      rootDir: "/runtime/checks",
      type: "browser",
    },
    id,
    moveToDelayed: vi.fn(async () => undefined),
    promote: vi.fn(async () => undefined),
  };
}

function createTestSessionJob(id: string, accounts: string[]): DispatchableAccountJob {
  return {
    data: {
      check: {
        accounts,
        alertChannelLogicalIds: [],
        enabled: true,
        entrypoint: `${id}.spec.ts`,
        key: id,
        muted: false,
        name: id,
        shouldFail: false,
        tags: [],
        type: "browser",
      },
      env: [],
      existingRunId: `run_${id}`,
      kind: "test-session-check",
      projectSlug: "account",
      reporter: "github",
      rootDir: "/runtime/test-sessions/session_1",
      sessionId: "session_1",
      testSessionDeadline: {
        at: Date.now() + 30 * 60_000,
        timeoutMs: 30 * 60_000,
      },
    },
    id,
    moveToDelayed: vi.fn(async () => undefined),
    promote: vi.fn(async () => undefined),
  };
}
