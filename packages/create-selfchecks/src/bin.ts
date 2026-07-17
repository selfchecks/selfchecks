#!/usr/bin/env node
import path from "node:path";

import { createSelfchecksProject } from "./index.js";

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  printHelp();
  process.exit(0);
}

const skipInstall = args.includes("--skip-install");
const positionalArgs = args.filter((argument) => !argument.startsWith("-"));
const unknownOptions = args.filter(
  (argument) => argument.startsWith("-") && argument !== "--skip-install",
);

if (unknownOptions.length > 0) {
  fail(`Unknown option: ${unknownOptions[0]}`);
} else if (positionalArgs.length > 1) {
  fail("Expected at most one target directory.");
} else {
  const targetDir = positionalArgs[0] ?? "selfchecks-project";

  createSelfchecksProject({ install: !skipInstall, targetDir })
    .then((result) => {
      const relativeDir = path.relative(process.cwd(), result.targetDir) || ".";
      const displayDir = path.isAbsolute(targetDir) ? result.targetDir : relativeDir;

      process.stdout.write(`\nCreated Selfchecks project in ${result.targetDir}\n\n`);
      process.stdout.write("Next steps:\n");

      if (relativeDir !== ".") {
        process.stdout.write(`  cd ${JSON.stringify(displayDir)}\n`);
      }

      if (!result.installed) {
        process.stdout.write("  npm install\n");
      }

      process.stdout.write("  npx playwright install chromium\n");
      process.stdout.write("  npm test\n");
    })
    .catch((error: unknown) => {
      fail(error instanceof Error ? error.message : String(error));
    });
}

function printHelp(): void {
  process.stdout.write(`Usage: create-selfchecks [directory] [options]

Create a minimal Selfchecks project with a browser check for
https://selfchecks.github.io/.

Arguments:
  directory       Target directory (default: selfchecks-project)

Options:
  --skip-install  Create files without running npm install
  -h, --help      Display this help
`);
}

function fail(message: string): void {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
