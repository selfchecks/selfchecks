import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import { pathToFileURL } from "node:url";

// Tarball availability does not guarantee that install metadata is visible yet.
const retryable =
  /npm (?:error|ERR!) code (?:ETARGET|E404|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNRESET|E502|E503|E504)\b/;

export async function installSmokeStarter({
  cwd,
  run = spawnSync,
  createCache = () => mkdtempSync(path.join(os.tmpdir(), "selfchecks-smoke-npm-")),
  sleep = setTimeout,
  attempts = 30,
  log = console.log,
} = {}) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const result = run(
      "npm",
      [
        "install",
        "--no-audit",
        "--no-fund",
        "--prefer-online",
        "--registry=https://registry.npmjs.org",
        "--cache",
        createCache(),
      ],
      {
        cwd,
        encoding: "utf8",
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    if (result.status === 0) {
      log("Starter dependencies installed successfully.");
      return;
    }
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    if (!retryable.test(output) || attempt === attempts) {
      log(output);
      throw new Error(
        `Starter dependency installation failed (attempt ${attempt}/${attempts}, ${result.error?.code ?? result.status ?? "unknown"}).`,
      );
    }
    log(
      `Starter dependencies are not yet available from npm (attempt ${attempt}/${attempts}); retrying with a fresh cache.`,
    );
    await sleep(5000);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  installSmokeStarter({ cwd: process.argv[2] }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
