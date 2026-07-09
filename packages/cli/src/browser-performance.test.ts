import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  collectBrowserPerformanceFromDirectory,
  collectBrowserPerformanceFromTrace,
} from "./browser-performance.js";

const tempDirs: string[] = [];

describe("browser performance collection", () => {
  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map((directory) =>
        rm(directory, {
          force: true,
          recursive: true,
        }),
      ),
    );
  });

  it("extracts browser errors and loading timings from Playwright trace archives", async () => {
    const rootDir = await createTempDirectory();
    const tracePath = path.join(rootDir, "trace.zip");
    const trace = [
      JSON.stringify({
        callId: "call@1",
        class: "Frame",
        method: "goto",
        startTime: 100,
        type: "before",
      }),
      JSON.stringify({
        callId: "call@1",
        endTime: 650,
        type: "after",
      }),
      JSON.stringify({
        messageType: "error",
        text: "Application failed",
        type: "console",
      }),
      JSON.stringify({
        class: "BrowserContext",
        method: "pageError",
        params: {
          error: {
            message: "Uncaught TypeError",
          },
        },
        type: "event",
      }),
    ].join("\n");
    const network = [
      createResourceSnapshot({
        mimeType: "text/html",
        status: 200,
        url: "https://example.test/",
        wait: 137,
      }),
      createResourceSnapshot({
        mimeType: "application/javascript",
        status: 500,
        url: "https://example.test/app.js",
        wait: 20,
      }),
      createResourceSnapshot({
        mimeType: "text/html",
        status: 404,
        url: "https://example.test/missing",
        wait: 12,
      }),
      createResourceSnapshot({
        failureText: "net::ERR_FAILED",
        mimeType: "image/png",
        status: -1,
        url: "https://example.test/broken.png",
        wait: -1,
      }),
    ].join("\n");

    await writeFile(
      tracePath,
      createStoredZip({
        "trace.network": network,
        "trace.trace": trace,
      }),
    );

    await expect(collectBrowserPerformanceFromTrace(tracePath)).resolves.toEqual({
      errors: {
        consoleErrors: 1,
        documentErrors: 1,
        networkErrors: 3,
        scriptErrors: 1,
      },
      timings: {
        loadedMs: 550,
        ttfbMs: 137,
      },
    });
  });

  it("extracts browser web vitals from runtime collector files", async () => {
    const rootDir = await createTempDirectory();

    await writeFile(
      path.join(rootDir, "metrics.json"),
      JSON.stringify({
        errors: {
          consoleErrors: 2,
          networkErrors: 1,
          scriptErrors: 1,
        },
        timings: {
          dclMs: 80,
          fcpMs: 120,
          lcpMs: 450,
          loadedMs: 500,
          tbtMs: 70,
          ttfbMs: 42,
        },
      }),
    );

    await expect(collectBrowserPerformanceFromDirectory(rootDir)).resolves.toEqual({
      errors: {
        consoleErrors: 2,
        documentErrors: 0,
        networkErrors: 1,
        scriptErrors: 1,
      },
      timings: {
        dclMs: 80,
        fcpMs: 120,
        lcpMs: 450,
        loadedMs: 500,
        tbtMs: 70,
        ttfbMs: 42,
      },
    });
  });
});

async function createTempDirectory() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "selfchecks-browser-perf-"));

  tempDirs.push(directory);
  return directory;
}

function createResourceSnapshot({
  failureText,
  mimeType,
  status,
  url,
  wait,
}: {
  failureText?: string;
  mimeType: string;
  status: number;
  url: string;
  wait: number;
}) {
  return JSON.stringify({
    snapshot: {
      pageref: "page@1",
      request: {
        method: "GET",
        url,
      },
      response: {
        ...(failureText ? { _failureText: failureText } : {}),
        content: {
          mimeType,
        },
        status,
      },
      timings: {
        receive: 0,
        send: 0,
        wait,
      },
    },
    type: "resource-snapshot",
  });
}

function createStoredZip(entries: Record<string, string>) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  let entryCount = 0;

  for (const [entryName, content] of Object.entries(entries)) {
    const name = Buffer.from(entryName);
    const data = Buffer.from(content);
    const localHeader = Buffer.alloc(30);

    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt32LE(0, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, name, data);

    const centralHeader = Buffer.alloc(46);

    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt32LE(0, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, name);

    offset += localHeader.length + name.length + data.length;
    entryCount += 1;
  }

  const centralDirectoryOffset = offset;
  const centralDirectory = Buffer.concat(centralParts);
  const endOfCentralDirectory = Buffer.alloc(22);

  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0);
  endOfCentralDirectory.writeUInt16LE(entryCount, 8);
  endOfCentralDirectory.writeUInt16LE(entryCount, 10);
  endOfCentralDirectory.writeUInt32LE(centralDirectory.length, 12);
  endOfCentralDirectory.writeUInt32LE(centralDirectoryOffset, 16);

  return Buffer.concat([...localParts, centralDirectory, endOfCentralDirectory]);
}
