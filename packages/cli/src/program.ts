import { Command } from "commander";

import { importCheckDefinitions, normalizeTags } from "@selfchecks/core";

import { applyDatabaseMigrations } from "./migrations.js";
import { runChecks, type EnvVar, type RunChecksSummary } from "./runner.js";
import { persistDeploySummary } from "./storage.js";

export type DeployCommandOutput = {
  command: "deploy";
  configPath: string;
  dryRun: boolean;
  force: boolean;
  projectSlug: string;
  rootDir: string;
  status: "deployed" | "parsed";
  summary: Awaited<ReturnType<typeof importCheckDefinitions>>;
};

export type TestCommandOutput = {
  checkKeys: string[];
  command: "test";
  env: EnvVar[];
  projectSlug: string;
  record: boolean;
  reporter: string;
  rootDir: string;
  status: "completed";
  summary: RunChecksSummary;
  tagSets: string[][];
};

export type TriggerCommandOutput = {
  command: "trigger";
  projectSlug: string;
  record: boolean;
  reporter: string;
  retries?: number;
  rootDir: string;
  status: "completed";
  summary: RunChecksSummary;
  testSessionName?: string;
};

export type CliCommandOutput =
  | DeployCommandOutput
  | TestCommandOutput
  | TriggerCommandOutput;

export type CreateSelfchecksProgramOptions = {
  deployChecks?: typeof persistDeploySummary;
  migrateDatabase?: typeof applyDatabaseMigrations;
  runChecksLocally?: typeof runChecks;
  write?: (value: CliCommandOutput) => void;
};

function collect(value: string, previous: string[] = []): string[] {
  return [...previous, value];
}

export function parseEnv(value: string): EnvVar {
  const separatorIndex = value.indexOf("=");

  if (separatorIndex <= 0) {
    throw new Error(`Expected environment value in NAME=value format: ${value}`);
  }

  return {
    name: value.slice(0, separatorIndex),
    value: value.slice(separatorIndex + 1),
  };
}

export function parseRetries(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new Error(`Expected retries to be a non-negative integer: ${value}`);
  }

  const retries = Number.parseInt(value, 10);

  if (!Number.isSafeInteger(retries)) {
    throw new Error(`Expected retries to be a non-negative integer: ${value}`);
  }

  return retries;
}

export function createSelfchecksProgram(
  options: CreateSelfchecksProgramOptions = {},
): Command {
  const write =
    options.write ??
    ((value: CliCommandOutput) => {
      process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    });
  const deployChecks = options.deployChecks ?? persistDeploySummary;
  const migrateDatabase = options.migrateDatabase ?? applyDatabaseMigrations;
  const runChecksLocally = options.runChecksLocally ?? runChecks;

  const program = new Command();

  program
    .name("selfchecks")
    .description("Self-hosted synthetic checks runner and dashboard CLI.")
    .version("0.0.0");

  program
    .command("deploy")
    .description("Import and deploy check definitions from the current repository.")
    .option("-c, --config <path>", "Path to a Checkly-compatible config file")
    .option("--force", "Deploy even when the diff contains removals")
    .option("--project <slug>", "Project slug", "default")
    .option("--root <path>", "Repository root", process.cwd())
    .option("--dry-run", "Parse definitions and print the deploy diff only")
    .action(async (commandOptions: Record<string, string | boolean | undefined>) => {
      const projectSlug = String(commandOptions.project ?? "default");
      const rootDir = String(commandOptions.root ?? process.cwd());
      const parsedSummary = await importCheckDefinitions({
        projectSlug,
        rootDir,
      });
      const summary = commandOptions.dryRun
        ? parsedSummary
        : await (async () => {
            await migrateDatabase();

            return deployChecks({
              projectSlug,
              rootDir,
              summary: parsedSummary,
            });
          })();

      write({
        command: "deploy",
        configPath: String(commandOptions.config ?? "checkly.config.ts"),
        dryRun: Boolean(commandOptions.dryRun),
        force: Boolean(commandOptions.force),
        projectSlug,
        rootDir,
        status: commandOptions.dryRun ? "parsed" : "deployed",
        summary,
      });
    });

  program
    .command("test")
    .description("Run selected checks locally for ad-hoc CI validation.")
    .option("--tags <tags>", "Comma-separated tag selector", collect, [])
    .option("--check <key>", "Run a specific check key", collect, [])
    .option("-e, --env <name=value>", "Runtime environment variable", collect, [])
    .option("--project <slug>", "Project slug", "default")
    .option("--record", "Persist the run and artifacts")
    .option("--reporter <name>", "Reporter name", "list")
    .option("--root <path>", "Repository root", process.cwd())
    .action(
      async (commandOptions: {
        check: string[];
        env: string[];
        project: string;
        record?: boolean;
        reporter: string;
        root: string;
        tags: string[];
      }) => {
        const tagSets = commandOptions.tags.map((tagSet) =>
          normalizeTags(tagSet.split(",")),
        );
        const env = commandOptions.env.map(parseEnv);
        const summary = await runChecksLocally({
          checkKeys: commandOptions.check,
          env,
          projectSlug: commandOptions.project,
          record: Boolean(commandOptions.record),
          reporter: commandOptions.reporter,
          rootDir: commandOptions.root,
          tagSets,
        });

        write({
          checkKeys: commandOptions.check,
          command: "test",
          env,
          projectSlug: commandOptions.project,
          record: Boolean(commandOptions.record),
          reporter: commandOptions.reporter,
          rootDir: commandOptions.root,
          status: "completed",
          summary,
          tagSets,
        });
      },
    );

  program
    .command("trigger")
    .description("Queue deployed checks for execution.")
    .option("-e, --env <name=value>", "Runtime environment variable", collect, [])
    .option("--project <slug>", "Project slug", "default")
    .option("--record", "Persist the run and artifacts")
    .option("--reporter <name>", "Reporter name", "list")
    .option("--retries <count>", "Override configured failed-check retries")
    .option("--root <path>", "Repository root", process.cwd())
    .option("--test-session-name <name>", "Display name for the created test session")
    .action(
      async (commandOptions: {
        env: string[];
        project: string;
        record?: boolean;
        reporter: string;
        retries?: string;
        root: string;
        testSessionName?: string;
      }) => {
        const retries =
          typeof commandOptions.retries === "string"
            ? parseRetries(commandOptions.retries)
            : undefined;
        const env = commandOptions.env.map(parseEnv);
        const summary = await runChecksLocally({
          env,
          projectSlug: commandOptions.project,
          record: Boolean(commandOptions.record),
          reporter: commandOptions.reporter,
          retries,
          rootDir: commandOptions.root,
          tagSets: [],
          testSessionName: commandOptions.testSessionName,
        });

        write({
          command: "trigger",
          projectSlug: commandOptions.project,
          record: Boolean(commandOptions.record),
          reporter: commandOptions.reporter,
          ...(typeof retries === "number" ? { retries } : {}),
          rootDir: commandOptions.root,
          status: "completed",
          summary,
          testSessionName: commandOptions.testSessionName,
        });
      },
    );

  return program;
}
