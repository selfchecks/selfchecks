import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { bumpNpmPackageVersions } from "./bump-npm-package-versions.mjs";

const manifestPaths = [
  "packages/checkly-compat/package.json",
  "packages/npm-cli/package.json",
  "packages/create-selfchecks/package.json",
];

async function writeFixture(
  repositoryRoot: string,
  relativePath: string,
  source: string,
) {
  const absolutePath = path.join(repositoryRoot, relativePath);

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, source, "utf8");
}

async function createRepositoryFixture(versions = ["1.2.3", "1.2.3", "1.2.3"]) {
  const repositoryRoot = await mkdtemp(
    path.join(os.tmpdir(), "selfchecks-release-version-"),
  );

  await Promise.all(
    manifestPaths.map((manifestPath, index) =>
      writeFixture(
        repositoryRoot,
        manifestPath,
        `${JSON.stringify(
          {
            name: manifestPath,
            version: versions[index],
            ...(manifestPath === "packages/npm-cli/package.json"
              ? {
                  dependencies: {
                    "@selfchecks/selfchecks": "workspace:*",
                    commander: "^14.0.0",
                  },
                }
              : {}),
          },
          null,
          2,
        )}\n`,
      ),
    ),
  );
  await writeFixture(
    repositoryRoot,
    "packages/npm-cli/src/version.ts",
    'export const SELFCHECKS_CLI_VERSION = "1.2.3";\n',
  );
  await writeFixture(
    repositoryRoot,
    "packages/create-selfchecks/src/templates.ts",
    'export const SELFCHECKS_PACKAGE_VERSION = "1.2.3";\n',
  );
  return repositoryRoot;
}

describe("bumpNpmPackageVersions", () => {
  it("bumps package manifests and every embedded published version", async () => {
    const repositoryRoot = await createRepositoryFixture();

    await expect(bumpNpmPackageVersions(repositoryRoot)).resolves.toEqual({
      currentVersion: "1.2.3",
      nextVersion: "1.2.4",
    });

    for (const manifestPath of manifestPaths) {
      const manifest = JSON.parse(
        await readFile(path.join(repositoryRoot, manifestPath), "utf8"),
      ) as { version: string };

      expect(manifest.version).toBe("1.2.4");
    }

    await expect(
      readFile(path.join(repositoryRoot, "packages/npm-cli/src/version.ts"), "utf8"),
    ).resolves.toContain('SELFCHECKS_CLI_VERSION = "1.2.4"');
    const npmCliManifest = JSON.parse(
      await readFile(
        path.join(repositoryRoot, "packages/npm-cli/package.json"),
        "utf8",
      ),
    ) as { dependencies: Record<string, string> };

    expect(npmCliManifest.dependencies).toEqual({
      "@selfchecks/selfchecks": "workspace:*",
      commander: "^14.0.0",
    });
    await expect(
      readFile(
        path.join(repositoryRoot, "packages/create-selfchecks/src/templates.ts"),
        "utf8",
      ),
    ).resolves.toContain('SELFCHECKS_PACKAGE_VERSION = "1.2.4"');
  });

  it("rejects packages with different versions", async () => {
    const repositoryRoot = await createRepositoryFixture(["1.2.3", "1.2.4", "1.2.3"]);

    await expect(bumpNpmPackageVersions(repositoryRoot)).rejects.toThrow(
      "Published package versions must match",
    );
  });

  it("validates and reports a dry-run without changing files", async () => {
    const repositoryRoot = await createRepositoryFixture();
    const manifestPath = path.join(repositoryRoot, manifestPaths[0]);
    const originalManifest = await readFile(manifestPath, "utf8");

    await expect(
      bumpNpmPackageVersions(repositoryRoot, { write: false }),
    ).resolves.toEqual({
      currentVersion: "1.2.3",
      nextVersion: "1.2.4",
    });
    await expect(readFile(manifestPath, "utf8")).resolves.toBe(originalManifest);
  });
});
