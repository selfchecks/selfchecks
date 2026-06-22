#!/usr/bin/env node
import { createSelfchecksProgram } from "./program.js";

const program = createSelfchecksProgram();

program.parseAsync().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
