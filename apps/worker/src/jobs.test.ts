import { afterEach, describe, expect, it, vi } from "vitest";

import { handleCheckJob } from "./jobs.js";

describe("handleCheckJob", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a placeholder result until runner execution is implemented", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await expect(
      handleCheckJob({
        data: {
          checkId: "check_1",
          projectSlug: "account",
          type: "browser",
        },
      }),
    ).resolves.toEqual({
      status: "pending_runner_implementation",
    });

    expect(log).toHaveBeenCalledWith("Received browser check check_1 for account");
  });
});
