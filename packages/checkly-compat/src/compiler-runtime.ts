import { readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type { CollectedConstruct, RetryStrategy } from "./constructs.js";
import type {
  CompileProjectOptions,
  CompiledApiRequest,
  CompiledCheck,
  CompiledWebhookAlertChannel,
  DeploymentManifest,
} from "./compiler.js";

const constructCollectorSymbol = Symbol.for(
  "@selfchecks/selfchecks/construct-collector",
);
const ignoredDirectories = new Set([
  ".git",
  ".next",
  ".selfchecks",
  "coverage",
  "dist",
  "node_modules",
  "playwright-report",
  "test-results",
]);
const configFileNames = [
  "selfchecks.config.ts",
  "selfchecks.config.mts",
  "selfchecks.config.js",
  "selfchecks.config.mjs",
  "checkly.config.ts",
  "checkly.config.mts",
  "checkly.config.js",
  "checkly.config.mjs",
];
const commonCheckKeys = new Set([
  "activated",
  "alertChannels",
  "frequency",
  "group",
  "muted",
  "name",
  "retryStrategy",
  "shouldFail",
  "tags",
]);
const groupKeys = new Set([
  "activated",
  "alertChannels",
  "frequency",
  "muted",
  "name",
  "retryStrategy",
  "shouldFail",
  "tags",
]);
const webhookKeys = new Set([
  "method",
  "name",
  "sendDegraded",
  "sendFailure",
  "sendRecovery",
  "sslExpiry",
  "template",
  "url",
]);

type ProjectConfig = {
  checks?: Record<string, unknown> & {
    browserChecks?: Record<string, unknown>;
  };
  logicalId?: unknown;
  projectName?: unknown;
};

type CollectorGlobal = typeof globalThis & {
  [constructCollectorSymbol]?: CollectedConstruct[];
};

process.once("message", (message: CompileProjectOptions) => {
  void run(message)
    .then((manifest) => process.send?.({ manifest, success: true }))
    .catch((error) =>
      process.send?.({
        error: error instanceof Error ? error.message : String(error),
        success: false,
      }),
    );
});

async function run(options: CompileProjectOptions): Promise<DeploymentManifest> {
  const configPath = options.configPath
    ? path.resolve(options.rootDir, options.configPath)
    : await findConfigPath(options.rootDir);
  const configModule = configPath
    ? ((await import(pathToFileURL(configPath).href)) as { default?: ProjectConfig })
    : undefined;
  const config = configModule?.default ?? {};
  const projectName = readRequiredString(config.projectName, "projectName");
  const logicalId = readRequiredString(config.logicalId, "logicalId");
  const collector: CollectedConstruct[] = [];

  (globalThis as CollectorGlobal)[constructCollectorSymbol] = collector;

  try {
    for (const filePath of await findCheckFiles(options.rootDir)) {
      await import(pathToFileURL(filePath).href);
    }
  } finally {
    delete (globalThis as CollectorGlobal)[constructCollectorSymbol];
  }

  const groups = new Map(
    collector
      .filter((item) => item.kind === "CheckGroup" || item.kind === "CheckGroupV2")
      .map((item) => [item.logicalId, item]),
  );
  const channels = new Map(
    collector
      .filter((item) => item.kind === "WebhookAlertChannel")
      .map((item) => [item.logicalId, item]),
  );

  assertUniqueLogicalIds(
    collector.filter(
      (item) => item.kind === "ApiCheck" || item.kind === "BrowserCheck",
    ),
    "check",
  );
  assertUniqueLogicalIds(
    collector.filter(
      (item) => item.kind === "CheckGroup" || item.kind === "CheckGroupV2",
    ),
    "group",
  );
  assertUniqueLogicalIds(
    collector.filter((item) => item.kind === "WebhookAlertChannel"),
    "alert channel",
  );

  for (const group of groups.values()) {
    assertSupportedProperties(group, asRecord(group.props), groupKeys);
  }

  for (const channel of channels.values()) {
    assertSupportedProperties(channel, asRecord(channel.props), webhookKeys);
  }

  assertSupportedConfigDefaults(config);
  const checks = collector
    .filter((item) => item.kind === "ApiCheck" || item.kind === "BrowserCheck")
    .map((item) => compileCheck(item, config, groups, channels));

  if (checks.length === 0) {
    throw new Error(`No Selfchecks definitions were found in ${options.rootDir}.`);
  }

  return {
    alertChannels: [...channels.values()].map(compileWebhookAlertChannel),
    checks,
    project: { logicalId, name: projectName },
    version: 1,
    warnings: [],
  };
}

async function findConfigPath(rootDir: string): Promise<string | undefined> {
  const entries = new Set(await readdir(rootDir));
  const configName = configFileNames.find((name) => entries.has(name));
  return configName ? path.join(rootDir, configName) : undefined;
}

async function findCheckFiles(rootDir: string): Promise<string[]> {
  const files: string[] = [];

  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) {
          await visit(path.join(directory, entry.name));
        }
      } else if (entry.isFile() && /\.check\.(?:[cm]?[jt]s)$/.test(entry.name)) {
        files.push(path.join(directory, entry.name));
      }
    }
  }

  await visit(rootDir);
  return files.sort();
}

function compileCheck(
  construct: CollectedConstruct,
  config: ProjectConfig,
  groups: Map<string, CollectedConstruct>,
  channels: Map<string, CollectedConstruct>,
): CompiledCheck {
  const type = construct.kind === "ApiCheck" ? "api" : "browser";
  const ownProps = asRecord(construct.props);
  const groupLogicalId = getLogicalId(ownProps.group);
  const group = groupLogicalId ? groups.get(groupLogicalId) : undefined;

  if (groupLogicalId && !group) {
    throw new Error(
      `${construct.kind} ${construct.logicalId} references unknown group: ${groupLogicalId}`,
    );
  }
  const groupProps = group ? asRecord(group.props) : {};
  const groupCheckDefaults = pickGroupCheckDefaults(groupProps);
  const checkDefaults = asRecord(config.checks);
  const typeDefaults = type === "browser" ? asRecord(config.checks?.browserChecks) : {};
  const props = {
    ...checkDefaults,
    ...typeDefaults,
    ...groupCheckDefaults,
    ...ownProps,
  };
  const allowedKeys = new Set(commonCheckKeys);

  if (type === "browser") {
    allowedKeys.add("accounts");
    allowedKeys.add("code");
  } else {
    allowedKeys.add("degradedResponseTime");
    allowedKeys.add("maxResponseTime");
    allowedKeys.add("request");
  }

  assertSupportedProperties(construct, ownProps, allowedKeys);
  const frequency = normalizeFrequency(props.frequency, construct.logicalId);
  const tags = normalizeStrings(props.tags);
  const retryStrategy = normalizeRetryStrategy(
    props.retryStrategy,
    construct.logicalId,
  );
  const alertChannelLogicalIds = normalizeReferences(
    ownProps.alertChannels ?? groupProps.alertChannels ?? checkDefaults.alertChannels,
  );
  const unknownAlertChannel = alertChannelLogicalIds.find(
    (logicalId) => !channels.has(logicalId),
  );

  if (unknownAlertChannel) {
    throw new Error(
      `${construct.kind} ${construct.logicalId} references unknown alert channel: ${unknownAlertChannel}`,
    );
  }
  const base: CompiledCheck = {
    accounts:
      type === "browser" ? normalizeAccounts(props.accounts, construct.logicalId) : [],
    alertChannelLogicalIds,
    enabled: props.activated !== false,
    key: construct.logicalId,
    muted: props.muted === true,
    name: typeof props.name === "string" ? props.name : construct.logicalId,
    shouldFail: props.shouldFail === true,
    tags,
    type,
    ...(frequency ? { frequency } : {}),
    ...(group
      ? {
          groupKey: group.logicalId,
          groupName:
            typeof groupProps.name === "string" ? groupProps.name : group.logicalId,
        }
      : {}),
    ...(retryStrategy ? { retryStrategy } : {}),
  };

  if (type === "api") {
    base.request = compileRequest(props.request, construct.logicalId);
    base.degradedResponseTime = optionalNonNegativeNumber(
      props.degradedResponseTime,
      "degradedResponseTime",
      construct.logicalId,
    );
    base.maxResponseTime = optionalNonNegativeNumber(
      props.maxResponseTime,
      "maxResponseTime",
      construct.logicalId,
    );
  } else {
    const code = asRecord(props.code);
    const entrypoint = code.entrypoint;

    if (typeof entrypoint !== "string" || !entrypoint.trim()) {
      throw new Error(`BrowserCheck ${construct.logicalId} requires code.entrypoint.`);
    }

    base.entrypoint = entrypoint;
  }

  return base;
}

function pickGroupCheckDefaults(
  props: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    ["activated", "frequency", "muted", "retryStrategy", "shouldFail", "tags"].flatMap(
      (key) => (key in props ? [[key, props[key]]] : []),
    ),
  );
}

function assertSupportedConfigDefaults(config: ProjectConfig): void {
  const defaults = asRecord(config.checks);
  const browserDefaults = asRecord(config.checks?.browserChecks);
  const defaultKeys = new Set(commonCheckKeys);

  defaultKeys.delete("group");
  defaultKeys.add("browserChecks");
  defaultKeys.add("degradedResponseTime");
  defaultKeys.add("maxResponseTime");

  for (const key of Object.keys(defaults)) {
    if (!defaultKeys.has(key)) {
      throw new Error(`Selfchecks configuration uses unsupported checks.${key}.`);
    }
  }

  const browserKeys = new Set(commonCheckKeys);

  browserKeys.delete("alertChannels");
  browserKeys.delete("group");
  browserKeys.add("accounts");

  for (const key of Object.keys(browserDefaults)) {
    if (!browserKeys.has(key)) {
      throw new Error(
        `Selfchecks configuration uses unsupported checks.browserChecks.${key}.`,
      );
    }
  }
}

function compileRequest(value: unknown, logicalId: string): CompiledApiRequest {
  const request = asRecord(value);
  const allowedKeys = new Set([
    "assertions",
    "basicAuth",
    "body",
    "bodyType",
    "followRedirects",
    "headers",
    "method",
    "queryParameters",
    "url",
  ]);

  for (const key of Object.keys(request)) {
    if (!allowedKeys.has(key)) {
      throw new Error(
        `ApiCheck ${logicalId} request uses unsupported property: ${key}`,
      );
    }
  }

  if (typeof request.method !== "string" || typeof request.url !== "string") {
    throw new Error(`ApiCheck ${logicalId} requires request.method and request.url.`);
  }

  const assertions = compileAssertions(request.assertions, logicalId);
  const bodyType = request.bodyType;

  if (
    bodyType !== undefined &&
    !["FORM", "GRAPHQL", "JSON", "NONE", "RAW"].includes(String(bodyType))
  ) {
    throw new Error(`ApiCheck ${logicalId} has unsupported request.bodyType.`);
  }

  return {
    assertions,
    headers: normalizeKeyValuePairs(request.headers),
    method: request.method.toUpperCase(),
    queryParameters: normalizeKeyValuePairs(request.queryParameters),
    url: request.url,
    ...(typeof request.body === "string" ? { body: request.body } : {}),
    ...(typeof bodyType === "string" ? { bodyType: bodyType as never } : {}),
    ...(typeof request.followRedirects === "boolean"
      ? { followRedirects: request.followRedirects }
      : {}),
    ...(isBasicAuth(request.basicAuth) ? { basicAuth: request.basicAuth } : {}),
  };
}

function compileWebhookAlertChannel(
  construct: CollectedConstruct,
): CompiledWebhookAlertChannel {
  const props = asRecord(construct.props);
  const url = props.url instanceof URL ? props.url.toString() : props.url;

  if (typeof url !== "string") {
    throw new Error(`WebhookAlertChannel ${construct.logicalId} requires a URL.`);
  }

  const method = typeof props.method === "string" ? props.method.toUpperCase() : "POST";

  if (!["DELETE", "GET", "PATCH", "POST", "PUT"].includes(method)) {
    throw new Error(
      `WebhookAlertChannel ${construct.logicalId} uses unsupported method: ${method}`,
    );
  }

  return {
    adapter: "generic",
    logicalId: construct.logicalId,
    method: method as CompiledWebhookAlertChannel["method"],
    name: typeof props.name === "string" ? props.name : construct.logicalId,
    sendDegraded: props.sendDegraded === true,
    sendFailure: props.sendFailure !== false,
    sendRecovery: props.sendRecovery !== false,
    sslExpiry: props.sslExpiry === true,
    ...(typeof props.template === "string" ? { template: props.template } : {}),
    url,
  };
}

function assertSupportedProperties(
  construct: CollectedConstruct,
  props: Record<string, unknown>,
  allowedKeys: Set<string>,
): void {
  for (const key of Object.keys(props)) {
    if (!allowedKeys.has(key)) {
      throw new Error(
        `${construct.kind} ${construct.logicalId} uses unsupported property: ${key}`,
      );
    }
  }
}

function assertUniqueLogicalIds(constructs: CollectedConstruct[], label: string): void {
  const seen = new Set<string>();

  for (const construct of constructs) {
    if (seen.has(construct.logicalId)) {
      throw new Error(`Duplicate ${label} logicalId: ${construct.logicalId}`);
    }

    seen.add(construct.logicalId);
  }
}

function compileAssertions(
  value: unknown,
  logicalId: string,
): CompiledApiRequest["assertions"] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error(`ApiCheck ${logicalId} request.assertions must be an array.`);
  }

  const sources = new Set([
    "HEADERS",
    "JSON_BODY",
    "RESPONSE_TIME",
    "STATUS_CODE",
    "TEXT_BODY",
  ]);
  const comparisons = new Set([
    "CONTAINS",
    "EQUALS",
    "GREATER_THAN",
    "HAS_KEY",
    "HAS_VALUE",
    "IS_EMPTY",
    "IS_NOT_NULL",
    "IS_NULL",
    "LESS_THAN",
    "NOT_CONTAINS",
    "NOT_EMPTY",
    "NOT_EQUALS",
    "NOT_HAS_KEY",
    "NOT_HAS_VALUE",
  ]);

  return value.map((item, index) => {
    const assertion = asRecord(item);

    for (const key of Object.keys(assertion)) {
      if (!["comparison", "property", "source", "target"].includes(key)) {
        throw new Error(
          `ApiCheck ${logicalId} assertion ${index} uses unsupported property: ${key}`,
        );
      }
    }

    if (!sources.has(String(assertion.source))) {
      throw new Error(
        `ApiCheck ${logicalId} assertion ${index} uses unsupported source: ${String(assertion.source)}`,
      );
    }

    if (!comparisons.has(String(assertion.comparison))) {
      throw new Error(
        `ApiCheck ${logicalId} assertion ${index} uses unsupported comparison: ${String(assertion.comparison)}`,
      );
    }

    if (assertion.property !== undefined && typeof assertion.property !== "string") {
      throw new Error(
        `ApiCheck ${logicalId} assertion ${index} property must be a string.`,
      );
    }

    return { ...assertion } as CompiledApiRequest["assertions"][number];
  });
}

function normalizeFrequency(
  value: unknown,
  logicalId: string,
): { intervalMinutes: number } | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Check ${logicalId} requires a positive minute frequency.`);
  }

  return { intervalMinutes: value };
}

function normalizeRetryStrategy(
  value: unknown,
  logicalId: string,
): RetryStrategy | undefined {
  if (value === undefined) {
    return undefined;
  }

  const strategy = asRecord(value);
  const supportedTypes = new Set([
    "EXPONENTIAL",
    "FIXED",
    "LINEAR",
    "NO_RETRIES",
    "SINGLE_RETRY",
  ]);

  if (!supportedTypes.has(String(strategy.type))) {
    throw new Error(`Check ${logicalId} uses unsupported retry strategy type.`);
  }

  for (const key of Object.keys(strategy)) {
    if (
      ![
        "baseBackoffSeconds",
        "maxDurationSeconds",
        "maxRetries",
        "onlyOn",
        "sameRegion",
        "type",
      ].includes(key)
    ) {
      throw new Error(
        `Check ${logicalId} retry strategy uses unsupported property: ${key}`,
      );
    }
  }

  for (const key of [
    "baseBackoffSeconds",
    "maxDurationSeconds",
    "maxRetries",
  ] as const) {
    const item = strategy[key];

    if (item !== undefined && (!Number.isSafeInteger(item) || Number(item) < 0)) {
      throw new Error(`Check ${logicalId} retry strategy ${key} must be non-negative.`);
    }
  }

  if (typeof strategy.maxRetries === "number" && strategy.maxRetries > 10) {
    throw new Error(`Check ${logicalId} retry strategy maxRetries cannot exceed 10.`);
  }

  if (strategy.maxDurationSeconds === 0) {
    throw new Error(
      `Check ${logicalId} retry strategy maxDurationSeconds must be positive.`,
    );
  }

  if (
    strategy.onlyOn !== undefined &&
    strategy.onlyOn !== "NETWORK_ERROR" &&
    (!Array.isArray(strategy.onlyOn) ||
      !strategy.onlyOn.every((item) => typeof item === "string" && item.length > 0))
  ) {
    throw new Error(`Check ${logicalId} retry strategy onlyOn is invalid.`);
  }

  if (strategy.sameRegion !== undefined && typeof strategy.sameRegion !== "boolean") {
    throw new Error(`Check ${logicalId} retry strategy sameRegion must be boolean.`);
  }

  return { ...(strategy as RetryStrategy) };
}

function normalizeKeyValuePairs(value: unknown): Record<string, string> {
  if (Array.isArray(value)) {
    return Object.fromEntries(
      value.flatMap((item) => {
        const pair = asRecord(item);
        return typeof pair.key === "string" && typeof pair.value === "string"
          ? [[pair.key, pair.value]]
          : [];
      }),
    );
  }

  return Object.fromEntries(
    Object.entries(asRecord(value)).flatMap(([key, item]) =>
      typeof item === "string" ? [[key, item]] : [],
    ),
  );
}

function normalizeReferences(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const logicalId = getLogicalId(item);
    return logicalId ? [logicalId] : [];
  });
}

function normalizeStrings(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.filter((item): item is string => typeof item === "string"))];
}

function normalizeAccounts(value: unknown, logicalId: string): string[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error(`BrowserCheck ${logicalId} accounts must be an array.`);
  }

  const accounts = value.map((account, index) => {
    if (typeof account !== "string" || !account.trim()) {
      throw new Error(
        `BrowserCheck ${logicalId} account at index ${index} must be a non-empty string.`,
      );
    }

    return account.trim();
  });

  return [...new Set(accounts)];
}

function getLogicalId(value: unknown): string | undefined {
  const record = asRecord(value);
  return typeof record.logicalId === "string" ? record.logicalId : undefined;
}

function readRequiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Selfchecks configuration requires ${name}.`);
  }

  return value.trim();
}

function optionalNonNegativeNumber(
  value: unknown,
  property: string,
  logicalId: string,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`ApiCheck ${logicalId} ${property} must be non-negative.`);
  }

  return value;
}

function isBasicAuth(value: unknown): value is { password: string; username: string } {
  const auth = asRecord(value);
  return typeof auth.username === "string" && typeof auth.password === "string";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}
