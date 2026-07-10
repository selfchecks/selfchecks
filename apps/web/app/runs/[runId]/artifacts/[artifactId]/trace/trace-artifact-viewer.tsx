"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Download, ExternalLink, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { DetailSidebar } from "@/app/checks/detail-sidebar";

const TRACE_VIEWER_PATH = "/trace-viewer/index.html";

type TraceArtifactViewerProps = {
  accountLabel: string;
  artifactUrl: string;
  downloadUrl: string;
  runId: string;
};

export function TraceArtifactViewer({
  accountLabel,
  artifactUrl,
  downloadUrl,
  runId,
}: TraceArtifactViewerProps) {
  const router = useRouter();
  const [viewerUrl, setViewerUrl] = useState<string>();

  useEffect(() => {
    const traceUrl = new URL(artifactUrl, window.location.origin);
    setViewerUrl(`${TRACE_VIEWER_PATH}?trace=${encodeURIComponent(traceUrl.href)}`);
  }, [artifactUrl]);

  function goBack() {
    if (window.history.length > 1) {
      router.back();
      return;
    }

    router.push("/");
  }

  return (
    <main className="min-h-screen bg-[#0d1117] text-slate-200">
      <DetailSidebar accountLabel={accountLabel} />

      <div className="min-h-screen xl:pl-72">
        <header className="sticky top-0 z-30 border-b border-slate-800 bg-[#12171f]/95 backdrop-blur">
          <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button
                aria-label="Back"
                className="flex h-9 w-9 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                onClick={goBack}
                type="button"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div className="min-w-0">
                <h1 className="truncate text-sm font-semibold text-slate-100">
                  Trace viewer
                </h1>
                <div className="truncate text-xs text-slate-500" title={runId}>
                  Run {runId}
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {viewerUrl ? (
                <a
                  aria-label="Open trace viewer in new tab"
                  className="flex h-9 w-9 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                  href={viewerUrl}
                  rel="noreferrer"
                  target="_blank"
                  title="Open in new tab"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              ) : null}
              <a
                aria-label="Download trace"
                className="flex h-9 w-9 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                download
                href={downloadUrl}
                title="Download"
              >
                <Download className="h-4 w-4" />
              </a>
            </div>
          </div>
        </header>

        <section className="h-[calc(100vh-4rem)] min-h-[36rem] bg-[#1f1f1f]">
          {viewerUrl ? (
            <iframe
              allow="clipboard-read; clipboard-write; local-network"
              className="h-full w-full border-0"
              src={viewerUrl}
              title="Playwright trace viewer"
            />
          ) : (
            <div className="flex h-full items-center justify-center gap-3 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading trace viewer
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
