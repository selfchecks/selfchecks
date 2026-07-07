import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSelfchecksProgram: vi.fn(),
  parseAsync: vi.fn(),
}));

vi.mock("./program.js", () => ({
  createSelfchecksProgram: mocks.createSelfchecksProgram,
}));

describe("CLI entrypoint", () => {
  let stderrWrite: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    mocks.createSelfchecksProgram.mockReturnValue({
      parseAsync: mocks.parseAsync,
    });
    mocks.parseAsync.mockResolvedValue(undefined);
    stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    process.exitCode = undefined;
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it("creates and parses the CLI program", async () => {
    await import("./index.js");

    expect(mocks.createSelfchecksProgram).toHaveBeenCalled();
    expect(mocks.parseAsync).toHaveBeenCalled();
  });

  it("writes parse errors to stderr and sets a failing exit code", async () => {
    mocks.parseAsync.mockRejectedValue(new Error("Invalid command"));

    await import("./index.js");
    await new Promise((resolve) => setImmediate(resolve));

    expect(stderrWrite).toHaveBeenCalledWith("Invalid command\n");
    expect(process.exitCode).toBe(1);
  });
});
