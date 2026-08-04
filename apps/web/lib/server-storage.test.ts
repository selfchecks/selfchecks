import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  lstat: vi.fn(),
  readdir: vi.fn(),
  statfs: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  ...mocks,
  default: mocks,
}));

import { getServerStorageUsage } from "./server-storage";

describe("server storage", () => {
  afterEach(() => {
    vi.resetAllMocks();
    vi.unstubAllEnvs();
  });

  it("splits the artifact filesystem into free, artifact and other space", async () => {
    vi.stubEnv("SELFCHECKS_ARTIFACTS_DIR", "/srv/selfchecks/artifacts");
    mocks.statfs.mockResolvedValue({
      bavail: 400n,
      blocks: 1_000n,
      bsize: 4_096n,
    });
    mocks.readdir.mockResolvedValue(["trace.zip"]);
    mocks.lstat.mockImplementation(async (targetPath: string) =>
      targetPath.endsWith("trace.zip")
        ? createStats({ blocks: 100n })
        : createStats({ blocks: 8n, directory: true }),
    );

    await expect(getServerStorageUsage()).resolves.toEqual({
      artifactsBytes: 55_296,
      freeBytes: 1_638_400,
      otherBytes: 2_402_304,
      totalBytes: 4_096_000,
    });
    expect(mocks.statfs).toHaveBeenCalledWith("/srv/selfchecks/artifacts", {
      bigint: true,
    });
  });

  it("uses the nearest existing parent when the artifacts directory is absent", async () => {
    const notFound = Object.assign(new Error("Not found"), { code: "ENOENT" });
    vi.stubEnv("SELFCHECKS_ARTIFACTS_DIR", "/srv/selfchecks/artifacts");
    mocks.statfs
      .mockRejectedValueOnce(notFound)
      .mockRejectedValueOnce(notFound)
      .mockResolvedValue({ bavail: 75n, blocks: 100n, bsize: 1_024n });
    mocks.lstat.mockRejectedValue(notFound);

    await expect(getServerStorageUsage()).resolves.toEqual({
      artifactsBytes: 0,
      freeBytes: 76_800,
      otherBytes: 25_600,
      totalBytes: 102_400,
    });
    expect(mocks.statfs.mock.calls.map(([targetPath]) => targetPath)).toEqual([
      "/srv/selfchecks/artifacts",
      "/srv/selfchecks",
      "/srv",
    ]);
  });

  it("returns no usage data when filesystem stats cannot be read", async () => {
    const error = new Error("Permission denied");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.statfs.mockRejectedValue(error);
    mocks.lstat.mockRejectedValue(error);

    await expect(getServerStorageUsage()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith("Unable to load server storage usage.", error);
  });
});

function createStats({
  blocks,
  directory = false,
}: {
  blocks: bigint;
  directory?: boolean;
}) {
  return {
    blocks,
    isDirectory: () => directory,
  };
}
