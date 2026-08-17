#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const PACKAGE_MANIFESTS = [
  "packages/checkly-compat/package.json",
  "packages/npm-cli/package.json",
  "packages/create-selfchecks/package.json",
];

function nextPatchVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);

  if (!match) {
    throw new Error(`Expected a stable semantic version, received: ${version}`);
  }

  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}

function replaceExactlyOnce(source, currentValue, nextValue, filePath) {
  const firstIndex = source.indexOf(currentValue);

  if (firstIndex === -1) {
    throw new Error(`Unable to find version marker in ${filePath}: ${currentValue}`);
  }

  if (source.indexOf(currentValue, firstIndex + currentValue.length) !== -1) {
    throw new Error(`Version marker is not unique in ${filePath}: ${currentValue}`);
  }

  return `${source.slice(0, firstIndex)}${nextValue}${source.slice(
    firstIndex + currentValue.length,
  )}`;
}

async function readPackageManifest(repositoryRoot, manifestPath) {
  const absolutePath = path.join(repositoryRoot, manifestPath);
  const source = await readFile(absolutePath, "utf8");
  const manifest = JSON.parse(source);

  return { absolutePath, manifest, manifestPath };
}

export async function bumpNpmPackageVersions(repositoryRoot, { write = true } = {}) {
  const manifests = await Promise.all(
    PACKAGE_MANIFESTS.map((manifestPath) =>
      readPackageManifest(repositoryRoot, manifestPath),
    ),
  );
  const versions = new Set(manifests.map(({ manifest }) => manifest.version));

  if (versions.size !== 1) {
    throw new Error(
      `Published package versions must match: ${manifests
        .map(({ manifest, manifestPath }) => `${manifestPath}=${manifest.version}`)
        .join(", ")}`,
    );
  }

  const currentVersion = manifests[0].manifest.version;
  const nextVersion = nextPatchVersion(currentVersion);
  const updates = manifests.map(({ absolutePath, manifest, manifestPath }) => {
    const nextManifest = { ...manifest, version: nextVersion };

    if (manifestPath === "packages/npm-cli/package.json") {
      nextManifest.dependencies = {
        ...manifest.dependencies,
        "@selfchecks/selfchecks": nextVersion,
      };
    }

    return {
      absolutePath,
      source: `${JSON.stringify(nextManifest, null, 2)}\n`,
    };
  });

  const versionMarkers = [
    {
      current: `export const SELFCHECKS_CLI_VERSION = "${currentVersion}";`,
      filePath: "packages/npm-cli/src/version.ts",
      next: `export const SELFCHECKS_CLI_VERSION = "${nextVersion}";`,
    },
    {
      current: `export const SELFCHECKS_PACKAGE_VERSION = "${currentVersion}";`,
      filePath: "packages/create-selfchecks/src/templates.ts",
      next: `export const SELFCHECKS_PACKAGE_VERSION = "${nextVersion}";`,
    },
  ];

  for (const marker of versionMarkers) {
    const absolutePath = path.join(repositoryRoot, marker.filePath);
    const source = await readFile(absolutePath, "utf8");
    const updatedSource = replaceExactlyOnce(
      source,
      marker.current,
      marker.next,
      marker.filePath,
    );

    updates.push({ absolutePath, source: updatedSource });
  }

  if (write) {
    await Promise.all(
      updates.map(({ absolutePath, source }) =>
        writeFile(absolutePath, source, "utf8"),
      ),
    );
  }

  return { currentVersion, nextVersion };
}

const entryPoint = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";

if (import.meta.url === entryPoint) {
  bumpNpmPackageVersions(process.cwd(), {
    write: !process.argv.includes("--dry-run"),
  })
    .then(({ nextVersion }) => {
      process.stdout.write(`${nextVersion}\n`);
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
