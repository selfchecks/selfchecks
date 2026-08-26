import { describe, expect, it, vi } from "vitest";

import { AccountLockManager } from "./account-locks.js";

describe("AccountLockManager", () => {
  it("allows checks with disjoint accounts to run concurrently", async () => {
    const manager = new AccountLockManager();
    const finish = createDeferred<void>();
    let active = 0;
    let maximumActive = 0;
    const run = (account: string) =>
      manager.run([account], async () => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await finish.promise;
        active -= 1;
      });
    const runs = [run("free"), run("paid")];

    await vi.waitFor(() => expect(maximumActive).toBe(2));
    finish.resolve();
    await Promise.all(runs);
  });

  it("releases every account after a failed check", async () => {
    const manager = new AccountLockManager();

    await expect(
      manager.run(["paid", "free"], async () => {
        throw new Error("Check failed");
      }),
    ).rejects.toThrow("Check failed");
    await expect(
      manager.run(["free", "paid"], async () => "next check ran"),
    ).resolves.toBe("next check ran");
  });

  it("removes a cancelled check from the account wait queue", async () => {
    const manager = new AccountLockManager();
    const finishFirst = createDeferred<void>();
    const controller = new AbortController();
    const firstRun = manager.run(["free"], () => finishFirst.promise);
    const cancelledOperation = vi.fn(async () => undefined);

    await vi.waitFor(() => expect(cancelledOperation).not.toHaveBeenCalled());
    const cancelledRun = manager.run(["free"], cancelledOperation, {
      signal: controller.signal,
    });
    controller.abort();

    await expect(cancelledRun).rejects.toMatchObject({ name: "AbortError" });
    expect(cancelledOperation).not.toHaveBeenCalled();
    finishFirst.resolve();
    await firstRun;
    await expect(manager.run(["free"], async () => "released")).resolves.toBe(
      "released",
    );
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
