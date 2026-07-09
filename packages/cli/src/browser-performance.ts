import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { inflateRawSync } from "node:zlib";

export type BrowserPerformanceMetrics = {
  errors?: {
    consoleErrors: number;
    documentErrors: number;
    networkErrors: number;
    scriptErrors: number;
  };
  timings?: {
    dclMs?: number;
    fcpMs?: number;
    lcpMs?: number;
    loadedMs?: number;
    tbtMs?: number;
    ttfbMs?: number;
  };
};

type BrowserTraceArtifact = {
  path: string;
  type: string;
};

type BrowserPerformanceAccumulator = {
  consoleErrors: number;
  documentErrors: number;
  dclValues: number[];
  fcpValues: number[];
  lcpValues: number[];
  loadedValues: number[];
  networkErrors: number;
  scriptErrors: number;
  tbtValues: number[];
  ttfbValues: number[];
};

type ZipEntry = {
  compressedSize: number;
  compressionMethod: number;
  localHeaderOffset: number;
  name: string;
  uncompressedSize: number;
};

const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const STORED_COMPRESSION_METHOD = 0;
const DEFLATE_COMPRESSION_METHOD = 8;
const ZIP64_SIZE_PLACEHOLDER = 0xffffffff;
const MAX_EOCD_SEARCH_BYTES = 65_557;

export const BROWSER_PERFORMANCE_COLLECTOR_SCRIPT = String.raw`
(() => {
  const fs = require("node:fs");
  const path = require("node:path");
  const Module = require("node:module");
  const originalLoad = Module._load;
  const wrappedTests = new WeakMap();

  Module._load = function selfchecksLoad(request, parent, isMain) {
    const mod = originalLoad.apply(this, arguments);

    if (
      (request !== "@playwright/test" && request !== "playwright/test") ||
      !mod?.test?.extend
    ) {
      return mod;
    }

    const cached = wrappedTests.get(mod.test);

    if (cached) {
      return { ...mod, test: cached };
    }

    const test = mod.test.extend({
      _selfchecksMetrics: [
        async ({}, use, testInfo) => {
          const metrics = createMetrics();

          await use(metrics);
          await writeMetrics(metrics, testInfo);
        },
        { auto: true },
      ],
      context: async ({ context, _selfchecksMetrics }, use) => {
        await installContext(context, _selfchecksMetrics);
        await use(context);
        await collectContext(context, _selfchecksMetrics);
      },
      page: async ({ page, _selfchecksMetrics }, use) => {
        await installPage(page, _selfchecksMetrics);
        await use(page);
        await collectPage(page, _selfchecksMetrics);
      },
    });

    wrappedTests.set(mod.test, test);
    return { ...mod, test };
  };

  function createMetrics() {
    return {
      attachedContexts: new WeakSet(),
      attachedPages: new WeakSet(),
      collectedPages: new WeakSet(),
      errors: {
        consoleErrors: 0,
        documentErrors: 0,
        networkErrors: 0,
        scriptErrors: 0,
      },
      timings: {
        dclMs: [],
        fcpMs: [],
        lcpMs: [],
        loadedMs: [],
        tbtMs: [],
        ttfbMs: [],
      },
    };
  }

  async function installContext(context, metrics) {
    if (!context || metrics.attachedContexts.has(context)) {
      return;
    }

    metrics.attachedContexts.add(context);
    await context.addInitScript(pageCollectorScript).catch(() => {});
    context.on("page", (page) => {
      void installPage(page, metrics);
    });

    for (const page of context.pages()) {
      await installPage(page, metrics);
    }
  }

  async function collectContext(context, metrics) {
    if (!context) {
      return;
    }

    for (const page of context.pages()) {
      await collectPage(page, metrics);
    }
  }

  async function installPage(page, metrics) {
    if (!page || metrics.attachedPages.has(page)) {
      return;
    }

    metrics.attachedPages.add(page);
    page.on("console", (message) => {
      if (message.type() === "error") {
        metrics.errors.consoleErrors += 1;
      }
    });
    page.on("pageerror", () => {
      metrics.errors.scriptErrors += 1;
    });
    page.on("requestfailed", (request) => {
      recordNetworkError(metrics, request);
    });
    page.on("response", (response) => {
      const request = response.request();
      const status = response.status();

      if (status >= 400) {
        recordNetworkError(metrics, request);
      }

      if (isDocumentRequest(request)) {
        const timing = readRequestTiming(request);
        const ttfbMs =
          typeof timing?.responseStart === "number" &&
          typeof timing?.requestStart === "number"
            ? timing.responseStart - timing.requestStart
            : undefined;

        pushTiming(metrics, "ttfbMs", ttfbMs);
      }
    });
  }

  async function collectPage(page, metrics) {
    if (!page || metrics.collectedPages.has(page) || page.isClosed()) {
      return;
    }

    metrics.collectedPages.add(page);

    const pageTimings = await page
      .evaluate(() => window.__selfchecksPerformance?.read?.())
      .catch(() => undefined);

    if (!pageTimings || typeof pageTimings !== "object") {
      return;
    }

    pushTiming(metrics, "dclMs", pageTimings.dclMs);
    pushTiming(metrics, "fcpMs", pageTimings.fcpMs);
    pushTiming(metrics, "lcpMs", pageTimings.lcpMs);
    pushTiming(metrics, "loadedMs", pageTimings.loadedMs);
    pushTiming(metrics, "tbtMs", pageTimings.tbtMs);
    pushTiming(metrics, "ttfbMs", pageTimings.ttfbMs);
  }

  function recordNetworkError(metrics, request) {
    if (!request || !isHttpUrl(request.url())) {
      return;
    }

    metrics.errors.networkErrors += 1;

    if (isDocumentRequest(request)) {
      metrics.errors.documentErrors += 1;
    }
  }

  function readRequestTiming(request) {
    try {
      return request.timing();
    } catch {
      return undefined;
    }
  }

  function isDocumentRequest(request) {
    try {
      return request.resourceType() === "document" || request.isNavigationRequest();
    } catch {
      return false;
    }
  }

  function pushTiming(metrics, key, value) {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      metrics.timings[key].push(value);
    }
  }

  async function writeMetrics(metrics, testInfo) {
    const performance = summarizeMetrics(metrics);

    if (!performance) {
      return;
    }

    const directory = process.env.SELFCHECKS_BROWSER_PERFORMANCE_DIR;

    if (!directory) {
      return;
    }

    const titlePath =
      typeof testInfo.titlePath === "function"
        ? testInfo.titlePath()
        : Array.isArray(testInfo.titlePath)
          ? testInfo.titlePath
          : [testInfo.title || "browser-check"];
    const title = titlePath.join("-");
    const fileName = [
      Date.now(),
      process.pid,
      testInfo.workerIndex ?? 0,
      sanitizeFilePart(title),
    ].join("-") + ".json";

    await fs.promises.mkdir(directory, { recursive: true });
    await fs.promises.writeFile(
      path.join(directory, fileName),
      JSON.stringify(performance),
    );
  }

  function summarizeMetrics(metrics) {
    const errors = metrics.errors;
    const timings = {
      dclMs: max(metrics.timings.dclMs),
      fcpMs: first(metrics.timings.fcpMs),
      lcpMs: max(metrics.timings.lcpMs),
      loadedMs: max(metrics.timings.loadedMs),
      tbtMs: max(metrics.timings.tbtMs),
      ttfbMs: max(metrics.timings.ttfbMs),
    };
    const hasErrors = Object.values(errors).some((value) => value > 0);
    const hasTimings = Object.values(timings).some(
      (value) => typeof value === "number",
    );

    if (!hasErrors && !hasTimings) {
      return undefined;
    }

    return {
      ...(hasErrors ? { errors } : {}),
      ...(hasTimings ? { timings: compact(timings) } : {}),
    };
  }

  function first(values) {
    return values.length > 0 ? values[0] : undefined;
  }

  function max(values) {
    return values.length > 0 ? Math.max(...values) : undefined;
  }

  function compact(value) {
    return Object.fromEntries(
      Object.entries(value).filter(([, item]) => typeof item === "number"),
    );
  }

  function sanitizeFilePart(value) {
    return String(value).replace(/[^a-z0-9_.-]+/gi, "-").slice(0, 80) || "test";
  }

  function isHttpUrl(value) {
    return /^https?:\/\//i.test(value);
  }

  function pageCollectorScript() {
    const state = {
      dclMs: undefined,
      fcpMs: undefined,
      lcpMs: undefined,
      loadedMs: undefined,
      tbtMs: 0,
    };

    const nav = () => performance.getEntriesByType("navigation")[0];
    const markLoaded = () => {
      state.loadedMs = performance.now();
    };
    const markDcl = () => {
      state.dclMs = performance.now();
    };

    if (document.readyState === "complete") {
      markLoaded();
      markDcl();
    } else {
      if (document.readyState !== "loading") {
        markDcl();
      }

      document.addEventListener("DOMContentLoaded", markDcl, { once: true });
      window.addEventListener("load", markLoaded, { once: true });
    }

    observePerformance("paint", (entry) => {
      if (entry.name === "first-contentful-paint" && state.fcpMs === undefined) {
        state.fcpMs = entry.startTime;
      }
    });
    observePerformance("largest-contentful-paint", (entry) => {
      state.lcpMs = entry.startTime;
    });
    observePerformance("longtask", (entry) => {
      state.tbtMs += Math.max(0, entry.duration - 50);
    });

    window.__selfchecksPerformance = {
      read() {
        const navigation = nav();

        return {
          dclMs:
            readNavigationMetric(navigation, "domContentLoadedEventStart") ??
            state.dclMs,
          fcpMs: state.fcpMs,
          lcpMs: state.lcpMs,
          loadedMs: readNavigationMetric(navigation, "loadEventStart") ?? state.loadedMs,
          tbtMs: state.tbtMs,
          ttfbMs: readNavigationMetric(navigation, "responseStart"),
        };
      },
    };

    function observePerformance(type, onEntry) {
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            onEntry(entry);
          }
        });

        observer.observe({ type, buffered: true });
      } catch {
      }
    }

    function readNavigationMetric(navigation, key) {
      const value = navigation?.[key];

      return typeof value === "number" && Number.isFinite(value) && value >= 0
        ? value
        : undefined;
    }
  }
})();
`;

export async function collectBrowserPerformanceFromDirectory(
  directory: string,
): Promise<BrowserPerformanceMetrics | undefined> {
  const fileNames = await readdir(directory).catch(() => []);
  const accumulator = createAccumulator();

  for (const fileName of fileNames) {
    if (!fileName.endsWith(".json")) {
      continue;
    }

    const filePath = path.join(directory, fileName);
    const performance = await readPerformanceJson(filePath);

    if (performance) {
      mergeAccumulator(accumulator, performance);
    }
  }

  return buildPerformance(accumulator);
}

async function readPerformanceJson(
  filePath: string,
): Promise<BrowserPerformanceMetrics | undefined> {
  const content = await readFile(filePath, "utf8").catch(() => undefined);

  if (!content) {
    return undefined;
  }

  try {
    return normalizePerformanceMetrics(JSON.parse(content));
  } catch {
    return undefined;
  }
}

function normalizePerformanceMetrics(
  value: unknown,
): BrowserPerformanceMetrics | undefined {
  const root = asRecord(value);
  const errors = asRecord(root.errors);
  const timings = asRecord(root.timings);
  const errorCounts = {
    consoleErrors: readFiniteNumber(errors, "consoleErrors") ?? 0,
    documentErrors: readFiniteNumber(errors, "documentErrors") ?? 0,
    networkErrors: readFiniteNumber(errors, "networkErrors") ?? 0,
    scriptErrors: readFiniteNumber(errors, "scriptErrors") ?? 0,
  };
  const timingValues = {
    dclMs: readFiniteNumber(timings, "dclMs"),
    fcpMs: readFiniteNumber(timings, "fcpMs"),
    lcpMs: readFiniteNumber(timings, "lcpMs"),
    loadedMs: readFiniteNumber(timings, "loadedMs"),
    tbtMs: readFiniteNumber(timings, "tbtMs"),
    ttfbMs: readFiniteNumber(timings, "ttfbMs"),
  };
  const hasErrors = Object.values(errorCounts).some((count) => count > 0);
  const hasTimings = Object.values(timingValues).some(
    (timing) => typeof timing === "number",
  );

  if (!hasErrors && !hasTimings) {
    return undefined;
  }

  return {
    ...(hasErrors ? { errors: errorCounts } : {}),
    ...(hasTimings ? { timings: timingValues } : {}),
  };
}

export async function collectBrowserPerformanceFromArtifacts(
  artifacts: BrowserTraceArtifact[],
): Promise<BrowserPerformanceMetrics | undefined> {
  const traceArtifacts = artifacts.filter((artifact) => isTraceZipArtifact(artifact));

  if (traceArtifacts.length === 0) {
    return undefined;
  }

  const accumulator = createAccumulator();

  for (const artifact of traceArtifacts) {
    const performance = await collectBrowserPerformanceFromTrace(artifact.path).catch(
      (error) => {
        console.warn(
          `Unable to collect browser performance from ${artifact.path}.`,
          error,
        );
        return undefined;
      },
    );

    if (performance) {
      mergeAccumulator(accumulator, performance);
    }
  }

  return buildPerformance(accumulator);
}

export async function collectBrowserPerformanceFromTrace(
  tracePath: string,
): Promise<BrowserPerformanceMetrics | undefined> {
  const archive = await readFile(tracePath);
  const entries = readZipEntries(archive);
  const traceEntries = [...entries.keys()].filter((name) => name.endsWith(".trace"));
  const networkEntries = [...entries.keys()].filter((name) =>
    name.endsWith(".network"),
  );
  const accumulator = createAccumulator();

  for (const entryName of traceEntries) {
    parseTraceEvents(readZipTextEntry(archive, entries.get(entryName)), accumulator);
  }

  for (const entryName of networkEntries) {
    parseNetworkEvents(readZipTextEntry(archive, entries.get(entryName)), accumulator);
  }

  return buildPerformance(accumulator);
}

function createAccumulator(): BrowserPerformanceAccumulator {
  return {
    consoleErrors: 0,
    documentErrors: 0,
    dclValues: [],
    fcpValues: [],
    lcpValues: [],
    loadedValues: [],
    networkErrors: 0,
    scriptErrors: 0,
    tbtValues: [],
    ttfbValues: [],
  };
}

function mergeAccumulator(
  accumulator: BrowserPerformanceAccumulator,
  performance: BrowserPerformanceMetrics,
) {
  accumulator.consoleErrors += performance.errors?.consoleErrors ?? 0;
  accumulator.documentErrors += performance.errors?.documentErrors ?? 0;
  accumulator.networkErrors += performance.errors?.networkErrors ?? 0;
  accumulator.scriptErrors += performance.errors?.scriptErrors ?? 0;

  if (typeof performance.timings?.dclMs === "number") {
    accumulator.dclValues.push(performance.timings.dclMs);
  }

  if (typeof performance.timings?.fcpMs === "number") {
    accumulator.fcpValues.push(performance.timings.fcpMs);
  }

  if (typeof performance.timings?.lcpMs === "number") {
    accumulator.lcpValues.push(performance.timings.lcpMs);
  }

  if (typeof performance.timings?.loadedMs === "number") {
    accumulator.loadedValues.push(performance.timings.loadedMs);
  }

  if (typeof performance.timings?.tbtMs === "number") {
    accumulator.tbtValues.push(performance.timings.tbtMs);
  }

  if (typeof performance.timings?.ttfbMs === "number") {
    accumulator.ttfbValues.push(performance.timings.ttfbMs);
  }
}

function buildPerformance(
  accumulator: BrowserPerformanceAccumulator,
): BrowserPerformanceMetrics | undefined {
  const hasErrors =
    accumulator.consoleErrors > 0 ||
    accumulator.documentErrors > 0 ||
    accumulator.networkErrors > 0 ||
    accumulator.scriptErrors > 0;
  const dclMs = maxMetric(accumulator.dclValues);
  const fcpMs = firstMetric(accumulator.fcpValues);
  const lcpMs = maxMetric(accumulator.lcpValues);
  const loadedMs = maxMetric(accumulator.loadedValues);
  const tbtMs = maxMetric(accumulator.tbtValues);
  const ttfbMs = maxMetric(accumulator.ttfbValues);
  const hasTimings = [dclMs, fcpMs, lcpMs, loadedMs, tbtMs, ttfbMs].some(
    (value) => typeof value === "number",
  );

  if (!hasErrors && !hasTimings) {
    return undefined;
  }

  return {
    ...(hasErrors
      ? {
          errors: {
            consoleErrors: accumulator.consoleErrors,
            documentErrors: accumulator.documentErrors,
            networkErrors: accumulator.networkErrors,
            scriptErrors: accumulator.scriptErrors,
          },
        }
      : {}),
    ...(hasTimings
      ? {
          timings: {
            ...(typeof dclMs === "number" ? { dclMs } : {}),
            ...(typeof fcpMs === "number" ? { fcpMs } : {}),
            ...(typeof lcpMs === "number" ? { lcpMs } : {}),
            ...(typeof loadedMs === "number" ? { loadedMs } : {}),
            ...(typeof tbtMs === "number" ? { tbtMs } : {}),
            ...(typeof ttfbMs === "number" ? { ttfbMs } : {}),
          },
        }
      : {}),
  };
}

function parseTraceEvents(
  traceText: string | undefined,
  accumulator: BrowserPerformanceAccumulator,
) {
  if (!traceText) {
    return;
  }

  const actions = new Map<
    string,
    { className?: string; method?: string; startTime?: number }
  >();

  for (const event of parseJsonLines(traceText)) {
    const type = readString(event, "type");

    if (type === "console" && readString(event, "messageType") === "error") {
      accumulator.consoleErrors += 1;
      continue;
    }

    if (
      type === "event" &&
      readString(event, "class") === "BrowserContext" &&
      readString(event, "method") === "pageError"
    ) {
      accumulator.scriptErrors += 1;
      continue;
    }

    const callId = readString(event, "callId");

    if (!callId) {
      continue;
    }

    if (type === "before") {
      actions.set(callId, {
        className: readString(event, "class"),
        method: readString(event, "method"),
        startTime: readNumber(event, "startTime"),
      });
      continue;
    }

    if (type === "after") {
      const action = actions.get(callId);
      const endTime = readNumber(event, "endTime");

      if (
        action &&
        typeof action.startTime === "number" &&
        typeof endTime === "number" &&
        isNavigationAction(action)
      ) {
        accumulator.loadedValues.push(Math.max(0, endTime - action.startTime));
      }
    }
  }
}

function parseNetworkEvents(
  networkText: string | undefined,
  accumulator: BrowserPerformanceAccumulator,
) {
  if (!networkText) {
    return;
  }

  for (const event of parseJsonLines(networkText)) {
    if (readString(event, "type") !== "resource-snapshot") {
      continue;
    }

    const snapshot = readRecord(event, "snapshot");
    const request = readRecord(snapshot, "request");
    const response = readRecord(snapshot, "response");
    const timings = readRecord(snapshot, "timings");
    const url = readString(request, "url");

    if (!url || !isHttpUrl(url)) {
      continue;
    }

    const status = readNumber(response, "status");
    const hasFailure = Boolean(readString(response, "_failureText"));
    const isErrorStatus = typeof status === "number" && status >= 400;

    if (hasFailure || isErrorStatus) {
      accumulator.networkErrors += 1;

      if (isDocumentResource(snapshot)) {
        accumulator.documentErrors += 1;
      }
    }

    const wait = readNumber(timings, "wait");

    if (typeof wait === "number" && wait >= 0 && isDocumentResource(snapshot)) {
      accumulator.ttfbValues.push(wait);
    }
  }
}

function parseJsonLines(text: string): Record<string, unknown>[] {
  const events: Record<string, unknown>[] = [];

  for (const line of text.split("\n")) {
    const trimmed = line.trim();

    if (!trimmed) {
      continue;
    }

    try {
      const parsed = JSON.parse(trimmed);

      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        events.push(parsed as Record<string, unknown>);
      }
    } catch {
      // Ignore malformed lines from partial traces.
    }
  }

  return events;
}

function isNavigationAction(action: {
  className?: string;
  method?: string;
  startTime?: number;
}) {
  return (
    (action.className === "Frame" || action.className === "Page") &&
    (action.method === "goto" ||
      action.method === "reload" ||
      action.method === "setContent")
  );
}

function isDocumentResource(snapshot: Record<string, unknown>) {
  const request = readRecord(snapshot, "request");
  const response = readRecord(snapshot, "response");
  const content = readRecord(response, "content");
  const mimeType = readString(content, "mimeType")?.toLowerCase();
  const url = readString(request, "url");

  return (
    typeof readString(snapshot, "pageref") === "string" &&
    (mimeType?.includes("text/html") ||
      mimeType?.includes("application/xhtml") ||
      ((mimeType === undefined || mimeType === "x-unknown") &&
        typeof url === "string" &&
        looksLikeDocumentUrl(url)))
  );
}

function looksLikeDocumentUrl(value: string) {
  try {
    const url = new URL(value);
    const lastSegment = url.pathname.split("/").pop() ?? "";

    return !/\.(?:avif|css|gif|ico|jpe?g|js|json|map|mjs|mp4|png|svg|webm|webp|woff2?)$/i.test(
      lastSegment,
    );
  } catch {
    return false;
  }
}

function isTraceZipArtifact(artifact: BrowserTraceArtifact) {
  const path = artifact.path.toLowerCase();

  return artifact.type === "TRACE" || (path.endsWith(".zip") && path.includes("trace"));
}

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function readZipEntries(archive: Buffer): Map<string, ZipEntry> {
  const endOfCentralDirectoryOffset = findEndOfCentralDirectoryOffset(archive);
  const centralDirectorySize = archive.readUInt32LE(endOfCentralDirectoryOffset + 12);
  const centralDirectoryOffset = archive.readUInt32LE(endOfCentralDirectoryOffset + 16);
  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;
  const entries = new Map<string, ZipEntry>();
  let offset = centralDirectoryOffset;

  while (offset < centralDirectoryEnd) {
    if (archive.readUInt32LE(offset) !== CENTRAL_DIRECTORY_SIGNATURE) {
      throw new Error("Invalid ZIP central directory entry.");
    }

    const compressionMethod = archive.readUInt16LE(offset + 10);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const uncompressedSize = archive.readUInt32LE(offset + 24);
    const fileNameLength = archive.readUInt16LE(offset + 28);
    const extraFieldLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const localHeaderOffset = archive.readUInt32LE(offset + 42);

    if (
      compressedSize === ZIP64_SIZE_PLACEHOLDER ||
      uncompressedSize === ZIP64_SIZE_PLACEHOLDER ||
      localHeaderOffset === ZIP64_SIZE_PLACEHOLDER
    ) {
      throw new Error("ZIP64 trace archives are not supported.");
    }

    const nameStart = offset + 46;
    const nameEnd = nameStart + fileNameLength;
    const name = archive.toString("utf8", nameStart, nameEnd);

    entries.set(name, {
      compressedSize,
      compressionMethod,
      localHeaderOffset,
      name,
      uncompressedSize,
    });
    offset = nameEnd + extraFieldLength + commentLength;
  }

  return entries;
}

function readZipTextEntry(
  archive: Buffer,
  entry: ZipEntry | undefined,
): string | undefined {
  if (!entry) {
    return undefined;
  }

  const buffer = readZipEntry(archive, entry);

  return buffer.toString("utf8");
}

function readZipEntry(archive: Buffer, entry: ZipEntry): Buffer {
  const offset = entry.localHeaderOffset;

  if (archive.readUInt32LE(offset) !== LOCAL_FILE_HEADER_SIGNATURE) {
    throw new Error(`Invalid ZIP local file header for ${entry.name}.`);
  }

  const fileNameLength = archive.readUInt16LE(offset + 26);
  const extraFieldLength = archive.readUInt16LE(offset + 28);
  const dataStart = offset + 30 + fileNameLength + extraFieldLength;
  const dataEnd = dataStart + entry.compressedSize;
  const compressed = archive.subarray(dataStart, dataEnd);

  if (entry.compressionMethod === STORED_COMPRESSION_METHOD) {
    return compressed;
  }

  if (entry.compressionMethod === DEFLATE_COMPRESSION_METHOD) {
    return inflateRawSync(compressed);
  }

  throw new Error(`Unsupported ZIP compression method ${entry.compressionMethod}.`);
}

function findEndOfCentralDirectoryOffset(archive: Buffer): number {
  const searchStart = Math.max(0, archive.length - MAX_EOCD_SEARCH_BYTES);

  for (let offset = archive.length - 22; offset >= searchStart; offset -= 1) {
    if (archive.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      return offset;
    }
  }

  throw new Error("Invalid ZIP archive: end of central directory was not found.");
}

function readRecord(
  source: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const value = source[key];

  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];

  return typeof value === "string" ? value : undefined;
}

function readNumber(source: Record<string, unknown>, key: string): number | undefined {
  const value = source[key];

  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readFiniteNumber(
  source: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = source[key];

  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function firstMetric(values: number[]): number | undefined {
  return values.length > 0 ? values[0] : undefined;
}

function maxMetric(values: number[]): number | undefined {
  return values.length > 0 ? Math.max(...values) : undefined;
}
