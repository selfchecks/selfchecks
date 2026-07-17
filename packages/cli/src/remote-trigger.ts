import {
  createAuthorizationHeaders,
  fetchRemoteStatus,
  normalizeApiUrl,
  readApiError,
  readJsonResponse,
  type RunChecksSummary,
} from "./remote-test-session.js";

export type RemoteTriggerOptions = {
  apiToken: string;
  apiUrl: string;
  commitSha?: string;
  env: Array<{ name: string; value: string }>;
  jobUrl?: string;
  pipelineUrl?: string;
  projectSlug: string;
  ref?: string;
  reporter: string;
  repository?: string;
  retries?: number;
  testSessionName?: string;
};

type TriggerResponse = {
  statusUrl: string;
  triggerId: string;
};

type TriggerStatusResponse = {
  error?: string;
  status: string;
  summary?: RunChecksSummary;
};

const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 6 * 60 * 60_000;

export async function runRemoteTrigger(
  options: RemoteTriggerOptions,
): Promise<RunChecksSummary> {
  const apiUrl = normalizeApiUrl(options.apiUrl);
  const response = await fetch(`${apiUrl}/api/cli/triggers`, {
    body: JSON.stringify({
      commitSha: options.commitSha,
      env: options.env,
      jobUrl: options.jobUrl,
      pipelineUrl: options.pipelineUrl,
      projectSlug: options.projectSlug,
      ref: options.ref,
      reporter: options.reporter,
      repository: options.repository,
      retries: options.retries,
      testSessionName: options.testSessionName,
    }),
    headers: {
      ...createAuthorizationHeaders(options.apiToken),
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const trigger = await readJsonResponse<TriggerResponse>(response);

  if (!response.ok) {
    throw new Error(readApiError(trigger, "Unable to queue remote trigger."));
  }

  return pollTrigger(apiUrl, options.apiToken, trigger);
}

async function pollTrigger(
  apiUrl: string,
  apiToken: string,
  trigger: TriggerResponse,
): Promise<RunChecksSummary> {
  const startedAt = Date.now();
  const statusUrl = new URL(trigger.statusUrl, `${apiUrl}/`).toString();

  while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
    const status = await fetchRemoteStatus<TriggerStatusResponse>(
      statusUrl,
      apiToken,
      "Unable to read remote trigger.",
    );

    if (status.status === "completed" && status.summary) {
      return status.summary;
    }

    if (status.status === "failed") {
      throw new Error(status.error || `Trigger ${trigger.triggerId} failed.`);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error(`Timed out waiting for trigger ${trigger.triggerId}.`);
}
