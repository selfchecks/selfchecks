import { Command } from "commander";

import { normalizeTags } from "@selfchecks/core";

export type EnvVar = {
  name: string;
  value: string;
};

export type DeployCommandOutput = {
  command: "deploy";
  configPath: string;
  dryRun: boolean;
  force: boolean;
  projectSlug: string;
  status: "pending_implementation";
};

export type TestCommandOutput = {
  command: "test";
  env: EnvVar[];
  record: boolean;
  reporter: string;
  status: "pending_implementation";
  tagSets: string[][];
};

export type TriggerCommandOutput = {
  command: "trigger";
  record: boolean;
  reporter: string;
  retries: number;
  status: "pending_implementation";
  testSessionName?: string;
};

export type CliCommandOutput =
  | DeployCommandOutput
  | TestCommandOutput
  | TriggerCommandOutput;

export type CreateSelfchecksProgramOptions = {
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
    .option("--dry-run", "Parse definitions and print the deploy diff only")
    .action((commandOptions: Record<string, string | boolean | undefined>) => {
      write({
        command: "deploy",
        configPath: String(commandOptions.config ?? "checkly.config.ts"),
        dryRun: Boolean(commandOptions.dryRun),
        force: Boolean(commandOptions.force),
        projectSlug: String(commandOptions.project ?? "default"),
        status: "pending_implementation",
      });
    });

  program
    .command("test")
    .description("Run selected checks locally for ad-hoc CI validation.")
    .option("--tags <tags>", "Comma-separated tag selector", collect, [])
    .option("-e, --env <name=value>", "Runtime environment variable", collect, [])
    .option("--record", "Persist the run and artifacts")
    .option("--reporter <name>", "Reporter name", "list")
    .action(
      (commandOptions: {
        env: string[];
        record?: boolean;
        reporter: string;
        tags: string[];
      }) => {
        write({
          command: "test",
          env: commandOptions.env.map(parseEnv),
          record: Boolean(commandOptions.record),
          reporter: commandOptions.reporter,
          status: "pending_implementation",
          tagSets: commandOptions.tags.map((tagSet) =>
            normalizeTags(tagSet.split(",")),
          ),
        });
      },
    );

  program
    .command("trigger")
    .description("Queue deployed checks for execution.")
    .option("--record", "Persist the run and artifacts")
    .option("--reporter <name>", "Reporter name", "list")
    .option("--retries <count>", "Retry failed checks", "0")
    .option("--test-session-name <name>", "Display name for the created test session")
    .action(
      (commandOptions: {
        record?: boolean;
        reporter: string;
        retries: string;
        testSessionName?: string;
      }) => {
        write({
          command: "trigger",
          record: Boolean(commandOptions.record),
          reporter: commandOptions.reporter,
          retries: parseRetries(commandOptions.retries),
          status: "pending_implementation",
          testSessionName: commandOptions.testSessionName,
        });
      },
    );

  return program;
}
