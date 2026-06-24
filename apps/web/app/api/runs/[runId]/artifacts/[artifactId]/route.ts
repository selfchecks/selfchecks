import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

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

export async function GET(request: Request, context: RouteContext) {
  const { artifactId, runId } = await context.params;
  const url = new URL(request.url);
  const artifact = await findArtifactFile(runId, artifactId);

  if (!artifact) {
    return NextResponse.json({ error: "Artifact was not found." }, { status: 404 });
  }

  const fileStat = await stat(artifact.path).catch(() => undefined);

  if (!fileStat?.isFile()) {
    return NextResponse.json(
      { error: "Artifact file was not found." },
      { status: 404 },
    );
  }

  const fileName = path.basename(artifact.path);
  const disposition =
    url.searchParams.get("download") === "1" ? "attachment" : "inline";
  const stream = Readable.toWeb(createReadStream(artifact.path));

  return new Response(stream as ReadableStream, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": formatContentDisposition(disposition, fileName),
      "Content-Length": String(fileStat.size),
      "Content-Type": artifact.mimeType || inferMimeType(fileName, artifact.type),
    },
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
