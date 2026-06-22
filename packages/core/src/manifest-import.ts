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

  return {
    ...result,
    filePath: relativePath,
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
  const checks: CheckDefinition[] = [];
  const warnings: string[] = [];

  function visit(node: ts.Node): void {
    if (ts.isNewExpression(node)) {
      const parsedCheck = parseCheckNewExpression(node, filePath);

      if (parsedCheck) {
        const validation = checkDefinitionSchema.safeParse(parsedCheck.check);

        if (validation.success) {
          checks.push(validation.data);
        } else {
          warnings.push(
            `${filePath}: skipped ${parsedCheck.constructName} because ${validation.error.issues
              .map((issue) => issue.message)
              .join("; ")}`,
          );
        }
      }
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

function parseCheckNewExpression(
  node: ts.NewExpression,
  filePath: string,
):
  | {
      check: Partial<CheckDefinition>;
      constructName: "ApiCheck" | "BrowserCheck";
    }
  | undefined {
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

  const name = getStringProperty(config, "name", filePath);
  const key =
    keyFromArg ??
    getStringProperty(config, "key", filePath) ??
    getStringProperty(config, "id", filePath) ??
    getStringProperty(config, "logicalId", filePath) ??
    (name ? slugify(name) : undefined);
  const check: Partial<CheckDefinition> = {
    enabled:
      getBooleanProperty(config, "enabled") ??
      getBooleanProperty(config, "activated") ??
      true,
    key,
    name,
    tags: getStringArrayProperty(config, "tags", filePath) ?? [],
    type,
  };

  if (type === "browser") {
    check.entrypoint =
      getStringProperty(config, "entrypoint", filePath) ??
      getCodeEntrypoint(config, filePath);
  } else {
    check.request = getApiRequest(config, filePath);
  }

  return {
    check,
    constructName,
  };
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
    const value = extractStringValue(element, filePath);

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
): ApiRequest | undefined {
  const requestProperty = getPropertyAssignment(objectLiteral, "request");

  if (!requestProperty || !ts.isObjectLiteralExpression(requestProperty.initializer)) {
    return undefined;
  }

  const request = requestProperty.initializer;
  const method = getStringProperty(request, "method", filePath);
  const url = getStringProperty(request, "url", filePath);

  if (!method || !url) {
    return undefined;
  }

  return {
    assertions: [],
    headers: getRecordProperty(request, "headers", filePath) ?? {},
    method,
    url,
  };
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

function extractStringValue(
  expression: ts.Expression,
  filePath: string,
): string | undefined {
  if (ts.isStringLiteralLike(expression)) {
    return expression.text;
  }

  if (ts.isTemplateExpression(expression) && expression.templateSpans.length === 0) {
    return expression.head.text;
  }

  if (ts.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.text;
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

function slugify(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "check"
  );
}
