import path from "node:path";

import { Command } from "commander";

import {
  type CheckDefinition,
  importCheckDefinitions,
  normalizeTags,
} from "@selfchecks/core";

import { applyDatabaseMigrations } from "./migrations.js";
import {
  runRemoteTestSession,
  type RemoteTestSessionOptions,
} from "./remote-test-session.js";
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
  checkTypes: CheckDefinition["type"][];
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
  runChecksRemotely?: (options: RemoteTestSessionOptions) => Promise<RunChecksSummary>;
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

export function parseCheckType(value: string): CheckDefinition["type"] {
  const type = value.trim().toLowerCase();

  if (type !== "api" && type !== "browser") {
    throw new Error(`Expected check type to be api or browser: ${value}`);
  }

  return type;
}

export function parseEnvJson(value: string | undefined): EnvVar[] {
  if (!value) {
    return [];
  }

  const parsed = JSON.parse(value) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error("SELFCHECKS_ENV_JSON must contain an array.");
  }

  return parsed.map((item) => {
    if (
      !item ||
      typeof item !== "object" ||
      !("name" in item) ||
      !("value" in item) ||
      typeof item.name !== "string" ||
      typeof item.value !== "string"
    ) {
      throw new Error("SELFCHECKS_ENV_JSON contains an invalid environment value.");
    }

    return {
      name: item.name,
      value: item.value,
    };
  });
}

function resolveDeployRootDir(commandOptions: {
  config?: string | boolean;
  root?: string | boolean;
}): string {
  if (typeof commandOptions.root === "string") {
    return commandOptions.root;
  }

  if (typeof commandOptions.config === "string") {
    return path.dirname(commandOptions.config);
  }

  return process.cwd();
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
  const runChecksRemotely = options.runChecksRemotely ?? runRemoteTestSession;

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
    .option("--root <path>", "Repository root")
    .option("--dry-run", "Parse definitions and print the deploy diff only")
    .action(async (commandOptions: Record<string, string | boolean | undefined>) => {
      const projectSlug = String(commandOptions.project ?? "default");
      const rootDir = resolveDeployRootDir(commandOptions);
      const parsedSummary = await importCheckDefinitions({
        projectSlug,
        rootDir,
      });
      const summary = commandOptions.dryRun
        ? parsedSummary
        : await (async () => {
            await migrateDatabase();

            return deployChecks({
              allowRemovals: Boolean(commandOptions.force),
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
    .description("Run selected checks in an isolated test session.")
    .option("--tags <tags>", "Comma-separated tag selector", collect, [])
    .option("--check <key>", "Run a specific check key", collect, [])
    .option("--type <type>", "Run checks of a specific type", collect, [])
    .option("-e, --env <name=value>", "Runtime environment variable", collect, [])
    .option("--project <slug>", "Project slug", "default")
    .option("--record", "Persist the run and artifacts")
    .option("--reporter <name>", "Reporter name", "list")
    .option("--retries <count>", "Override configured failed-check retries")
    .option("--root <path>", "Repository root", process.cwd())
    .option("--test-session-name <name>", "Display name for the test session")
    .option("--api-url <url>", "Selfchecks API URL", process.env.SELFCHECKS_URL)
    .option(
      "--api-token <token>",
      "Selfchecks API token",
      process.env.SELFCHECKS_API_TOKEN,
    )
    .action(
      async (commandOptions: {
        apiToken?: string;
        apiUrl?: string;
        check: string[];
        env: string[];
        project: string;
        record?: boolean;
        reporter: string;
        retries?: string;
        root: string;
        tags: string[];
        testSessionName?: string;
        type: string[];
      }) => {
        const checkTypes = commandOptions.type.map(parseCheckType);
        const tagSets = commandOptions.tags.map((tagSet) =>
          normalizeTags(tagSet.split(",")),
        );
        const env = [
          ...parseEnvJson(process.env.SELFCHECKS_ENV_JSON),
          ...commandOptions.env.map(parseEnv),
        ];
        const retries = commandOptions.retries
          ? parseRetries(commandOptions.retries)
          : undefined;
        const hasRemoteConfig = Boolean(
          commandOptions.apiUrl || commandOptions.apiToken,
        );

        if (hasRemoteConfig && (!commandOptions.apiUrl || !commandOptions.apiToken)) {
          throw new Error(
            "SELFCHECKS_URL and SELFCHECKS_API_TOKEN are both required for remote tests.",
          );
        }

        const summary = hasRemoteConfig
          ? await runChecksRemotely({
              apiToken: commandOptions.apiToken!,
              apiUrl: commandOptions.apiUrl!,
              checkKeys: commandOptions.check,
              checkTypes,
              commitSha: process.env.CI_COMMIT_SHA,
              env,
              projectSlug: commandOptions.project,
              reporter: commandOptions.reporter,
              retries,
              rootDir: commandOptions.root,
              source: buildCiSource(),
              tagSets,
              testSessionName: commandOptions.testSessionName,
            })
          : await (async () => {
              const imported = await importCheckDefinitions({
                projectSlug: commandOptions.project,
                rootDir: commandOptions.root,
              });

              return runChecksLocally({
                checkKeys: commandOptions.check,
                checkTypes,
                checks: imported.checks,
                env,
                projectSlug: commandOptions.project,
                record: Boolean(commandOptions.record),
                reporter: commandOptions.reporter,
                retries,
                rootDir: commandOptions.root,
                runMode: "test",
                tagSets,
                testSessionName: commandOptions.testSessionName,
              });
            })();

        write({
          checkKeys: commandOptions.check,
          checkTypes,
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

        if (summary.failed > 0) {
          process.exitCode = 1;
        }
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
          runMode: "monitoring",
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

function buildCiSource(): string | undefined {
  const ref =
    process.env.CI_COMMIT_TAG ||
    process.env.CI_COMMIT_REF_NAME ||
    process.env.CI_COMMIT_SHORT_SHA ||
    process.env.CI_COMMIT_SHA;
  const parts = [
    process.env.CI_PROJECT_PATH,
    ref,
    process.env.CI_COMMIT_SHORT_SHA,
    process.env.CI_PIPELINE_URL ? `pipeline ${process.env.CI_PIPELINE_URL}` : undefined,
    process.env.CI_JOB_URL ? `job ${process.env.CI_JOB_URL}` : undefined,
  ].filter((value): value is string => Boolean(value));

  return parts.length > 0 ? parts.join(" | ") : undefined;
}
