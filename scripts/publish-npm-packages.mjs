import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const registry = "https://registry.npmjs.org";
const packageDirs = [
  "packages/checkly-compat",
  "packages/npm-cli",
  "packages/create-selfchecks",
];

function errorCode(result) {
  for (const output of [result.stdout, result.stderr]) {
    try {
      const code = JSON.parse(output)?.error?.code;
      if (typeof code === "string") return code;
    } catch {
      // Non-JSON output is never interpreted as a missing version.
    }
  }
  return result.error?.code ?? `exit ${result.status ?? "unknown"}`;
}

export function publishPackages({
  run = spawnSync,
  readPackage = (dir) =>
    JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")),
  env = process.env,
  log = console.log,
} = {}) {
  if (!env.NODE_AUTH_TOKEN || !env.YARN_NPM_AUTH_TOKEN)
    throw new Error("NPM_TOKEN is required for package publication.");
  const publishEnv = {
    ...env,
    YARN_NPM_REGISTRY_SERVER: registry,
    YARN_NPM_PUBLISH_REGISTRY: registry,
  };
  const options = { encoding: "utf8", env: publishEnv };
  // Check the same credential used by Yarn, without displaying the token.
  const auth = run("npm", ["whoami", "--registry", registry, "--json"], {
    ...options,
    env: { ...publishEnv, NODE_AUTH_TOKEN: env.YARN_NPM_AUTH_TOKEN },
  });
  if (auth.status !== 0)
    throw new Error(
      `npm authentication failed (${errorCode(auth)}). Check NPM_TOKEN validity and registry access.`,
    );

  for (const dir of packageDirs) {
    const { name, version } = readPackage(dir);
    const spec = `${name}@${version}`;
    const existing = run(
      "npm",
      ["view", spec, "version", "--registry", registry, "--json"],
      options,
    );
    if (existing.status === 0) {
      // Unexpected registry output must not silently skip publication.
      if (JSON.parse(existing.stdout) !== version)
        throw new Error(`Unexpected registry version for ${spec}.`);
      log(`${spec} is already published`);
      continue;
    }
    const code = errorCode(existing);
    if (code !== "E404")
      throw new Error(
        `npm version lookup failed for ${spec} (${code}); publication stopped.`,
      );

    log(`Publishing ${spec} to ${registry}`);
    const published = run(
      "yarn",
      ["npm", "publish", "--access", "public", "--provenance"],
      {
        ...options,
        cwd: dir,
        stdio: "inherit",
      },
    );
    if (published.status !== 0)
      throw new Error(`Publication failed for ${spec} (${errorCode(published)}).`);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  try {
    publishPackages();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
