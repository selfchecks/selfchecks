#!/usr/bin/env node
import { createRemoteSelfchecksProgram } from "./program.js";

const program = createRemoteSelfchecksProgram();

program.parseAsync().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
