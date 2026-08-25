import { fork } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

import type {
  Assertion,
  Request,
  RetryStrategy,
  WebhookAlertChannelProps,
} from "./constructs.js";

export type CompiledApiRequest = Omit<
  Request,
  "assertions" | "headers" | "queryParameters"
> & {
  assertions: Assertion[];
  headers: Record<string, string>;
  queryParameters: Record<string, string>;
};

export type CompiledCheck = {
  accounts: string[];
  alertChannelLogicalIds: string[];
  degradedResponseTime?: number;
  enabled: boolean;
  entrypoint?: string;
  frequency?: { intervalMinutes: number };
  groupKey?: string;
  groupName?: string;
  key: string;
  maxResponseTime?: number;
  muted: boolean;
  name: string;
  request?: CompiledApiRequest;
  retryStrategy?: RetryStrategy;
  shouldFail: boolean;
  tags: string[];
  type: "api" | "browser";
};

export type CompiledWebhookAlertChannel = Omit<
  WebhookAlertChannelProps,
  | "method"
  | "name"
  | "sendDegraded"
  | "sendFailure"
  | "sendRecovery"
  | "sslExpiry"
  | "url"
> & {
  adapter: "generic";
  logicalId: string;
  method: "DELETE" | "GET" | "PATCH" | "POST" | "PUT";
  name: string;
  sendDegraded: boolean;
  sendFailure: boolean;
  sendRecovery: boolean;
  sslExpiry: boolean;
  url: string;
};

export type DeploymentManifest = {
  alertChannels: CompiledWebhookAlertChannel[];
  checks: CompiledCheck[];
  project: {
    logicalId: string;
    name: string;
  };
  version: 1;
  warnings: string[];
};

export type CompileProjectOptions = {
  configPath?: string;
  rootDir: string;
};

type CompilerMessage =
  | { manifest: DeploymentManifest; success: true }
  | { error: string; success: false };

export async function compileProject(
  options: CompileProjectOptions,
): Promise<DeploymentManifest> {
  const moduleUrl = import.meta.url.startsWith("file:")
    ? import.meta.url
    : pathToFileURL(path.join(process.cwd(), "packages/checkly-compat/src/compiler.ts"))
        .href;
  const runtimePath = fileURLToPath(
    new URL(
      moduleUrl.endsWith(".ts") ? "./compiler-runtime.ts" : "./compiler-runtime.js",
      moduleUrl,
    ),
  );
  const tsxLoader = pathToFileURL(createRequire(moduleUrl).resolve("tsx")).href;

  return new Promise<DeploymentManifest>((resolve, reject) => {
    const child = fork(runtimePath, [], {
      cwd: options.rootDir,
      env: process.env,
      execArgv: ["--import", tsxLoader],
      silent: true,
    });
    let stderr = "";
    let settled = false;

    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("message", (message: CompilerMessage) => {
      settled = true;
      child.disconnect();

      if (message.success) {
        resolve(message.manifest);
      } else {
        reject(new Error(message.error));
      }
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (!settled) {
        reject(
          new Error(
            stderr.trim() || `Selfchecks project compiler exited with status ${code}.`,
          ),
        );
      }
    });
    child.send(options);
  });
}
