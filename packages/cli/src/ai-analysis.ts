import crypto from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import type { Check } from "@selfchecks/db";
import { prisma } from "@selfchecks/db";

import type {
  CheckExecutionResult,
  CollectedRunArtifact,
  RunChecksOptions,
} from "./runner.js";

type AiSettings = {
  apiEndpoint: string;
  apiKey: string;
  model: string;
  responseLanguage: string;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
  error?: {
    message?: string;
  };
};

const CIPHER_PREFIX = "v1";
const CIPHER_ALGORITHM = "aes-256-gcm";
const MAX_SOURCE_CHARS = 24_000;
const MAX_LOG_CHARS = 18_000;
const MAX_ARTIFACT_TEXT_CHARS = 8_000;
const MAX_RESULT_CHARS = 12_000;

export async function analyzeFailedCheck({
  check,
  options,
  result,
}: {
  check: Check;
  options: RunChecksOptions;
  result: CheckExecutionResult;
}): Promise<Record<string, unknown> | undefined> {
  const settings = await readAiSettings(options.projectSlug);

  if (!settings) {
    return undefined;
  }

  const createdAt = new Date().toISOString();

  try {
    const context = await buildFailureContext(check, options, result);
    const content = await requestAiAnalysis(settings, context);

    return {
      apiEndpoint: settings.apiEndpoint,
      content,
      createdAt,
      model: settings.model,
      responseLanguage: settings.responseLanguage,
      status: "completed",
    };
  } catch (error) {
    return {
      apiEndpoint: settings.apiEndpoint,
      createdAt,
      error: getErrorMessage(error),
      model: settings.model,
      responseLanguage: settings.responseLanguage,
      status: "failed",
    };
  }
}

async function readAiSettings(projectSlug: string): Promise<AiSettings | undefined> {
  const project = await prisma.project.findUnique({
    select: {
      aiSettings: {
        select: {
          apiEndpoint: true,
          apiKeyCiphertext: true,
          model: true,
          responseLanguage: true,
        },
      },
    },
    where: {
      slug: projectSlug,
    },
  });
  const settings = project?.aiSettings;

  if (!settings?.apiKeyCiphertext) {
    return undefined;
  }

  return {
    apiEndpoint: trimTrailingSlash(settings.apiEndpoint),
    apiKey: decryptSecretValue(settings.apiKeyCiphertext),
    model: settings.model,
    responseLanguage: settings.responseLanguage,
  };
}

async function buildFailureContext(
  check: Check,
  options: RunChecksOptions,
  result: CheckExecutionResult,
) {
  const source = await readCheckSource(check, options.rootDir);
  const log = result.logsPath
    ? await readTextFilePreview(result.logsPath, MAX_LOG_CHARS)
    : undefined;
  const artifactContext = await Promise.all(
    (result.artifacts ?? []).map(readArtifactContext),
  );

  return [
    `Check: ${check.name}`,
    `Check key: ${check.key}`,
    `Check type: ${check.type.toLowerCase()}`,
    check.entrypoint ? `Entrypoint: ${check.entrypoint}` : undefined,
    check.request
      ? `API request definition:\n${truncateText(
          JSON.stringify(check.request, null, 2),
          MAX_RESULT_CHARS,
        )}`
      : undefined,
    source
      ? `Test source (${source.path}):\n\`\`\`\n${source.content}\n\`\`\``
      : undefined,
    result.errorMessage
      ? `Failure output:\n\`\`\`\n${truncateText(result.errorMessage, MAX_LOG_CHARS)}\n\`\`\``
      : undefined,
    `Run result JSON:\n\`\`\`json\n${truncateText(
      JSON.stringify(result.resultJson, null, 2),
      MAX_RESULT_CHARS,
    )}\n\`\`\``,
    log ? `Job log:\n\`\`\`\n${log}\n\`\`\`` : undefined,
    artifactContext.length > 0
      ? `Artifacts and traces:\n${artifactContext.join("\n\n")}`
      : "Artifacts and traces: none recorded.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function requestAiAnalysis(settings: AiSettings, context: string) {
  const response = await fetch(`${settings.apiEndpoint}/chat/completions`, {
    body: JSON.stringify({
      messages: [
        {
          content:
            "You analyze failed synthetic monitoring checks. Identify the likely root cause, cite concrete evidence from logs/source/traces, and suggest the next debugging steps. Keep the answer concise and practical.",
          role: "system",
        },
        {
          content: `Respond in ${settings.responseLanguage}.\n\n${context}`,
          role: "user",
        },
      ],
      model: settings.model,
      temperature: 0.2,
    }),
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const bodyText = await response.text();
  const body = parseJson<ChatCompletionResponse>(bodyText);

  if (!response.ok) {
    throw new Error(
      `AI request failed with HTTP ${response.status}: ${
        (body?.error?.message ?? bodyText.slice(0, 500)) || response.statusText
      }`,
    );
  }

  const content = extractMessageContent(body);

  if (!content) {
    throw new Error("AI response did not include message content.");
  }

  return content;
}

async function readCheckSource(check: Check, rootDir: string) {
  if (!check.entrypoint) {
    return undefined;
  }

  const filePath = resolveSourcePath(rootDir, check.entrypoint);

  if (!filePath) {
    return undefined;
  }

  const content = await readTextFilePreview(filePath, MAX_SOURCE_CHARS).catch(
    () => undefined,
  );

  return content
    ? {
        content,
        path: path.relative(rootDir, filePath) || filePath,
      }
    : undefined;
}

function resolveSourcePath(rootDir: string, entrypoint: string) {
  const resolvedRoot = path.resolve(rootDir);
  const resolvedPath = path.isAbsolute(entrypoint)
    ? path.resolve(entrypoint)
    : path.resolve(resolvedRoot, entrypoint);
  const relative = path.relative(resolvedRoot, resolvedPath);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return undefined;
  }

  return resolvedPath;
}

async function readArtifactContext(artifact: CollectedRunArtifact) {
  const metadata = [
    `- ${artifact.type}: ${artifact.path}`,
    artifact.sizeBytes ? `  size: ${artifact.sizeBytes} bytes` : undefined,
    artifact.mimeType ? `  mime: ${artifact.mimeType}` : undefined,
  ]
    .filter(Boolean)
    .join("\n");

  if (!isTextArtifact(artifact)) {
    return metadata;
  }

  const content = await readTextFilePreview(
    artifact.path,
    MAX_ARTIFACT_TEXT_CHARS,
  ).catch(() => undefined);

  return content ? `${metadata}\n  content:\n\`\`\`\n${content}\n\`\`\`` : metadata;
}

function isTextArtifact(artifact: CollectedRunArtifact) {
  return (
    artifact.type === "LOG" ||
    artifact.type === "JSON" ||
    artifact.type === "REQUEST_RESPONSE" ||
    artifact.mimeType?.startsWith("text/") ||
    artifact.mimeType?.includes("json")
  );
}

async function readTextFilePreview(filePath: string, maxChars: number) {
  const fileStat = await stat(filePath);

  if (!fileStat.isFile()) {
    return undefined;
  }

  return truncateText(await readFile(filePath, "utf8"), maxChars);
}

function truncateText(value: string, maxChars: number) {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars)}\n... truncated ${
    value.length - maxChars
  } chars ...`;
}

function extractMessageContent(body: ChatCompletionResponse | undefined) {
  const content = body?.choices?.[0]?.message?.content;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }

        if (part && typeof part === "object") {
          const record = part as Record<string, unknown>;
          return typeof record.text === "string" ? record.text : "";
        }

        return "";
      })
      .filter(Boolean)
      .join("\n");
  }

  return undefined;
}

function parseJson<T>(value: string): T | undefined {
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function decryptSecretValue(valueCiphertext: string) {
  if (!valueCiphertext.startsWith(`${CIPHER_PREFIX}:`)) {
    return valueCiphertext;
  }

  const [, ivValue, authTagValue, ciphertextValue] = valueCiphertext.split(":");

  if (!ivValue || !authTagValue || !ciphertextValue) {
    throw new Error("Stored AI API key is malformed.");
  }

  const decipher = crypto.createDecipheriv(
    CIPHER_ALGORITHM,
    getSecretKey(),
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(authTagValue, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function getSecretKey() {
  return crypto.createHash("sha256").update(getSecretSeed()).digest();
}

function getSecretSeed() {
  const seed = process.env.SELFCHECKS_SECRET_KEY || process.env.NEXTAUTH_SECRET;

  if (!seed && process.env.NODE_ENV === "production") {
    throw new Error("NEXTAUTH_SECRET or SELFCHECKS_SECRET_KEY is required.");
  }

  return seed || "selfchecks-development-secret";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
