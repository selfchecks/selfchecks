import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

import {
  type ApiRequest,
  type CheckDefinition,
  checkDefinitionSchema,
  type CheckType,
  deploySummarySchema,
  type DeploySummary,
  type RetryStrategy,
  type RetryStrategyType,
  type WebhookAlertChannelDefinition,
  webhookAlertChannelSchema,
} from "./index.js";

export type ManifestImportResult = DeploySummary & {
  alertChannels: WebhookAlertChannelDefinition[];
};

export type ManifestImportOptions = {
  projectSlug: string;
  rootDir: string;
};

export type ParsedManifestFile = {
  checks: CheckDefinition[];
  filePath: string;
  warnings: string[];
};

type ParsedCheck = {
  check: Partial<CheckDefinition>;
  constructName: "ApiCheck" | "BrowserCheck" | "createApiCheck" | "createBrowserCheck";
};

type RequestFactoryKind = "api" | "bff" | "unknown";

type GroupDefinition = {
  alertChannelLogicalIds: string[];
  key: string;
  name?: string;
  retryStrategy?: RetryStrategy;
};

type GroupFactoryDefinition = {
  alertChannelLogicalIds: string[];
  retryStrategy?: RetryStrategy;
};

type ManifestImportContext = {
  alertChannelCollections: Map<string, string[]>;
  alertChannels: Map<string, WebhookAlertChannelDefinition>;
  groups: Map<string, GroupDefinition>;
  retryStrategies: Map<string, RetryStrategy>;
  stringConstants: Map<string, string>;
  warnings: string[];
};

type ParseContext = {
  retryStrategies: Map<string, RetryStrategy>;
  requestFactoryKind: RequestFactoryKind;
  requestVariables: Map<string, ApiRequest>;
};

const ignoredDirectories = new Set([
  ".git",
  ".next",
  ".selfchecks",
  "coverage",
  "dist",
  "node_modules",
]);

export async function importCheckDefinitions(
  options: ManifestImportOptions,
): Promise<ManifestImportResult> {
  const [checkFiles, sourceFiles] = await Promise.all([
    findCheckManifestFiles(options.rootDir),
    findManifestSourceFiles(options.rootDir),
  ]);
  const importContext = await buildManifestImportContext(options.rootDir, sourceFiles);
  const parsedFiles = await Promise.all(
    checkFiles.map(async (filePath) =>
      parseCheckManifestFile(options.rootDir, filePath, importContext),
    ),
  );
  const checks = parsedFiles.flatMap((file) => file.checks);
  const warnings = [
    ...importContext.warnings,
    ...parsedFiles.flatMap((file) => file.warnings),
  ];

  return {
    alertChannels: uniqueAlertChannels(importContext.alertChannels),
    checks,
    created: checks.length,
    projectSlug: options.projectSlug,
    removed: 0,
    updated: 0,
    warnings,
  };
}

export function toDeploySummary(summary: DeploySummary): DeploySummary {
  return deploySummarySchema.parse(
    JSON.parse(
      JSON.stringify({
        checks: summary.checks,
        created: summary.created,
        projectSlug: summary.projectSlug,
        removed: summary.removed,
        updated: summary.updated,
        warnings: summary.warnings,
      }),
    ),
  );
}

export async function findCheckManifestFiles(rootDir: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(currentDir: string): Promise<void> {
    const entries = await readdir(currentDir, {
      withFileTypes: true,
    });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) {
          await walk(path.join(currentDir, entry.name));
        }
        continue;
      }

      if (entry.isFile() && entry.name.endsWith(".check.ts")) {
        results.push(path.join(currentDir, entry.name));
      }
    }
  }

  await walk(rootDir);

  return results.sort();
}

async function findManifestSourceFiles(rootDir: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(currentDir: string): Promise<void> {
    const entries = await readdir(currentDir, {
      withFileTypes: true,
    });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) {
          await walk(path.join(currentDir, entry.name));
        }
        continue;
      }

      if (entry.isFile() && isManifestSupportSource(entry.name)) {
        results.push(path.join(currentDir, entry.name));
      }
    }
  }

  await walk(rootDir);

  return results.sort();
}

function isManifestSupportSource(fileName: string): boolean {
  return (
    fileName.endsWith(".ts") &&
    !fileName.endsWith(".d.ts") &&
    !fileName.endsWith(".spec.ts") &&
    !fileName.endsWith(".test.ts") &&
    !fileName.endsWith(".test.tsx")
  );
}

function createEmptyManifestImportContext(): ManifestImportContext {
  return {
    alertChannelCollections: new Map(),
    alertChannels: new Map(),
    groups: new Map(),
    retryStrategies: new Map(),
    stringConstants: new Map(),
    warnings: [],
  };
}

async function buildManifestImportContext(
  rootDir: string,
  sourceFiles: string[],
): Promise<ManifestImportContext> {
  const parsedFiles = await Promise.all(
    sourceFiles.map(async (filePath) => {
      const sourceText = await readFile(filePath, "utf8");
      const relativePath = path.relative(rootDir, filePath);
      const sourceFile = ts.createSourceFile(
        relativePath,
        sourceText,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      );

      return {
        filePath: relativePath,
        sourceFile,
      };
    }),
  );
  const context = createEmptyManifestImportContext();

  for (const parsedFile of parsedFiles) {
    collectStringConstants(parsedFile.sourceFile, context.stringConstants);
  }

  for (const parsedFile of parsedFiles) {
    collectRetryStrategies(
      parsedFile.sourceFile,
      parsedFile.filePath,
      context.retryStrategies,
    );
  }

  for (const parsedFile of parsedFiles) {
    collectWebhookAlertChannels(parsedFile.sourceFile, parsedFile.filePath, context);
  }

  collectWebhookAlertChannelCollections(
    parsedFiles.map((parsedFile) => parsedFile.sourceFile),
    context,
  );

  const groupFactories = new Map<string, GroupFactoryDefinition>();

  for (const parsedFile of parsedFiles) {
    collectGroupFactoryDefinitions(
      parsedFile.sourceFile,
      parsedFile.filePath,
      context.retryStrategies,
      context.alertChannels,
      context.alertChannelCollections,
      groupFactories,
    );
  }

  for (const parsedFile of parsedFiles) {
    collectGroupDefinitions(
      parsedFile.sourceFile,
      parsedFile.filePath,
      context,
      groupFactories,
    );
  }

  return context;
}

export async function parseCheckManifestFile(
  rootDir: string,
  filePath: string,
  importContext: ManifestImportContext = createEmptyManifestImportContext(),
): Promise<ParsedManifestFile> {
  const sourceText = await readFile(filePath, "utf8");
  const relativePath = path.relative(rootDir, filePath);
  const result = parseCheckManifestSource(sourceText, relativePath, importContext);
  const group = inferGroupFromPath(relativePath);

  return {
    checks: result.checks.map((check) => {
      const referencedGroup = check.groupKey
        ? importContext.groups.get(check.groupKey)
        : undefined;
      const inferredGroup = group ? importContext.groups.get(group.key) : undefined;
      const groupDefinition = referencedGroup ?? inferredGroup;

      return {
        ...check,
        alertChannelLogicalIds:
          groupDefinition?.alertChannelLogicalIds ?? check.alertChannelLogicalIds ?? [],
        entrypoint: normalizeEntrypoint(rootDir, relativePath, check.entrypoint),
        groupKey: group?.key ?? groupDefinition?.key ?? check.groupKey,
        groupName: group?.name ?? groupDefinition?.name ?? check.groupName,
        retryStrategy: check.retryStrategy ?? groupDefinition?.retryStrategy,
      };
    }),
    filePath: relativePath,
    warnings: result.warnings,
  };
}

export function parseCheckManifestSource(
  sourceText: string,
  filePath: string,
  importContext: ManifestImportContext = createEmptyManifestImportContext(),
): ParsedManifestFile {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const context = buildParseContext(sourceFile, filePath, importContext);
  const checks: CheckDefinition[] = [];
  const warnings: string[] = [];

  function addParsedCheck(parsedCheck: ParsedCheck | undefined): void {
    if (!parsedCheck) {
      return;
    }

    const validation = checkDefinitionSchema.safeParse(parsedCheck.check);

    if (validation.success) {
      checks.push(validation.data);
      return;
    }

    warnings.push(
      `${filePath}: skipped ${parsedCheck.constructName} because ${validation.error.issues
        .map((issue) => issue.message)
        .join("; ")}`,
    );
  }

  function visit(node: ts.Node): void {
    if (ts.isNewExpression(node)) {
      addParsedCheck(parseCheckNewExpression(node, filePath, context));
    }

    if (ts.isCallExpression(node)) {
      addParsedCheck(parseCheckHelperCall(node, filePath, context));
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return {
    checks,
    filePath,
    warnings,
  };
}

function collectRetryStrategies(
  sourceFile: ts.SourceFile,
  filePath: string,
  retryStrategies: Map<string, RetryStrategy>,
): void {
  function visit(node: ts.Node): void {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer
    ) {
      const retryStrategy = resolveRetryStrategyExpression(
        node.initializer,
        filePath,
        retryStrategies,
      );

      if (retryStrategy) {
        retryStrategies.set(node.name.text, retryStrategy);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

function collectStringConstants(
  sourceFile: ts.SourceFile,
  stringConstants: Map<string, string>,
): void {
  function visit(node: ts.Node): void {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer
    ) {
      const value = extractStringValue(node.initializer, sourceFile.fileName);

      if (value !== undefined) {
        stringConstants.set(node.name.text, value);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

function collectWebhookAlertChannels(
  sourceFile: ts.SourceFile,
  filePath: string,
  context: ManifestImportContext,
): void {
  function visit(node: ts.Node): void {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isNewExpression(node.initializer) &&
      getExpressionName(node.initializer.expression) === "WebhookAlertChannel"
    ) {
      const parsed = parseWebhookAlertChannel(
        node.initializer,
        filePath,
        context.stringConstants,
      );

      if (parsed.success) {
        context.alertChannels.set(node.name.text, parsed.channel);
        context.alertChannels.set(parsed.channel.logicalId, parsed.channel);
      } else {
        context.warnings.push(
          `${filePath}: skipped WebhookAlertChannel ${node.name.text} because ${parsed.error}`,
        );
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

function parseWebhookAlertChannel(
  expression: ts.NewExpression,
  filePath: string,
  stringConstants: Map<string, string>,
):
  | { channel: WebhookAlertChannelDefinition; success: true }
  | { error: string; success: false } {
  const args = expression.arguments ? [...expression.arguments] : [];
  const logicalId = args[0]
    ? extractStaticStringValue(args[0], filePath, stringConstants)
    : undefined;
  const config = args[1];

  if (!logicalId || !config || !ts.isObjectLiteralExpression(config)) {
    return {
      error: "its logical ID and configuration must be static",
      success: false,
    };
  }

  const urlProperty = getPropertyAssignment(config, "url");
  const url = urlProperty
    ? extractWebhookUrl(urlProperty.initializer, filePath, stringConstants)
    : undefined;
  const method = (
    getStaticStringProperty(config, "method", filePath, stringConstants) ?? "POST"
  ).toUpperCase();
  const candidate = {
    adapter: "generic" as const,
    logicalId,
    method,
    name:
      getStaticStringProperty(config, "name", filePath, stringConstants) ?? logicalId,
    sendDegraded: getBooleanProperty(config, "sendDegraded") ?? false,
    sendFailure: getBooleanProperty(config, "sendFailure") ?? true,
    sendRecovery: getBooleanProperty(config, "sendRecovery") ?? true,
    sslExpiry: getBooleanProperty(config, "sslExpiry") ?? false,
    template: getStaticStringProperty(config, "template", filePath, stringConstants),
    url,
  };
  const validation = webhookAlertChannelSchema.safeParse(candidate);

  return validation.success
    ? { channel: validation.data, success: true }
    : {
        error: validation.error.issues.map((issue) => issue.message).join("; "),
        success: false,
      };
}

function extractWebhookUrl(
  expression: ts.Expression,
  filePath: string,
  stringConstants: Map<string, string>,
): string | undefined {
  if (
    ts.isNewExpression(expression) &&
    getExpressionName(expression.expression) === "URL"
  ) {
    const value = expression.arguments?.[0];

    return value
      ? extractStaticStringValue(value, filePath, stringConstants)
      : undefined;
  }

  return extractStaticStringValue(expression, filePath, stringConstants);
}

function collectWebhookAlertChannelCollections(
  sourceFiles: ts.SourceFile[],
  context: ManifestImportContext,
): void {
  const declarations: Array<{ expression: ts.Expression; name: string }> = [];

  for (const sourceFile of sourceFiles) {
    function visit(node: ts.Node): void {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer
      ) {
        declarations.push({ expression: node.initializer, name: node.name.text });
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  }

  for (let pass = 0; pass < declarations.length; pass += 1) {
    let changed = false;

    for (const declaration of declarations) {
      const logicalIds = resolveAlertChannelLogicalIds(
        declaration.expression,
        context.alertChannels,
        context.alertChannelCollections,
      );

      if (
        logicalIds.length > 0 &&
        !sameStringArray(
          context.alertChannelCollections.get(declaration.name),
          logicalIds,
        )
      ) {
        context.alertChannelCollections.set(declaration.name, logicalIds);
        changed = true;
      }
    }

    if (!changed) {
      break;
    }
  }
}

function resolveAlertChannelLogicalIds(
  expression: ts.Expression,
  alertChannels: Map<string, WebhookAlertChannelDefinition>,
  collections: Map<string, string[]>,
): string[] {
  if (ts.isIdentifier(expression)) {
    const channel = alertChannels.get(expression.text);

    return channel ? [channel.logicalId] : (collections.get(expression.text) ?? []);
  }

  if (!ts.isArrayLiteralExpression(expression)) {
    return [];
  }

  return uniqueStrings(
    expression.elements.flatMap((element) =>
      ts.isSpreadElement(element)
        ? resolveAlertChannelLogicalIds(element.expression, alertChannels, collections)
        : resolveAlertChannelLogicalIds(element, alertChannels, collections),
    ),
  );
}

function uniqueAlertChannels(
  alertChannels: Map<string, WebhookAlertChannelDefinition>,
): WebhookAlertChannelDefinition[] {
  return [
    ...new Map(
      [...alertChannels.values()].map((channel) => [channel.logicalId, channel]),
    ).values(),
  ].sort((left, right) => left.logicalId.localeCompare(right.logicalId));
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function sameStringArray(left: string[] | undefined, right: string[]): boolean {
  return Boolean(
    left &&
    left.length === right.length &&
    left.every((value, index) => value === right[index]),
  );
}

function collectGroupFactoryDefinitions(
  sourceFile: ts.SourceFile,
  filePath: string,
  retryStrategies: Map<string, RetryStrategy>,
  alertChannels: Map<string, WebhookAlertChannelDefinition>,
  alertChannelCollections: Map<string, string[]>,
  groupFactories: Map<string, GroupFactoryDefinition>,
): void {
  function recordFactory(name: string, body: ts.Node): void {
    const retryStrategy = findCheckGroupRetryStrategy(body, filePath, retryStrategies);
    const alertChannelLogicalIds = findCheckGroupAlertChannelLogicalIds(
      body,
      alertChannels,
      alertChannelCollections,
    );

    if (retryStrategy || alertChannelLogicalIds.length > 0) {
      groupFactories.set(name, {
        alertChannelLogicalIds,
        retryStrategy,
      });
    }
  }

  function visit(node: ts.Node): void {
    if (ts.isFunctionDeclaration(node) && node.name && node.body) {
      recordFactory(node.name.text, node.body);
    }

    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) ||
        ts.isFunctionExpression(node.initializer))
    ) {
      recordFactory(node.name.text, node.initializer.body);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

function collectGroupDefinitions(
  sourceFile: ts.SourceFile,
  filePath: string,
  context: ManifestImportContext,
  groupFactories: Map<string, GroupFactoryDefinition>,
): void {
  function visit(node: ts.Node): void {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer
    ) {
      const group = parseGroupDefinition(
        node.initializer,
        filePath,
        context.retryStrategies,
        context.alertChannels,
        context.alertChannelCollections,
        groupFactories,
      );

      if (group) {
        addGroupDefinition(context.groups, node.name.text, group);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

function parseGroupDefinition(
  expression: ts.Expression,
  filePath: string,
  retryStrategies: Map<string, RetryStrategy>,
  alertChannels: Map<string, WebhookAlertChannelDefinition>,
  alertChannelCollections: Map<string, string[]>,
  groupFactories: Map<string, GroupFactoryDefinition>,
): GroupDefinition | undefined {
  if (ts.isCallExpression(expression)) {
    return parseGroupFactoryCall(
      expression,
      filePath,
      retryStrategies,
      alertChannels,
      alertChannelCollections,
      groupFactories,
    );
  }

  if (ts.isNewExpression(expression)) {
    return parseCheckGroupNewExpression(
      expression,
      filePath,
      retryStrategies,
      alertChannels,
      alertChannelCollections,
    );
  }

  return undefined;
}

function parseGroupFactoryCall(
  expression: ts.CallExpression,
  filePath: string,
  retryStrategies: Map<string, RetryStrategy>,
  alertChannels: Map<string, WebhookAlertChannelDefinition>,
  alertChannelCollections: Map<string, string[]>,
  groupFactories: Map<string, GroupFactoryDefinition>,
): GroupDefinition | undefined {
  const factory = groupFactories.get(getExpressionName(expression.expression) ?? "");

  if (!factory) {
    return undefined;
  }

  const [nameArg, optionsArg] = [...expression.arguments];
  const name = nameArg ? extractStringValue(nameArg, filePath) : undefined;

  if (!name) {
    return undefined;
  }

  const options =
    optionsArg && ts.isObjectLiteralExpression(optionsArg) ? optionsArg : undefined;

  return {
    alertChannelLogicalIds:
      (options
        ? getAlertChannelLogicalIdsProperty(
            options,
            alertChannels,
            alertChannelCollections,
          )
        : undefined) ?? factory.alertChannelLogicalIds,
    key: slugify(name),
    name,
    retryStrategy:
      (options
        ? getRetryStrategyProperty(options, filePath, retryStrategies)
        : undefined) ?? factory.retryStrategy,
  };
}

function parseCheckGroupNewExpression(
  expression: ts.NewExpression,
  filePath: string,
  retryStrategies: Map<string, RetryStrategy>,
  alertChannels: Map<string, WebhookAlertChannelDefinition>,
  alertChannelCollections: Map<string, string[]>,
): GroupDefinition | undefined {
  if (!isCheckGroupConstructName(getExpressionName(expression.expression))) {
    return undefined;
  }

  const args = expression.arguments ? [...expression.arguments] : [];
  const firstArg = args[0];
  const secondArg = args[1];
  const key = firstArg ? extractStringValue(firstArg, filePath) : undefined;
  const config =
    firstArg && ts.isObjectLiteralExpression(firstArg)
      ? firstArg
      : secondArg && ts.isObjectLiteralExpression(secondArg)
        ? secondArg
        : undefined;
  const name = config ? getStringProperty(config, "name", filePath) : undefined;

  if (!key && !name) {
    return undefined;
  }

  return {
    alertChannelLogicalIds: config
      ? (getAlertChannelLogicalIdsProperty(
          config,
          alertChannels,
          alertChannelCollections,
        ) ?? [])
      : [],
    key: key ?? slugify(name ?? ""),
    name,
    retryStrategy: config
      ? getRetryStrategyProperty(config, filePath, retryStrategies)
      : undefined,
  };
}

function addGroupDefinition(
  groups: Map<string, GroupDefinition>,
  referenceName: string,
  group: GroupDefinition,
): void {
  groups.set(referenceName, group);
  groups.set(group.key, group);

  if (group.name) {
    groups.set(slugify(group.name), group);
  }
}

function findCheckGroupRetryStrategy(
  node: ts.Node,
  filePath: string,
  retryStrategies: Map<string, RetryStrategy>,
): RetryStrategy | undefined {
  let retryStrategy: RetryStrategy | undefined;

  function visit(currentNode: ts.Node): void {
    if (retryStrategy) {
      return;
    }

    if (
      ts.isNewExpression(currentNode) &&
      isCheckGroupConstructName(getExpressionName(currentNode.expression))
    ) {
      const args = currentNode.arguments ? [...currentNode.arguments] : [];
      const config = args.find((arg): arg is ts.ObjectLiteralExpression =>
        ts.isObjectLiteralExpression(arg),
      );

      if (config) {
        retryStrategy = getRetryStrategyProperty(config, filePath, retryStrategies);
      }
    }

    ts.forEachChild(currentNode, visit);
  }

  visit(node);

  return retryStrategy;
}

function findCheckGroupAlertChannelLogicalIds(
  node: ts.Node,
  alertChannels: Map<string, WebhookAlertChannelDefinition>,
  alertChannelCollections: Map<string, string[]>,
): string[] {
  let logicalIds: string[] = [];

  function visit(currentNode: ts.Node): void {
    if (logicalIds.length > 0) {
      return;
    }

    if (
      ts.isNewExpression(currentNode) &&
      isCheckGroupConstructName(getExpressionName(currentNode.expression))
    ) {
      const args = currentNode.arguments ? [...currentNode.arguments] : [];
      const config = args.find((arg): arg is ts.ObjectLiteralExpression =>
        ts.isObjectLiteralExpression(arg),
      );

      if (config) {
        logicalIds =
          getAlertChannelLogicalIdsProperty(
            config,
            alertChannels,
            alertChannelCollections,
          ) ?? [];
      }
    }

    ts.forEachChild(currentNode, visit);
  }

  visit(node);

  return logicalIds;
}

function isCheckGroupConstructName(name: string | undefined): boolean {
  return name === "CheckGroup" || name === "CheckGroupV2";
}

function buildParseContext(
  sourceFile: ts.SourceFile,
  filePath: string,
  importContext: ManifestImportContext,
): ParseContext {
  const requestFactoryKind = getRequestFactoryKind(sourceFile);
  const requestVariables = new Map<string, ApiRequest>();

  sourceFile.forEachChild((node) => {
    if (!ts.isVariableStatement(node)) {
      return;
    }

    for (const declaration of node.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.initializer &&
        ts.isCallExpression(declaration.initializer) &&
        getExpressionName(declaration.initializer.expression) === "createRequest"
      ) {
        const request = inferCreateRequest(
          declaration.initializer,
          requestFactoryKind,
          filePath,
        );

        if (request) {
          requestVariables.set(declaration.name.text, request);
        }
      }
    }
  });

  return {
    retryStrategies: importContext.retryStrategies,
    requestFactoryKind,
    requestVariables,
  };
}

function getRequestFactoryKind(sourceFile: ts.SourceFile): RequestFactoryKind {
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) {
      continue;
    }

    const importClause = statement.importClause;
    const moduleSpecifier = statement.moduleSpecifier;

    if (
      !importClause?.namedBindings ||
      !ts.isNamedImports(importClause.namedBindings) ||
      !ts.isStringLiteral(moduleSpecifier)
    ) {
      continue;
    }

    const importsCreateRequest = importClause.namedBindings.elements.some(
      (element) =>
        (element.propertyName?.text ?? element.name.text) === "createRequest",
    );

    if (!importsCreateRequest) {
      continue;
    }

    if (moduleSpecifier.text.endsWith("/requestBff")) {
      return "bff";
    }

    if (moduleSpecifier.text.endsWith("/request")) {
      return "api";
    }
  }

  return "unknown";
}

function parseCheckNewExpression(
  node: ts.NewExpression,
  filePath: string,
  context: ParseContext,
): ParsedCheck | undefined {
  const constructName = getExpressionName(node.expression);

  if (constructName !== "ApiCheck" && constructName !== "BrowserCheck") {
    return undefined;
  }

  const type: CheckType = constructName === "ApiCheck" ? "api" : "browser";
  const args = node.arguments ? [...node.arguments] : [];
  const firstArg = args[0];
  const secondArg = args[1];
  const keyFromArg = firstArg ? extractStringValue(firstArg, filePath) : undefined;
  const config =
    firstArg && ts.isObjectLiteralExpression(firstArg)
      ? firstArg
      : secondArg && ts.isObjectLiteralExpression(secondArg)
        ? secondArg
        : undefined;

  if (!config) {
    return {
      check: {
        key: keyFromArg,
        name: keyFromArg,
        type,
      },
      constructName,
    };
  }

  return {
    check: buildCheckFromConfig({
      config,
      defaultKey: keyFromArg,
      defaultName: keyFromArg,
      filePath,
      type,
      context,
    }),
    constructName,
  };
}

function parseCheckHelperCall(
  node: ts.CallExpression,
  filePath: string,
  context: ParseContext,
): ParsedCheck | undefined {
  const helperName = getExpressionName(node.expression);

  if (helperName === "createBrowserCheck") {
    const [nameArg, entrypointArg, optionsArg] = [...node.arguments];
    const name = nameArg ? extractStringValue(nameArg, filePath) : undefined;
    const entrypoint = entrypointArg
      ? extractStringValue(entrypointArg, filePath)
      : undefined;
    const config =
      optionsArg && ts.isObjectLiteralExpression(optionsArg) ? optionsArg : undefined;

    return {
      check: {
        ...buildCheckFromConfig({
          config,
          defaultKey: name ? getLogicalId(name) : undefined,
          defaultName: name,
          filePath,
          type: "browser",
          context,
        }),
        entrypoint,
      },
      constructName: helperName,
    };
  }

  if (helperName === "createApiCheck") {
    const [nameArg, optionsArg] = [...node.arguments];
    const name = nameArg ? extractStringValue(nameArg, filePath) : undefined;
    const config =
      optionsArg && ts.isObjectLiteralExpression(optionsArg) ? optionsArg : undefined;

    return {
      check: buildCheckFromConfig({
        config,
        defaultKey: name ? getLogicalId(name) : undefined,
        defaultName: name,
        filePath,
        type: "api",
        context,
      }),
      constructName: helperName,
    };
  }

  return undefined;
}

function buildCheckFromConfig({
  config,
  context,
  defaultKey,
  defaultName,
  filePath,
  type,
}: {
  config: ts.ObjectLiteralExpression | undefined;
  context: ParseContext;
  defaultKey: string | undefined;
  defaultName: string | undefined;
  filePath: string;
  type: CheckType;
}): Partial<CheckDefinition> {
  const name = config
    ? (getStringProperty(config, "name", filePath) ?? defaultName)
    : defaultName;
  const key =
    defaultKey ??
    (config
      ? (getStringProperty(config, "key", filePath) ??
        getStringProperty(config, "id", filePath) ??
        getStringProperty(config, "logicalId", filePath))
      : undefined) ??
    (name ? slugify(name) : undefined);
  const check: Partial<CheckDefinition> = {
    enabled: config
      ? (getBooleanProperty(config, "enabled") ??
        getBooleanProperty(config, "activated") ??
        true)
      : true,
    frequency: config ? getFrequencyProperty(config) : undefined,
    groupKey: config ? getReferenceProperty(config, "group") : undefined,
    key,
    name,
    retryStrategy: config
      ? getRetryStrategyProperty(config, filePath, context.retryStrategies)
      : undefined,
    tags: config ? (getStringArrayProperty(config, "tags", filePath) ?? []) : [],
    type,
  };

  if (type === "browser") {
    check.entrypoint = config
      ? (getStringProperty(config, "entrypoint", filePath) ??
        getCodeEntrypoint(config, filePath))
      : undefined;
  } else if (config) {
    check.request = getApiRequest(config, filePath, context);
  }

  return check;
}

function getExpressionName(expression: ts.Expression): string | undefined {
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }

  if (ts.isPropertyAccessExpression(expression)) {
    return expression.name.text;
  }

  return undefined;
}

function getPropertyAssignment(
  objectLiteral: ts.ObjectLiteralExpression,
  propertyName: string,
): ts.PropertyAssignment | undefined {
  return objectLiteral.properties.find(
    (property): property is ts.PropertyAssignment => {
      if (!ts.isPropertyAssignment(property)) {
        return false;
      }

      const name = property.name;

      return (
        (ts.isIdentifier(name) && name.text === propertyName) ||
        (ts.isStringLiteral(name) && name.text === propertyName)
      );
    },
  );
}

function getStringProperty(
  objectLiteral: ts.ObjectLiteralExpression,
  propertyName: string,
  filePath: string,
): string | undefined {
  const property = getPropertyAssignment(objectLiteral, propertyName);

  return property ? extractStringValue(property.initializer, filePath) : undefined;
}

function getStaticStringProperty(
  objectLiteral: ts.ObjectLiteralExpression,
  propertyName: string,
  filePath: string,
  stringConstants: Map<string, string>,
): string | undefined {
  const property = getPropertyAssignment(objectLiteral, propertyName);

  return property
    ? extractStaticStringValue(property.initializer, filePath, stringConstants)
    : undefined;
}

function getBooleanProperty(
  objectLiteral: ts.ObjectLiteralExpression,
  propertyName: string,
): boolean | undefined {
  const property = getPropertyAssignment(objectLiteral, propertyName);

  if (!property) {
    return undefined;
  }

  if (property.initializer.kind === ts.SyntaxKind.TrueKeyword) {
    return true;
  }

  if (property.initializer.kind === ts.SyntaxKind.FalseKeyword) {
    return false;
  }

  return undefined;
}

function getFrequencyProperty(
  objectLiteral: ts.ObjectLiteralExpression,
): CheckDefinition["frequency"] | undefined {
  const property = getPropertyAssignment(objectLiteral, "frequency");

  if (!property || !ts.isPropertyAccessExpression(property.initializer)) {
    return undefined;
  }

  const frequencyName = property.initializer.name.text;
  const match = /^EVERY_(\d+)(M|H|D)$/.exec(frequencyName);

  if (!match) {
    return undefined;
  }

  const value = Number.parseInt(match[1] ?? "", 10);
  const unit = match[2];

  if (!Number.isSafeInteger(value) || !unit) {
    return undefined;
  }

  const multiplier = unit === "M" ? 1 : unit === "H" ? 60 : 1440;

  return {
    intervalMinutes: value * multiplier,
  };
}

function getRetryStrategyProperty(
  objectLiteral: ts.ObjectLiteralExpression,
  filePath: string,
  retryStrategies: Map<string, RetryStrategy> = new Map(),
): RetryStrategy | undefined {
  const property = getPropertyAssignment(objectLiteral, "retryStrategy");

  return property
    ? resolveRetryStrategyExpression(property.initializer, filePath, retryStrategies)
    : undefined;
}

function getAlertChannelLogicalIdsProperty(
  objectLiteral: ts.ObjectLiteralExpression,
  alertChannels: Map<string, WebhookAlertChannelDefinition>,
  alertChannelCollections: Map<string, string[]>,
): string[] | undefined {
  const property = getPropertyAssignment(objectLiteral, "alertChannels");

  return property
    ? resolveAlertChannelLogicalIds(
        property.initializer,
        alertChannels,
        alertChannelCollections,
      )
    : undefined;
}

function resolveRetryStrategyExpression(
  expression: ts.Expression,
  filePath: string,
  retryStrategies: Map<string, RetryStrategy>,
): RetryStrategy | undefined {
  const inlineStrategy = parseRetryStrategy(expression, filePath);

  if (inlineStrategy) {
    return inlineStrategy;
  }

  const referenceName = getExpressionName(expression);

  return referenceName ? retryStrategies.get(referenceName) : undefined;
}

function parseRetryStrategy(
  expression: ts.Expression,
  filePath: string,
): RetryStrategy | undefined {
  if (ts.isObjectLiteralExpression(expression)) {
    return getRetryStrategyFromObject(expression, filePath);
  }

  if (!ts.isCallExpression(expression)) {
    return undefined;
  }

  const strategyName = getExpressionName(expression.expression);

  if (strategyName === "noRetries") {
    return {
      maxRetries: 0,
      type: "NO_RETRIES",
    };
  }

  const type = getRetryStrategyType(strategyName);
  const options = expression.arguments[0];

  if (!type || !options || !ts.isObjectLiteralExpression(options)) {
    return undefined;
  }

  return {
    ...getRetryStrategyOptions(options, filePath),
    type,
  };
}

function getRetryStrategyFromObject(
  objectLiteral: ts.ObjectLiteralExpression,
  filePath: string,
): RetryStrategy | undefined {
  const typeProperty = getPropertyAssignment(objectLiteral, "type");
  const type =
    getRetryStrategyType(getStringProperty(objectLiteral, "type", filePath)) ??
    getRetryStrategyType(
      typeProperty ? getExpressionName(typeProperty.initializer) : undefined,
    );

  if (!type) {
    return undefined;
  }

  return {
    ...getRetryStrategyOptions(objectLiteral, filePath),
    type,
  };
}

function getRetryStrategyOptions(
  objectLiteral: ts.ObjectLiteralExpression,
  filePath: string,
): Omit<RetryStrategy, "type"> {
  return {
    baseBackoffSeconds: getNumberProperty(objectLiteral, "baseBackoffSeconds"),
    maxDurationSeconds: getNumberProperty(objectLiteral, "maxDurationSeconds"),
    maxRetries: getNumberProperty(objectLiteral, "maxRetries"),
    onlyOn: getStringArrayProperty(objectLiteral, "onlyOn", filePath),
    sameRegion: getBooleanProperty(objectLiteral, "sameRegion"),
  };
}

function getRetryStrategyType(
  value: string | undefined,
): RetryStrategyType | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value
    .replace(/Strategy$/, "")
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/[-\s]+/g, "_")
    .toUpperCase();

  if (normalized === "NORETRIES" || normalized === "NO_RETRIES") {
    return "NO_RETRIES";
  }

  if (normalized === "FIXED") {
    return "FIXED";
  }

  if (normalized === "LINEAR") {
    return "LINEAR";
  }

  if (normalized === "EXPONENTIAL") {
    return "EXPONENTIAL";
  }

  return undefined;
}

function getReferenceProperty(
  objectLiteral: ts.ObjectLiteralExpression,
  propertyName: string,
): string | undefined {
  const property = getPropertyAssignment(objectLiteral, propertyName);

  if (!property) {
    return undefined;
  }

  return getExpressionName(property.initializer);
}

function getStringArrayProperty(
  objectLiteral: ts.ObjectLiteralExpression,
  propertyName: string,
  filePath: string,
): string[] | undefined {
  const property = getPropertyAssignment(objectLiteral, propertyName);

  if (!property || !ts.isArrayLiteralExpression(property.initializer)) {
    return undefined;
  }

  return property.initializer.elements.flatMap((element) => {
    const value = extractTagValue(element, filePath);

    return value ? [value] : [];
  });
}

function getCodeEntrypoint(
  objectLiteral: ts.ObjectLiteralExpression,
  filePath: string,
): string | undefined {
  const codeProperty = getPropertyAssignment(objectLiteral, "code");

  if (!codeProperty || !ts.isObjectLiteralExpression(codeProperty.initializer)) {
    return undefined;
  }

  return getStringProperty(codeProperty.initializer, "entrypoint", filePath);
}

function getApiRequest(
  objectLiteral: ts.ObjectLiteralExpression,
  filePath: string,
  context: ParseContext,
): ApiRequest | undefined {
  const requestProperty = getPropertyAssignment(objectLiteral, "request");

  if (!requestProperty) {
    return undefined;
  }

  if (ts.isIdentifier(requestProperty.initializer)) {
    return context.requestVariables.get(requestProperty.initializer.text);
  }

  if (ts.isCallExpression(requestProperty.initializer)) {
    return inferCreateRequest(
      requestProperty.initializer,
      context.requestFactoryKind,
      filePath,
    );
  }

  if (!ts.isObjectLiteralExpression(requestProperty.initializer)) {
    return undefined;
  }

  const request = requestProperty.initializer;
  const baseRequest = getBaseRequestFromSpreads(request, context);
  const method = getStringProperty(request, "method", filePath) ?? baseRequest?.method;
  const url = getStringProperty(request, "url", filePath) ?? baseRequest?.url;

  if (!method || !url) {
    return undefined;
  }

  return {
    assertions: [],
    body: getStringProperty(request, "body", filePath) ?? baseRequest?.body,
    headers:
      getRecordProperty(request, "headers", filePath) ?? baseRequest?.headers ?? {},
    method,
    url,
  };
}

function getBaseRequestFromSpreads(
  objectLiteral: ts.ObjectLiteralExpression,
  context: ParseContext,
): ApiRequest | undefined {
  for (const property of objectLiteral.properties) {
    if (
      ts.isSpreadAssignment(property) &&
      ts.isIdentifier(property.expression) &&
      context.requestVariables.has(property.expression.text)
    ) {
      return context.requestVariables.get(property.expression.text);
    }
  }

  return undefined;
}

function inferCreateRequest(
  expression: ts.CallExpression,
  kind: RequestFactoryKind,
  filePath: string,
): ApiRequest | undefined {
  if (getExpressionName(expression.expression) !== "createRequest") {
    return undefined;
  }

  if (kind === "bff") {
    const urlPath = expression.arguments[0]
      ? extractStringValue(expression.arguments[0], filePath)
      : "";

    return {
      assertions: [],
      headers: {},
      method: "GET",
      url: `https://bff.sndsy.ru/${urlPath ?? ""}`,
    };
  }

  if (kind === "api") {
    return {
      assertions: [],
      body: expression.arguments[1]?.getText(),
      headers: {},
      method: "POST",
      url: "{{API_URL}}/general/api/v100/json/{{ACCOUNT}}",
    };
  }

  return undefined;
}

function getNumberProperty(
  objectLiteral: ts.ObjectLiteralExpression,
  propertyName: string,
): number | undefined {
  const property = getPropertyAssignment(objectLiteral, propertyName);

  if (!property) {
    return undefined;
  }

  const expression = property.initializer;

  if (ts.isNumericLiteral(expression)) {
    return Number.parseFloat(expression.text);
  }

  if (
    ts.isPrefixUnaryExpression(expression) &&
    expression.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(expression.operand)
  ) {
    return -Number.parseFloat(expression.operand.text);
  }

  return undefined;
}

function getRecordProperty(
  objectLiteral: ts.ObjectLiteralExpression,
  propertyName: string,
  filePath: string,
): Record<string, string> | undefined {
  const property = getPropertyAssignment(objectLiteral, propertyName);

  if (!property || !ts.isObjectLiteralExpression(property.initializer)) {
    return undefined;
  }

  const entries = property.initializer.properties.flatMap((entry) => {
    if (!ts.isPropertyAssignment(entry)) {
      return [];
    }

    const key = ts.isIdentifier(entry.name)
      ? entry.name.text
      : ts.isStringLiteral(entry.name)
        ? entry.name.text
        : undefined;
    const value = extractStringValue(entry.initializer, filePath);

    return key && value ? [[key, value] as const] : [];
  });

  return Object.fromEntries(entries);
}

function extractTagValue(
  expression: ts.Expression,
  filePath: string,
): string | undefined {
  if (
    ts.isPropertyAccessExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === "Tags"
  ) {
    return expression.name.text.toLowerCase();
  }

  return extractStringValue(expression, filePath);
}

function extractStringValue(
  expression: ts.Expression,
  filePath: string,
): string | undefined {
  if (ts.isStringLiteralLike(expression)) {
    return expression.text;
  }

  if (ts.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.text;
  }

  if (ts.isTemplateExpression(expression) && expression.templateSpans.length === 0) {
    return expression.head.text;
  }

  if (ts.isCallExpression(expression) && isPathJoinCall(expression)) {
    const parts = expression.arguments.flatMap((argument) => {
      if (ts.isIdentifier(argument) && argument.text === "__dirname") {
        return [];
      }

      const value = extractStringValue(argument, filePath);

      return value ? [value] : [];
    });

    return parts.length > 0 ? path.join(...parts) : undefined;
  }

  return undefined;
}

function extractStaticStringValue(
  expression: ts.Expression,
  filePath: string,
  stringConstants: Map<string, string>,
): string | undefined {
  if (ts.isIdentifier(expression)) {
    return stringConstants.get(expression.text);
  }

  return extractStringValue(expression, filePath);
}

function isPathJoinCall(expression: ts.CallExpression): boolean {
  const callExpression = expression.expression;

  return (
    ts.isPropertyAccessExpression(callExpression) &&
    callExpression.name.text === "join" &&
    ts.isIdentifier(callExpression.expression) &&
    callExpression.expression.text === "path"
  );
}

function getLogicalId(value: string): string {
  return value.replace(/[.\s]/g, "-").replace(/[()]/gi, "");
}

function slugify(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "check"
  );
}

function normalizeEntrypoint(
  rootDir: string,
  checkFilePath: string,
  entrypoint: string | undefined,
): string | undefined {
  if (!entrypoint || path.isAbsolute(entrypoint)) {
    return entrypoint;
  }

  if (!entrypoint.startsWith(".")) {
    return entrypoint;
  }

  const absoluteEntrypoint = path.resolve(
    rootDir,
    path.dirname(checkFilePath),
    entrypoint,
  );

  return path.relative(rootDir, absoluteEntrypoint);
}

function inferGroupFromPath(
  filePath: string,
): { key: string; name: string } | undefined {
  const parts = filePath.split(path.sep);
  const checksIndex = parts.indexOf("__checks__");

  if (checksIndex === -1) {
    return undefined;
  }

  const first = parts[checksIndex + 1];
  const second = parts[checksIndex + 2];
  const third = parts[checksIndex + 3];

  if (!first || !second) {
    return undefined;
  }

  const name =
    first.toLowerCase() === "ui" && third
      ? `${titleCase(second)} / ${titleCase(third)}`
      : `${titleCase(first)} / ${titleCase(second)}`;

  return {
    key: slugify(name),
    name,
  };
}

function titleCase(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}
