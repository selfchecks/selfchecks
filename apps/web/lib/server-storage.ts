import path from "node:path";
import { lstat, readdir, statfs } from "node:fs/promises";

const DEFAULT_ARTIFACTS_DIR = ".selfchecks/artifacts";
const FILE_SYSTEM_BLOCK_BYTES = 512n;

export type ServerStorageUsage = {
  artifactsBytes: number;
  freeBytes: number;
  otherBytes: number;
  totalBytes: number;
};

export async function getServerStorageUsage(): Promise<ServerStorageUsage | undefined> {
  const artifactsPath = path.resolve(
    process.env.SELFCHECKS_ARTIFACTS_DIR?.trim() || DEFAULT_ARTIFACTS_DIR,
  );

  try {
    const [fileSystem, measuredArtifactsBytes] = await Promise.all([
      getFileSystemStats(artifactsPath),
      getAllocatedPathSize(artifactsPath),
    ]);
    const totalBytes = fileSystem.blocks * fileSystem.bsize;
    const freeBytes = fileSystem.bavail * fileSystem.bsize;

    return normalizeStorageUsage({
      artifactsBytes: measuredArtifactsBytes,
      freeBytes,
      totalBytes,
    });
  } catch (error) {
    console.warn("Unable to load server storage usage.", error);
    return undefined;
  }
}

function normalizeStorageUsage({
  artifactsBytes,
  freeBytes,
  totalBytes,
}: {
  artifactsBytes: bigint;
  freeBytes: bigint;
  totalBytes: bigint;
}): ServerStorageUsage {
  const safeTotalBytes = clampBigInt(totalBytes, 0n, BigInt(Number.MAX_SAFE_INTEGER));
  const safeFreeBytes = clampBigInt(freeBytes, 0n, safeTotalBytes);
  const usedBytes = safeTotalBytes - safeFreeBytes;
  const safeArtifactsBytes = clampBigInt(artifactsBytes, 0n, usedBytes);

  return {
    artifactsBytes: Number(safeArtifactsBytes),
    freeBytes: Number(safeFreeBytes),
    otherBytes: Number(usedBytes - safeArtifactsBytes),
    totalBytes: Number(safeTotalBytes),
  };
}

async function getFileSystemStats(targetPath: string) {
  let candidatePath = targetPath;

  while (true) {
    try {
      return await statfs(candidatePath, { bigint: true });
    } catch (error) {
      if (!isFileNotFoundError(error)) {
        throw error;
      }

      const parentPath = path.dirname(candidatePath);

      if (parentPath === candidatePath) {
        throw error;
      }

      candidatePath = parentPath;
    }
  }
}

async function getAllocatedPathSize(targetPath: string): Promise<bigint> {
  let pathStats;

  try {
    pathStats = await lstat(targetPath, { bigint: true });
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return 0n;
    }

    throw error;
  }

  let size = pathStats.blocks * FILE_SYSTEM_BLOCK_BYTES;

  if (!pathStats.isDirectory()) {
    return size;
  }

  const entries = await readdir(targetPath);

  for (const entry of entries) {
    size += await getAllocatedPathSize(path.join(targetPath, entry));
  }

  return size;
}

function clampBigInt(value: bigint, minimum: bigint, maximum: bigint): bigint {
  return value < minimum ? minimum : value > maximum ? maximum : value;
}

function isFileNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
