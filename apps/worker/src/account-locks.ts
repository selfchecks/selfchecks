type AccountLockOptions = {
  signal?: AbortSignal;
};

type AccountLockState = {
  locked: boolean;
  waiters: AccountLockWaiter[];
};

type AccountLockWaiter = {
  onAbort?: () => void;
  reject: (error: Error) => void;
  resolve: (release: () => void) => void;
  signal?: AbortSignal;
};

export class AccountLockManager {
  private readonly states = new Map<string, AccountLockState>();

  async run<T>(
    accounts: readonly string[] | null | undefined,
    operation: () => Promise<T>,
    options: AccountLockOptions = {},
  ): Promise<T> {
    const release = await this.acquire(accounts, options.signal);

    try {
      return await operation();
    } finally {
      release();
    }
  }

  private async acquire(
    accounts: readonly string[] | null | undefined,
    signal?: AbortSignal,
  ): Promise<() => void> {
    const releases: Array<() => void> = [];
    const keys = normalizeAccounts(accounts);

    if (signal?.aborted) {
      throw createAbortError();
    }

    try {
      for (const key of keys) {
        releases.push(await this.acquireOne(key, signal));
      }
    } catch (error) {
      releases.reverse().forEach((release) => release());
      throw error;
    }

    let released = false;

    return () => {
      if (released) {
        return;
      }

      released = true;
      releases.reverse().forEach((release) => release());
    };
  }

  private acquireOne(key: string, signal?: AbortSignal): Promise<() => void> {
    const state = this.states.get(key) ?? {
      locked: false,
      waiters: [],
    };

    this.states.set(key, state);

    if (!state.locked) {
      state.locked = true;
      return Promise.resolve(() => this.releaseOne(key));
    }

    return new Promise<() => void>((resolve, reject) => {
      const waiter: AccountLockWaiter = {
        reject,
        resolve,
        signal,
      };

      if (signal) {
        waiter.onAbort = () => {
          const waiterIndex = state.waiters.indexOf(waiter);

          if (waiterIndex === -1) {
            return;
          }

          state.waiters.splice(waiterIndex, 1);
          reject(createAbortError());
        };
        signal.addEventListener("abort", waiter.onAbort, { once: true });
      }

      state.waiters.push(waiter);

      if (signal?.aborted) {
        waiter.onAbort?.();
      }
    });
  }

  private releaseOne(key: string): void {
    const state = this.states.get(key);

    if (!state) {
      return;
    }

    while (state.waiters.length > 0) {
      const waiter = state.waiters.shift()!;

      if (waiter.onAbort && waiter.signal) {
        waiter.signal.removeEventListener("abort", waiter.onAbort);
      }

      if (waiter.signal?.aborted) {
        waiter.reject(createAbortError());
        continue;
      }

      waiter.resolve(() => this.releaseOne(key));
      return;
    }

    this.states.delete(key);
  }
}

export const accountLockManager = new AccountLockManager();

function normalizeAccounts(accounts: readonly string[] | null | undefined): string[] {
  return [
    ...new Set((accounts ?? []).map((account) => account.trim()).filter(Boolean)),
  ].sort();
}

function createAbortError(): Error {
  const error = new Error("Account lock acquisition was aborted.");
  error.name = "AbortError";
  return error;
}
