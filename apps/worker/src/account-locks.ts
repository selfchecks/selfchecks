import { DelayedError } from "bullmq";

import type { CheckJob } from "./jobs.js";

export type DispatchableAccountJob = {
  data: CheckJob;
  id?: string;
  moveToDelayed: (timestamp: number, token?: string) => Promise<void>;
  promote: () => Promise<void>;
};

type AccountJobDispatcherOptions = {
  deferMs?: number;
  logger?: Pick<Console, "warn">;
  now?: () => number;
};

type ParkedJob = {
  accounts: string[];
  job: DispatchableAccountJob;
  jobId: string;
  parked: boolean;
};

type AccountLease = {
  jobId: string;
  state: "reserved" | "running";
};

const DEFAULT_ACCOUNT_DEFER_MS = 30_000;

export class AccountJobDispatcher {
  private readonly accountLeases = new Map<string, AccountLease>();
  private readonly deferMs: number;
  private readonly logger: Pick<Console, "warn">;
  private readonly now: () => number;
  private readonly parkedJobs = new Map<string, ParkedJob>();
  private promotionQueue = Promise.resolve();

  constructor(options: AccountJobDispatcherOptions = {}) {
    this.deferMs = options.deferMs ?? DEFAULT_ACCOUNT_DEFER_MS;
    this.logger = options.logger ?? console;
    this.now = options.now ?? Date.now;
  }

  async dispatch<T>(
    job: DispatchableAccountJob,
    token: string | undefined,
    operation: () => Promise<T>,
  ): Promise<T> {
    const accounts = getJobAccounts(job.data);

    if (accounts.length === 0) {
      return operation();
    }

    const jobId = job.id;

    if (!jobId) {
      throw new Error("An account-scoped job must have an id.");
    }

    this.parkedJobs.delete(jobId);

    const lease = this.claimAccounts(jobId, accounts, "running");

    if (!lease) {
      await this.park(job, jobId, accounts, token);
      throw new DelayedError();
    }

    try {
      return await operation();
    } finally {
      this.releaseLease(lease, accounts);
      await this.queueEligiblePromotions();
    }
  }

  private claimAccounts(
    jobId: string,
    accounts: string[],
    state: AccountLease["state"],
  ): AccountLease | undefined {
    const leases = accounts.map((account) => this.accountLeases.get(account));
    const canClaim =
      state === "reserved"
        ? leases.every((lease) => lease === undefined)
        : leases.every(
            (lease) =>
              lease === undefined ||
              (lease.jobId === jobId && lease.state === "reserved"),
          );

    if (!canClaim) {
      return undefined;
    }

    const lease: AccountLease = { jobId, state };

    accounts.forEach((account) => this.accountLeases.set(account, lease));
    return lease;
  }

  private async park(
    job: DispatchableAccountJob,
    jobId: string,
    accounts: string[],
    token: string | undefined,
  ): Promise<void> {
    const parkedJob: ParkedJob = {
      accounts,
      job,
      jobId,
      parked: false,
    };

    this.parkedJobs.set(jobId, parkedJob);

    try {
      await job.moveToDelayed(this.now() + this.deferMs, token);
      parkedJob.parked = true;
      await this.queueEligiblePromotions();
    } catch (error) {
      if (this.parkedJobs.get(jobId) === parkedJob) {
        this.parkedJobs.delete(jobId);
      }

      throw error;
    }
  }

  private queueEligiblePromotions(): Promise<void> {
    const promotion = this.promotionQueue.then(() => this.promoteEligibleJobs());

    this.promotionQueue = promotion.catch(() => undefined);
    return promotion;
  }

  private async promoteEligibleJobs(): Promise<void> {
    for (const parkedJob of [...this.parkedJobs.values()]) {
      if (this.parkedJobs.get(parkedJob.jobId) !== parkedJob) {
        continue;
      }

      const lease = parkedJob.parked
        ? this.claimAccounts(parkedJob.jobId, parkedJob.accounts, "reserved")
        : undefined;

      if (!lease) {
        continue;
      }

      this.parkedJobs.delete(parkedJob.jobId);

      try {
        await parkedJob.job.promote();
      } catch (error) {
        this.releaseLease(lease, parkedJob.accounts);
        this.logger.warn(
          `Unable to resume account-scoped job ${parkedJob.jobId}.`,
          error,
        );
      }
    }
  }

  private releaseLease(lease: AccountLease, accounts: string[]): void {
    accounts.forEach((account) => {
      if (this.accountLeases.get(account) === lease) {
        this.accountLeases.delete(account);
      }
    });
  }
}

export const accountJobDispatcher = new AccountJobDispatcher();

function normalizeAccounts(accounts: readonly string[] | null | undefined): string[] {
  return [
    ...new Set((accounts ?? []).map((account) => account.trim()).filter(Boolean)),
  ].sort();
}

function getJobAccounts(job: CheckJob): string[] {
  if ("kind" in job) {
    return job.kind === "test-session-check"
      ? normalizeAccounts(job.check.accounts)
      : [];
  }

  return normalizeAccounts(job.accounts);
}
