// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
// @ts-expect-error The release script is a standalone JavaScript entrypoint.
import { publishPackages } from "./publish-npm-packages.mjs";
const env = { NODE_AUTH_TOKEN: "test", YARN_NPM_AUTH_TOKEN: "test" };
const readPackage = (dir: string) => ({ name: dir, version: "1.2.3" });
const ok = { status: 0, stdout: '"1.2.3"', stderr: "" };
const missing = { status: 1, stdout: '{"error":{"code":"E404"}}', stderr: "" };

describe("npm publication", () => {
  it("checks authentication and publishes missing versions using Yarn and the explicit npm registry", () => {
    const run = vi.fn((command: string, args: string[]) =>
      command === "npm" && args[0] === "view" ? missing : ok,
    );
    publishPackages({ run, readPackage, env, log: vi.fn() });
    expect(run.mock.calls[0]).toMatchObject([
      "npm",
      ["whoami", "--registry", "https://registry.npmjs.org", "--json"],
      expect.any(Object),
    ]);
    expect(run.mock.calls.filter(([cmd]) => cmd === "yarn")).toHaveLength(3);
    expect(run).toHaveBeenCalledWith(
      "yarn",
      ["npm", "publish", "--access", "public", "--provenance"],
      expect.objectContaining({
        cwd: "packages/checkly-compat",
        env: expect.objectContaining({
          YARN_NPM_REGISTRY_SERVER: "https://registry.npmjs.org",
          YARN_NPM_PUBLISH_REGISTRY: "https://registry.npmjs.org",
        }),
      }),
    );
  });
  it("skips existing versions so a failed release can be rerun", () => {
    const run = vi.fn(() => ok);
    publishPackages({ run, readPackage, env, log: vi.fn() });
    expect(run).toHaveBeenCalledTimes(4);
    expect(run.mock.calls.flat()).not.toContain("yarn");
  });
  it.each(["E401", "E403", "E500", "ENOTFOUND", "ETIMEDOUT"])(
    "stops on registry lookup error %s rather than publishing",
    (code) => {
      const run = vi
        .fn()
        .mockReturnValueOnce(ok)
        .mockReturnValue({ status: 1, stdout: JSON.stringify({ error: { code } }) });
      expect(() => publishPackages({ run, readPackage, env })).toThrow(code);
      expect(run).toHaveBeenCalledTimes(2);
    },
  );
  it("rejects authentication failures before any lookup or publication", () => {
    const run = vi.fn(() => ({ status: 1, stderr: '{"error":{"code":"E401"}}' }));
    expect(() => publishPackages({ run, readPackage, env })).toThrow(
      "authentication failed (E401)",
    );
    expect(run).toHaveBeenCalledOnce();
  });
  it("rejects missing credentials without contacting the registry", () => {
    const run = vi.fn();
    expect(() => publishPackages({ run, env: {} })).toThrow("NPM_TOKEN is required");
    expect(run).not.toHaveBeenCalled();
  });
  it("stops on publication failure without attempting later packages", () => {
    const run = vi
      .fn()
      .mockReturnValueOnce(ok)
      .mockReturnValueOnce(missing)
      .mockReturnValue({ status: 1 });
    expect(() => publishPackages({ run, readPackage, env, log: vi.fn() })).toThrow(
      "Publication failed",
    );
    expect(run).toHaveBeenCalledTimes(3);
  });
  it("does not treat non-JSON lookup failures or unexpected successful responses as a missing version", () => {
    const run = vi
      .fn()
      .mockReturnValueOnce(ok)
      .mockReturnValue({ status: 1, stderr: "connection failed" });
    expect(() => publishPackages({ run, readPackage, env })).toThrow("lookup failed");
    run
      .mockReset()
      .mockReturnValueOnce(ok)
      .mockReturnValue({ status: 0, stdout: '"9.9.9"' });
    expect(() => publishPackages({ run, readPackage, env })).toThrow(
      "Unexpected registry version",
    );
  });
});
