import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("deploy workflow", () => {
  it("publishes packages with Yarn so workspace dependencies are resolved", async () => {
    const workflow = await readFile(
      path.join(process.cwd(), ".github/workflows/deploy.yml"),
      "utf8",
    );

    expect(workflow).toContain("YARN_NPM_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}");
    expect(workflow).toContain(
      '(cd "${package_dir}" && yarn npm publish --access public --provenance)',
    );
    expect(workflow).not.toContain(
      'npm publish "./${package_dir}" --access public --provenance',
    );
  });

  it("builds every TypeScript project referenced by the CLI image", async () => {
    const dockerfile = await readFile(
      path.join(process.cwd(), "docker/selfchecks/Dockerfile"),
      "utf8",
    );
    const cliBuildStage = dockerfile.slice(
      dockerfile.indexOf("FROM node:20.19-bookworm-slim AS cli-build"),
    );
    const compatibilityBuildIndex = cliBuildStage.indexOf(
      "yarn workspace @selfchecks/selfchecks build",
    );
    const cliBuildIndex = cliBuildStage.indexOf("yarn workspace @selfchecks/cli build");

    expect(compatibilityBuildIndex).toBeGreaterThan(-1);
    expect(cliBuildIndex).toBeGreaterThan(compatibilityBuildIndex);
  });
});
