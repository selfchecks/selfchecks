import { readFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

export const defaultBrowserRunTimeoutMs = 10 * 60_000;

export const browserTraceModes = [
  "off",
  "on",
  "retain-on-failure",
  "on-first-retry",
  "on-all-retries",
  "retain-on-first-failure",
] as const;

export type BrowserTraceMode = (typeof browserTraceModes)[number];

export type BrowserTraceModeConfig = {
  configPath: string;
  mode: BrowserTraceMode;
  source: string;
};

export type BrowserRunTimeoutConfig = {
  configPath?: string;
  configuredTestTimeoutMs?: number;
  source: string;
  timeoutMs: number;
};

type TimeoutCandidate = {
  configPath: string;
  source: string;
  timeoutMs: number;
};

type TraceModeCandidate = BrowserTraceModeConfig;

const playwrightConfigFileNames = [
  "playwright.config.ts",
  "playwright.config.mts",
  "playwright.config.cts",
  "playwright.config.js",
  "playwright.config.mjs",
  "playwright.config.cjs",
];

const checklyConfigFileNames = [
  "checkly.config.ts",
  "checkly.config.mts",
  "checkly.config.cts",
  "checkly.config.js",
  "checkly.config.mjs",
  "checkly.config.cjs",
];

export async function resolveBrowserRunTimeoutConfig(
  rootDir: string,
): Promise<BrowserRunTimeoutConfig> {
  const playwrightConfig = await readPlaywrightTimeouts(rootDir);
  const checklyConfig = await readChecklyTimeouts(rootDir);
  const configuredTestTimeout =
    playwrightConfig.testTimeout ?? checklyConfig.testTimeout;
  const globalTimeout = playwrightConfig.globalTimeout ?? checklyConfig.globalTimeout;

  if (globalTimeout) {
    return {
      configPath: globalTimeout.configPath,
      configuredTestTimeoutMs: configuredTestTimeout?.timeoutMs,
      source: globalTimeout.source,
      timeoutMs: globalTimeout.timeoutMs,
    };
  }

  if (
    configuredTestTimeout &&
    configuredTestTimeout.timeoutMs > defaultBrowserRunTimeoutMs
  ) {
    return {
      configPath: configuredTestTimeout.configPath,
      configuredTestTimeoutMs: configuredTestTimeout.timeoutMs,
      source: `${configuredTestTimeout.source} (minimum run timeout)`,
      timeoutMs: configuredTestTimeout.timeoutMs,
    };
  }

  return {
    configPath: configuredTestTimeout?.configPath,
    configuredTestTimeoutMs: configuredTestTimeout?.timeoutMs,
    source: "selfchecks default",
    timeoutMs: defaultBrowserRunTimeoutMs,
  };
}

export async function resolveBrowserTraceModeConfig(
  rootDir: string,
): Promise<BrowserTraceModeConfig | undefined> {
  const playwrightTraceMode = await readPlaywrightTraceMode(rootDir);

  return playwrightTraceMode ?? readChecklyTraceMode(rootDir);
}

export function resolveBrowserTraceModeForAttempt(
  mode: BrowserTraceMode,
  attempt: number,
  maxAttempts: number,
): BrowserTraceMode {
  if (mode === "on-first-retry") {
    return maxAttempts > 1 && attempt === maxAttempts ? "on" : "off";
  }

  if (mode === "on-all-retries") {
    return attempt > 1 ? "on" : "off";
  }

  if (mode === "retain-on-first-failure") {
    return attempt === 1 ? "retain-on-failure" : "off";
  }

  return mode;
}

async function readPlaywrightTimeouts(rootDir: string) {
  const parsedConfig = await readFirstParsedConfig(rootDir, playwrightConfigFileNames);

  if (!parsedConfig) {
    return {};
  }

  return {
    globalTimeout: readPositiveTimeoutCandidate(
      parsedConfig,
      ["globalTimeout"],
      "playwright.globalTimeout",
    ),
    testTimeout: readPositiveTimeoutCandidate(
      parsedConfig,
      ["timeout"],
      "playwright.timeout",
    ),
  };
}

async function readPlaywrightTraceMode(
  rootDir: string,
): Promise<TraceModeCandidate | undefined> {
  const parsedConfig = await readFirstParsedConfig(rootDir, playwrightConfigFileNames);

  return parsedConfig
    ? readTraceModeCandidate(parsedConfig, ["use", "trace"], "playwright.use.trace")
    : undefined;
}

async function readChecklyTimeouts(rootDir: string) {
  const parsedConfig = await readFirstParsedConfig(rootDir, checklyConfigFileNames);

  if (!parsedConfig) {
    return {};
  }

  return {
    globalTimeout: readPositiveTimeoutCandidate(
      parsedConfig,
      ["checks", "playwrightConfig", "globalTimeout"],
      "checkly.checks.playwrightConfig.globalTimeout",
    ),
    testTimeout: readPositiveTimeoutCandidate(
      parsedConfig,
      ["checks", "playwrightConfig", "timeout"],
      "checkly.checks.playwrightConfig.timeout",
    ),
  };
}

async function readChecklyTraceMode(
  rootDir: string,
): Promise<TraceModeCandidate | undefined> {
  const parsedConfig = await readFirstParsedConfig(rootDir, checklyConfigFileNames);

  return parsedConfig
    ? readTraceModeCandidate(
        parsedConfig,
        ["checks", "playwrightConfig", "use", "trace"],
        "checkly.checks.playwrightConfig.use.trace",
      )
    : undefined;
}

async function readFirstParsedConfig(rootDir: string, fileNames: string[]) {
  for (const fileName of fileNames) {
    const configPath = path.join(rootDir, fileName);
    const sourceText = await readFile(configPath, "utf8").catch(() => undefined);

    if (typeof sourceText === "string") {
      return parseConfigSource(sourceText, configPath);
    }
  }

  return undefined;
}

function parseConfigSource(sourceText: string, configPath: string) {
  const sourceFile = ts.createSourceFile(
    configPath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    configPath.endsWith(".ts") || configPath.endsWith(".mts")
      ? ts.ScriptKind.TS
      : ts.ScriptKind.JS,
  );

  return {
    configObject: findDefaultExportConfigObject(sourceFile),
    configPath,
    variables: collectTopLevelVariableInitializers(sourceFile),
  };
}

function readPositiveTimeoutCandidate(
  parsedConfig: ReturnType<typeof parseConfigSource>,
  propertyPath: string[],
  source: string,
): TimeoutCandidate | undefined {
  let expression: ts.Expression | undefined = parsedConfig.configObject;

  for (const propertyName of propertyPath) {
    const objectExpression = resolveObjectExpression(
      expression,
      parsedConfig.variables,
    );

    if (!objectExpression) {
      return undefined;
    }

    expression = getObjectPropertyInitializer(objectExpression, propertyName);
  }

  const timeoutMs = expression
    ? evaluateNumberExpression(expression, parsedConfig.variables)
    : undefined;

  if (!isPositiveFiniteNumber(timeoutMs)) {
    return undefined;
  }

  return {
    configPath: parsedConfig.configPath,
    source,
    timeoutMs,
  };
}

function readTraceModeCandidate(
  parsedConfig: ReturnType<typeof parseConfigSource>,
  propertyPath: string[],
  source: string,
): TraceModeCandidate | undefined {
  let expression: ts.Expression | undefined = parsedConfig.configObject;

  for (const propertyName of propertyPath) {
    const objectExpression = resolveObjectExpression(
      expression,
      parsedConfig.variables,
    );

    if (!objectExpression) {
      return undefined;
    }

    expression = getObjectPropertyInitializer(objectExpression, propertyName);
  }

  if (!expression) {
    return undefined;
  }

  const traceMode = evaluateTraceModeExpression(expression, parsedConfig.variables);

  if (!traceMode) {
    return undefined;
  }

  return {
    configPath: parsedConfig.configPath,
    mode: traceMode.mode,
    source: traceMode.fromObject ? `${source}.mode` : source,
  };
}

function collectTopLevelVariableInitializers(
  sourceFile: ts.SourceFile,
): Map<string, ts.Expression> {
  const variables = new Map<string, ts.Expression>();

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) {
      continue;
    }

    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.initializer) {
        variables.set(declaration.name.text, declaration.initializer);
      }
    }
  }

  return variables;
}

function findDefaultExportConfigObject(
  sourceFile: ts.SourceFile,
): ts.Expression | undefined {
  for (const statement of sourceFile.statements) {
    if (ts.isExportAssignment(statement)) {
      return statement.expression;
    }
  }

  return undefined;
}

function resolveObjectExpression(
  expression: ts.Expression | undefined,
  variables: Map<string, ts.Expression>,
  seen = new Set<string>(),
): ts.ObjectLiteralExpression | undefined {
  if (!expression) {
    return undefined;
  }

  const unwrappedExpression = unwrapExpression(expression);

  if (ts.isObjectLiteralExpression(unwrappedExpression)) {
    return unwrappedExpression;
  }

  if (ts.isCallExpression(unwrappedExpression)) {
    return resolveObjectExpression(unwrappedExpression.arguments[0], variables, seen);
  }

  if (ts.isIdentifier(unwrappedExpression)) {
    if (seen.has(unwrappedExpression.text)) {
      return undefined;
    }

    const initializer = variables.get(unwrappedExpression.text);

    if (!initializer) {
      return undefined;
    }

    seen.add(unwrappedExpression.text);
    return resolveObjectExpression(initializer, variables, seen);
  }

  return undefined;
}

function getObjectPropertyInitializer(
  objectExpression: ts.ObjectLiteralExpression,
  propertyName: string,
): ts.Expression | undefined {
  for (const property of objectExpression.properties) {
    if (!ts.isPropertyAssignment(property)) {
      continue;
    }

    const name = getPropertyName(property.name);

    if (name === propertyName) {
      return property.initializer;
    }
  }

  return undefined;
}

function getPropertyName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }

  return undefined;
}

function evaluateNumberExpression(
  expression: ts.Expression,
  variables: Map<string, ts.Expression>,
  seen = new Set<string>(),
): number | undefined {
  const unwrappedExpression = unwrapExpression(expression);

  if (ts.isNumericLiteral(unwrappedExpression)) {
    return Number(unwrappedExpression.text.replace(/_/g, ""));
  }

  if (ts.isIdentifier(unwrappedExpression)) {
    if (seen.has(unwrappedExpression.text)) {
      return undefined;
    }

    const initializer = variables.get(unwrappedExpression.text);

    if (!initializer) {
      return undefined;
    }

    seen.add(unwrappedExpression.text);
    return evaluateNumberExpression(initializer, variables, seen);
  }

  if (ts.isPrefixUnaryExpression(unwrappedExpression)) {
    const operand = evaluateNumberExpression(
      unwrappedExpression.operand,
      variables,
      seen,
    );

    if (typeof operand !== "number") {
      return undefined;
    }

    if (unwrappedExpression.operator === ts.SyntaxKind.PlusToken) {
      return operand;
    }

    if (unwrappedExpression.operator === ts.SyntaxKind.MinusToken) {
      return -operand;
    }
  }

  if (ts.isBinaryExpression(unwrappedExpression)) {
    const left = evaluateNumberExpression(unwrappedExpression.left, variables, seen);
    const right = evaluateNumberExpression(unwrappedExpression.right, variables, seen);

    if (typeof left !== "number" || typeof right !== "number") {
      return undefined;
    }

    switch (unwrappedExpression.operatorToken.kind) {
      case ts.SyntaxKind.AsteriskToken:
        return left * right;
      case ts.SyntaxKind.PlusToken:
        return left + right;
      case ts.SyntaxKind.MinusToken:
        return left - right;
      case ts.SyntaxKind.SlashToken:
        return left / right;
      default:
        return undefined;
    }
  }

  return undefined;
}

function evaluateTraceModeExpression(
  expression: ts.Expression,
  variables: Map<string, ts.Expression>,
): { fromObject: boolean; mode: BrowserTraceMode } | undefined {
  const resolvedExpression = resolveExpression(expression, variables);

  if (!resolvedExpression) {
    return undefined;
  }

  const directMode = getBrowserTraceMode(resolvedExpression);

  if (directMode) {
    return {
      fromObject: false,
      mode: directMode,
    };
  }

  const objectExpression = resolveObjectExpression(resolvedExpression, variables);
  const modeExpression = objectExpression
    ? getObjectPropertyInitializer(objectExpression, "mode")
    : undefined;
  const resolvedModeExpression = modeExpression
    ? resolveExpression(modeExpression, variables)
    : undefined;
  const objectMode = resolvedModeExpression
    ? getBrowserTraceMode(resolvedModeExpression)
    : undefined;

  return objectMode
    ? {
        fromObject: true,
        mode: objectMode,
      }
    : undefined;
}

function resolveExpression(
  expression: ts.Expression,
  variables: Map<string, ts.Expression>,
  seen = new Set<string>(),
): ts.Expression | undefined {
  const unwrappedExpression = unwrapExpression(expression);

  if (!ts.isIdentifier(unwrappedExpression)) {
    return unwrappedExpression;
  }

  if (seen.has(unwrappedExpression.text)) {
    return undefined;
  }

  const initializer = variables.get(unwrappedExpression.text);

  if (!initializer) {
    return undefined;
  }

  seen.add(unwrappedExpression.text);
  return resolveExpression(initializer, variables, seen);
}

function getBrowserTraceMode(expression: ts.Expression): BrowserTraceMode | undefined {
  const value =
    ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)
      ? expression.text
      : undefined;

  return browserTraceModes.find((mode) => mode === value);
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;

  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }

  return current;
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
