import { compileProject } from "@selfchecks/selfchecks/compiler";

import {
  createAuthorizationHeaders,
  createRemoteBundleFormData,
  fetchRemoteStatus,
  normalizeApiUrl,
  readApiError,
  readJsonResponse,
} from "./remote-test-session.js";

export type DeploySummary = {
  checks: Array<{
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
    request?: {
      assertions: Array<{
        comparison?: string;
        operator?: string;
        property?: string;
        source: string;
        target?: unknown;
      }>;
      basicAuth?: { password: string; username: string };
      body?: string;
      bodyType?: "FORM" | "GRAPHQL" | "JSON" | "NONE" | "RAW";
      followRedirects?: boolean;
      headers: Record<string, string>;
      method: string;
      queryParameters: Record<string, string>;
      url: string;
    };
    retryStrategy?: {
      baseBackoffSeconds?: number;
      maxDurationSeconds?: number;
      maxRetries?: number;
      onlyOn?: "NETWORK_ERROR" | string[];
      sameRegion?: boolean;
      type: "EXPONENTIAL" | "FIXED" | "LINEAR" | "NO_RETRIES" | "SINGLE_RETRY";
    };
    shouldFail: boolean;
    tags: string[];
    type: "api" | "browser";
  }>;
  created: number;
  projectSlug: string;
  removed: number;
  updated: number;
  warnings: string[];
};

export type RemoteDeployOptions = {
  allowRemovals: boolean;
  apiToken: string;
  apiUrl: string;
  configPath?: string;
  projectSlug: string;
  rootDir: string;
};

type DeploymentResponse = {
  deploymentId: string;
  statusUrl: string;
};

type DeploymentStatusResponse = {
  error?: string;
  status: string;
  summary?: DeploySummary;
};

const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 60 * 60_000;

export async function runRemoteDeploy(
  options: RemoteDeployOptions,
): Promise<DeploySummary> {
  const apiUrl = normalizeApiUrl(options.apiUrl);
  const deploymentManifest = await compileProject({
    ...(options.configPath ? { configPath: options.configPath } : {}),
    rootDir: options.rootDir,
  });
  const response = await fetch(`${apiUrl}/api/cli/deployments`, {
    body: await createRemoteBundleFormData(options.rootDir, {
      allowRemovals: options.allowRemovals,
      deploymentManifest,
      projectSlug: options.projectSlug,
    }),
    headers: createAuthorizationHeaders(options.apiToken),
    method: "POST",
  });
  const deployment = await readJsonResponse<DeploymentResponse>(response);

  if (!response.ok) {
    throw new Error(readApiError(deployment, "Unable to queue remote deployment."));
  }

  return pollDeployment(apiUrl, options.apiToken, deployment);
}

async function pollDeployment(
  apiUrl: string,
  apiToken: string,
  deployment: DeploymentResponse,
): Promise<DeploySummary> {
  const startedAt = Date.now();
  const statusUrl = new URL(deployment.statusUrl, `${apiUrl}/`).toString();

  while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
    const status = await fetchRemoteStatus<DeploymentStatusResponse>(
      statusUrl,
      apiToken,
      "Unable to read remote deployment.",
    );

    if (status.status === "completed" && status.summary) {
      return status.summary;
    }

    if (status.status === "failed") {
      throw new Error(status.error || `Deployment ${deployment.deploymentId} failed.`);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error(`Timed out waiting for deployment ${deployment.deploymentId}.`);
}
