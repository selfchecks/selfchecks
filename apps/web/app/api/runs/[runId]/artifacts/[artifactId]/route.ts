import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

import { NextResponse } from "next/server";

import { getArtifactFileName } from "@/lib/artifact-names";
import { prisma } from "@/lib/prisma";
import { verifyTraceAccessToken } from "@/lib/trace-access";

export const runtime = "nodejs";

const TRACE_VIEWER_ORIGIN = "https://trace.playwright.dev";

type RouteContext = {
  params: Promise<{
    artifactId: string;
    runId: string;
  }>;
};

type ArtifactFile = {
  mimeType?: string | null;
  path: string;
  type: string;
};

export function OPTIONS(request: Request) {
  const url = new URL(request.url);

  if (!isTraceViewerRequest(url)) {
    return new Response(null, { status: 204 });
  }

  return new Response(null, {
    headers: buildTraceViewerCorsHeaders(request),
    status: 204,
  });
}

export async function GET(request: Request, context: RouteContext) {
  const { artifactId, runId } = await context.params;
  const url = new URL(request.url);
  const traceViewerRequest = isTraceViewerRequest(url);
  const artifact = await findArtifactFile(runId, artifactId);

  if (!artifact) {
    return createErrorResponse(request, url, "Artifact was not found.", 404);
  }

  if (
    traceViewerRequest &&
    (artifact.type !== "TRACE" ||
      !verifyTraceAccessToken(runId, artifactId, url.searchParams.get("token")))
  ) {
    return createErrorResponse(
      request,
      url,
      "Trace access token is invalid or expired.",
      401,
    );
  }

  const fileStat = await stat(artifact.path).catch(() => undefined);

  if (!fileStat?.isFile()) {
    return createErrorResponse(request, url, "Artifact file was not found.", 404);
  }

  const fileName = getArtifactFileName(artifact);
  const disposition =
    url.searchParams.get("download") === "1" ? "attachment" : "inline";
  const stream = Readable.toWeb(createReadStream(artifact.path));
  const headers = new Headers({
    "Cache-Control": "private, no-store",
    "Content-Disposition": formatContentDisposition(disposition, fileName),
    "Content-Length": String(fileStat.size),
    "Content-Type": artifact.mimeType || inferMimeType(fileName, artifact.type),
  });

  if (traceViewerRequest) {
    appendTraceViewerCorsHeaders(headers, request);
  }

  return new Response(stream as ReadableStream, {
    headers,
  });
}

async function findArtifactFile(
  runId: string,
  artifactId: string,
): Promise<ArtifactFile | undefined> {
  if (artifactId === "log") {
    const run = await prisma.checkRun.findUnique({
      select: {
        logsPath: true,
      },
      where: {
        id: runId,
      },
    });

    return run?.logsPath
      ? {
          mimeType: "text/plain; charset=utf-8",
          path: run.logsPath,
          type: "LOG",
        }
      : undefined;
  }

  const artifact = await prisma.artifact.findFirst({
    select: {
      mimeType: true,
      path: true,
      type: true,
    },
    where: {
      id: artifactId,
      runId,
    },
  });

  return artifact ?? undefined;
}

function formatContentDisposition(
  disposition: "attachment" | "inline",
  fileName: string,
) {
  const fallbackName = fileName.replace(/["\\\r\n]|[^\x20-\x7E]/g, "_");

  return `${disposition}; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(
    fileName,
  )}`;
}

function isTraceViewerRequest(url: URL): boolean {
  return url.searchParams.get("traceViewer") === "1";
}

function createErrorResponse(
  request: Request,
  url: URL,
  error: string,
  status: number,
) {
  const headers = new Headers();

  if (isTraceViewerRequest(url)) {
    appendTraceViewerCorsHeaders(headers, request);
  }

  return NextResponse.json({ error }, { headers, status });
}

function buildTraceViewerCorsHeaders(request: Request): Headers {
  const headers = new Headers({
    "Access-Control-Allow-Headers": "Range, Content-Type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Private-Network": "true",
    "Access-Control-Expose-Headers": "Content-Length, Content-Range",
    Vary: "Origin",
  });
  const origin = request.headers.get("origin");

  if (origin === TRACE_VIEWER_ORIGIN) {
    headers.set("Access-Control-Allow-Origin", origin);
  }

  return headers;
}

function appendTraceViewerCorsHeaders(headers: Headers, request: Request) {
  buildTraceViewerCorsHeaders(request).forEach((value, key) => {
    headers.set(key, value);
  });
}

function inferMimeType(fileName: string, type: string): string {
  const extension = path.extname(fileName).toLowerCase();

  if (type === "SCREENSHOT" || [".jpg", ".jpeg", ".png", ".webp"].includes(extension)) {
    return extension === ".jpg" || extension === ".jpeg"
      ? "image/jpeg"
      : `image/${extension.slice(1)}`;
  }

  if (type === "VIDEO" || [".mp4", ".webm"].includes(extension)) {
    return extension === ".mp4" ? "video/mp4" : "video/webm";
  }

  if (type === "TRACE" || extension === ".zip") {
    return "application/zip";
  }

  if (type === "JSON" || extension === ".json") {
    return "application/json";
  }

  return "application/octet-stream";
}
