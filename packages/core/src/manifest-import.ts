import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

import {
  type ApiRequest,
  type CheckDefinition,
  checkDefinitionSchema,
  type CheckType,
  type DeploySummary,
} from "./index.js";

export type ManifestImportResult = DeploySummary;

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

type ParseContext = {
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
  const checkFiles = await findCheckManifestFiles(options.rootDir);
  const parsedFiles = await Promise.all(
    checkFiles.map(async (filePath) =>
      parseCheckManifestFile(options.rootDir, filePath),
    ),
  );
  const checks = parsedFiles.flatMap((file) => file.checks);
  const warnings = parsedFiles.flatMap((file) => file.warnings);

  return {
    checks,
    created: checks.length,
    projectSlug: options.projectSlug,
    removed: 0,
    updated: 0,
    warnings,
  };
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

export async function parseCheckManifestFile(
  rootDir: string,
  filePath: string,
): Promise<ParsedManifestFile> {
  const sourceText = await readFile(filePath, "utf8");
  const relativePath = path.relative(rootDir, filePath);
  const result = parseCheckManifestSource(sourceText, relativePath);
  const group = inferGroupFromPath(relativePath);

  return {
    checks: result.checks.map((check) => ({
      ...check,
      entrypoint: normalizeEntrypoint(rootDir, relativePath, check.entrypoint),
      groupKey: group?.key ?? check.groupKey,
      groupName: group?.name ?? check.groupName,
    })),
    filePath: relativePath,
    warnings: result.warnings,
  };
}

export function parseCheckManifestSource(
  sourceText: string,
  filePath: string,
): ParsedManifestFile {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const context = buildParseContext(sourceFile, filePath);
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

function buildParseContext(sourceFile: ts.SourceFile, filePath: string): ParseContext {
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
