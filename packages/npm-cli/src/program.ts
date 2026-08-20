import path from "node:path";

import { Command } from "commander";

import {
  runRemoteDeploy,
  type RemoteDeployOptions,
} from "../../cli/src/remote-deploy.js";
import {
  runRemoteTestSession,
  type RemoteTestSessionOptions,
} from "../../cli/src/remote-test-session.js";
import {
  runRemoteTrigger,
  type RemoteTriggerOptions,
} from "../../cli/src/remote-trigger.js";
import { SELFCHECKS_CLI_VERSION } from "./version.js";

export type CheckType = "api" | "browser";

export type EnvVar = {
  name: string;
  value: string;
};

export type RunChecksSummary = {
  durationMs: number;
  failed: number;
  passed: number;
  results: unknown[];
  sessionId?: string;
  skipped: number;
  total: number;
};

type DeploySummary = Awaited<ReturnType<typeof runRemoteDeploy>>;

export type CliCommandOutput =
  | {
      command: "deploy";
      configPath: string;
      dryRun: false;
      force: boolean;
      projectSlug: string;
      rootDir: string;
      status: "deployed";
      summary: DeploySummary;
    }
  | {
      checkKeys: string[];
      checkTypes: CheckType[];
      command: "test";
      env: EnvVar[];
      projectSlug: string;
      record: boolean;
      reporter: string;
      rootDir: string;
      status: "completed" | "queued";
      summary: RunChecksSummary;
      tagSets: string[][];
    }
  | {
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

export type CreateRemoteSelfchecksProgramOptions = {
  deployRemotely?: (options: RemoteDeployOptions) => Promise<DeploySummary>;
  runChecksRemotely?: (options: RemoteTestSessionOptions) => Promise<RunChecksSummary>;
  triggerRemotely?: (options: RemoteTriggerOptions) => Promise<RunChecksSummary>;
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

export function parseCheckType(value: string): CheckType {
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

    return { name: item.name, value: item.value };
  });
}

function normalizeTags(tags: Iterable<string>): string[] {
  return [...new Set([...tags].map((tag) => tag.trim()).filter(Boolean))].sort();
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

function requireRemoteConfig(
  apiUrl: string | boolean | undefined,
  apiToken: string | boolean | undefined,
  command: "deploy" | "test" | "trigger",
): { apiToken: string; apiUrl: string } {
  if (!apiUrl || !apiToken) {
    throw new Error(
      `SELFCHECKS_URL and SELFCHECKS_API_TOKEN are required for ${command}.`,
    );
  }

  return { apiToken: String(apiToken), apiUrl: String(apiUrl) };
}

export function createRemoteSelfchecksProgram(
  options: CreateRemoteSelfchecksProgramOptions = {},
): Command {
  const write =
    options.write ??
    ((value: CliCommandOutput) => {
      process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    });
  const deployRemotely = options.deployRemotely ?? runRemoteDeploy;
  const runChecksRemotely = options.runChecksRemotely ?? runRemoteTestSession;
  const triggerRemotely = options.triggerRemotely ?? runRemoteTrigger;
  const program = new Command();

  program
    .name("selfchecks")
    .description("Remote client for the Selfchecks synthetic checks service.")
    .version(SELFCHECKS_CLI_VERSION);

  program
    .command("deploy")
    .description("Upload and deploy check definitions.")
    .option("-c, --config <path>", "Path to a Checkly-compatible config file")
    .option("--force", "Deploy even when the diff contains removals")
    .option("--project <slug>", "Project slug", "default")
    .option("--root <path>", "Repository root")
    .option("--ref <ref>", "Git branch or tag", resolveCiRef())
    .option("--commit-sha <sha>", "Git commit SHA", process.env.CI_COMMIT_SHA)
    .option("--api-url <url>", "Selfchecks API URL", process.env.SELFCHECKS_URL)
    .option(
      "--api-token <token>",
      "Selfchecks API token",
      process.env.SELFCHECKS_API_TOKEN,
    )
    .action(async (commandOptions: Record<string, string | boolean | undefined>) => {
      const projectSlug = String(commandOptions.project ?? "default");
      const rootDir = resolveDeployRootDir(commandOptions);
      const remote = requireRemoteConfig(
        commandOptions.apiUrl,
        commandOptions.apiToken,
        "deploy",
      );
      const summary = await deployRemotely({
        allowRemovals: Boolean(commandOptions.force),
        ...remote,
        ...(typeof commandOptions.config === "string"
          ? {
              configPath:
                typeof commandOptions.root === "string"
                  ? commandOptions.config
                  : path.basename(commandOptions.config),
            }
          : {}),
        ...(typeof commandOptions.ref === "string"
          ? { gitRef: commandOptions.ref }
          : {}),
        ...(typeof commandOptions.commitSha === "string"
          ? { gitSha: commandOptions.commitSha }
          : {}),
        projectSlug,
        rootDir,
      });

      write({
        command: "deploy",
        configPath: String(commandOptions.config ?? "checkly.config.ts"),
        dryRun: false,
        force: Boolean(commandOptions.force),
        projectSlug,
        rootDir,
        status: "deployed",
        summary,
      });
    });

  program
    .command("test")
    .description("Upload and run selected checks in an isolated test session.")
    .option("--async", "Queue the test session without waiting for completion")
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
    .option("--repository <path>", "CI repository path", process.env.CI_PROJECT_PATH)
    .option("--ref <ref>", "CI branch or tag", resolveCiRef())
    .option("--commit-sha <sha>", "CI commit SHA", process.env.CI_COMMIT_SHA)
    .option("--pipeline-url <url>", "CI pipeline URL", process.env.CI_PIPELINE_URL)
    .option("--job-url <url>", "CI job URL", process.env.CI_JOB_URL)
    .option("--api-url <url>", "Selfchecks API URL", process.env.SELFCHECKS_URL)
    .option(
      "--api-token <token>",
      "Selfchecks API token",
      process.env.SELFCHECKS_API_TOKEN,
    )
    .action(async (commandOptions) => {
      const checkTypes = (commandOptions.type as string[]).map(parseCheckType);
      const tagSets = (commandOptions.tags as string[]).map((tagSet) =>
        normalizeTags(tagSet.split(",")),
      );
      const env = [
        ...parseEnvJson(process.env.SELFCHECKS_ENV_JSON),
        ...(commandOptions.env as string[]).map(parseEnv),
      ];
      const retries = commandOptions.retries
        ? parseRetries(String(commandOptions.retries))
        : undefined;
      const remote = requireRemoteConfig(
        commandOptions.apiUrl,
        commandOptions.apiToken,
        "test",
      );
      const summary = await runChecksRemotely({
        ...remote,
        checkKeys: commandOptions.check as string[],
        checkTypes,
        commitSha: commandOptions.commitSha,
        env,
        jobUrl: commandOptions.jobUrl,
        pipelineUrl: commandOptions.pipelineUrl,
        projectSlug: commandOptions.project,
        ref: commandOptions.ref,
        reporter: commandOptions.reporter,
        repository: commandOptions.repository,
        retries,
        rootDir: commandOptions.root,
        tagSets,
        testSessionName: commandOptions.testSessionName,
        waitForCompletion: !commandOptions.async,
      });

      write({
        checkKeys: commandOptions.check as string[],
        checkTypes,
        command: "test",
        env,
        projectSlug: commandOptions.project,
        record: Boolean(commandOptions.record),
        reporter: commandOptions.reporter,
        rootDir: commandOptions.root,
        status: commandOptions.async ? "queued" : "completed",
        summary,
        tagSets,
      });

      if (summary.failed > 0) {
        process.exitCode = 1;
      }
    });

  program
    .command("trigger")
    .description("Queue the latest deployed checks for execution.")
    .option("-e, --env <name=value>", "Runtime environment variable", collect, [])
    .option("--project <slug>", "Project slug", "default")
    .option("--record", "Persist the run and artifacts")
    .option("--reporter <name>", "Reporter name", "list")
    .option("--retries <count>", "Override configured failed-check retries")
    .option("--root <path>", "Repository root", process.cwd())
    .option("--test-session-name <name>", "Display name for the test session")
    .option("--repository <path>", "CI repository path", process.env.CI_PROJECT_PATH)
    .option("--ref <ref>", "CI branch or tag", resolveCiRef())
    .option("--commit-sha <sha>", "CI commit SHA", process.env.CI_COMMIT_SHA)
    .option("--pipeline-url <url>", "CI pipeline URL", process.env.CI_PIPELINE_URL)
    .option("--job-url <url>", "CI job URL", process.env.CI_JOB_URL)
    .option("--api-url <url>", "Selfchecks API URL", process.env.SELFCHECKS_URL)
    .option(
      "--api-token <token>",
      "Selfchecks API token",
      process.env.SELFCHECKS_API_TOKEN,
    )
    .action(async (commandOptions) => {
      const retries = commandOptions.retries
        ? parseRetries(String(commandOptions.retries))
        : undefined;
      const env = [
        ...parseEnvJson(process.env.SELFCHECKS_ENV_JSON),
        ...(commandOptions.env as string[]).map(parseEnv),
      ];
      const remote = requireRemoteConfig(
        commandOptions.apiUrl,
        commandOptions.apiToken,
        "trigger",
      );
      const summary = await triggerRemotely({
        ...remote,
        commitSha: commandOptions.commitSha,
        env,
        jobUrl: commandOptions.jobUrl,
        pipelineUrl: commandOptions.pipelineUrl,
        projectSlug: commandOptions.project,
        ref: commandOptions.ref,
        reporter: commandOptions.reporter,
        repository: commandOptions.repository,
        retries,
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

      if (summary.failed > 0) {
        process.exitCode = 1;
      }
    });

  return program;
}

function resolveCiRef(): string | undefined {
  const tag = process.env.CI_COMMIT_TAG?.trim();

  return tag ? `refs/tags/${tag}` : process.env.CI_COMMIT_REF_NAME;
}
