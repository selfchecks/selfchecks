// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
// @ts-expect-error Standalone JavaScript release helper.
import { installSmokeStarter } from "./install-smoke-starter.mjs";
const missing = {
  status: 1,
  stderr:
    "npm error code ETARGET\nNo matching version found for @selfchecks/selfchecks-cli@0.1.64.",
};
describe("starter dependency smoke test", () => {
  it("retries actual installation when a tarball exists but dependency resolution still returns ETARGET", async () => {
    const run = vi.fn().mockReturnValueOnce(missing).mockReturnValue({ status: 0 });
    const createCache = vi
      .fn()
      .mockReturnValueOnce("cache1")
      .mockReturnValueOnce("cache2");
    const sleep = vi.fn();
    await installSmokeStarter({
      cwd: "starter",
      run,
      createCache,
      sleep,
      log: vi.fn(),
    });
    expect(run).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenNthCalledWith(
      1,
      "npm",
      expect.arrayContaining([
        "install",
        "--prefer-online",
        "--registry=https://registry.npmjs.org",
        "--cache",
        "cache1",
      ]),
      expect.objectContaining({ cwd: "starter" }),
    );
    expect(run.mock.calls[1]![1]).toContain("cache2");
    expect(sleep).toHaveBeenCalledWith(5000);
  });
  it.each(["E401", "E403", "ERESOLVE", "ELIFECYCLE"])(
    "does not retry permanent error %s",
    async (code) => {
      const run = vi.fn(() => ({ status: 1, stderr: `npm error code ${code}` }));
      const sleep = vi.fn();
      await expect(
        installSmokeStarter({ run, sleep, createCache: () => "cache", log: vi.fn() }),
      ).rejects.toThrow("installation failed");
      expect(run).toHaveBeenCalledOnce();
      expect(sleep).not.toHaveBeenCalled();
    },
  );
  it("bounds registry retries and preserves the final error", async () => {
    const run = vi.fn(() => missing),
      log = vi.fn(),
      sleep = vi.fn();
    await expect(
      installSmokeStarter({ run, attempts: 2, log, sleep, createCache: () => "cache" }),
    ).rejects.toThrow("attempt 2/2");
    expect(run).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("No matching version"));
  });
});
