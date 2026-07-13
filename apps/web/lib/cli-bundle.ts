import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

type BundleManifestEntry = {
  path: string;
  size: number;
};

export type CliBundleFile = {
  content: Uint8Array;
  path: string;
};

const MAX_BUNDLE_BYTES = 40 * 1024 * 1024;
const MAX_BUNDLE_FILES = 10_000;

export async function parseCliBundle(formData: FormData): Promise<CliBundleFile[]> {
  const manifestValue = formData.get("manifest");

  if (typeof manifestValue !== "string") {
    throw new Error("Bundle manifest is required.");
  }

  const manifest = JSON.parse(manifestValue) as unknown;

  if (!Array.isArray(manifest) || manifest.length === 0) {
    throw new Error("Bundle manifest must contain files.");
  }

  if (manifest.length > MAX_BUNDLE_FILES) {
    throw new Error(`Selfchecks bundle exceeds ${MAX_BUNDLE_FILES} files.`);
  }

  const files: CliBundleFile[] = [];
  const seenPaths = new Set<string>();
  let totalBytes = 0;

  for (const [index, value] of manifest.entries()) {
    const entry = parseManifestEntry(value);
    const file = formData.get(`file-${index}`);

    if (seenPaths.has(entry.path)) {
      throw new Error(`Bundle file ${entry.path} is duplicated.`);
    }

    seenPaths.add(entry.path);

    if (!file || typeof file === "string" || typeof file.arrayBuffer !== "function") {
      throw new Error(`Bundle file ${entry.path} is missing.`);
    }

    if (file.size !== entry.size) {
      throw new Error(`Bundle file ${entry.path} has an invalid size.`);
    }

    totalBytes += file.size;

    if (totalBytes > MAX_BUNDLE_BYTES) {
      throw new Error("Selfchecks bundle exceeds 40 MB.");
    }

    files.push({
      content: new Uint8Array(await file.arrayBuffer()),
      path: entry.path,
    });
  }

  return files;
}

export async function writeCliBundle(
  workspaceRoot: string,
  files: CliBundleFile[],
): Promise<void> {
  for (const file of files) {
    const filePath = path.join(workspaceRoot, ...file.path.split("/"));

    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, file.content);
  }
}

function parseManifestEntry(value: unknown): BundleManifestEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Bundle manifest contains an invalid entry.");
  }

  const entry = value as Partial<BundleManifestEntry>;

  if (typeof entry.path !== "string" || !isSafeRelativePath(entry.path)) {
    throw new Error("Bundle manifest contains an unsafe path.");
  }

  if (!Number.isSafeInteger(entry.size) || (entry.size ?? -1) < 0) {
    throw new Error(`Bundle file ${entry.path} has an invalid size.`);
  }

  return entry as BundleManifestEntry;
}

function isSafeRelativePath(value: string) {
  if (!value || value.includes("\\") || path.posix.isAbsolute(value)) {
    return false;
  }

  const normalized = path.posix.normalize(value);
  return normalized === value && !normalized.startsWith("../") && normalized !== "..";
}
