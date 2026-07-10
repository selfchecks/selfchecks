"use client";

/* eslint-disable @next/next/no-img-element */

import { Download, Play, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { DashboardRunArtifact } from "@/lib/dashboard-types";

type ArtifactMediaPreviewProps = {
  artifact: DashboardRunArtifact;
  mediaType: "screenshot" | "video";
};

export function ArtifactMediaPreview({
  artifact,
  mediaType,
}: ArtifactMediaPreviewProps) {
  const [isOpen, setIsOpen] = useState(false);
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const typeLabel = mediaType === "video" ? "Video" : "Screenshot";

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  return (
    <>
      <article className="group min-w-0">
        <button
          aria-haspopup="dialog"
          aria-label={`Open ${mediaType} ${artifact.name}`}
          className="relative block aspect-video w-full overflow-hidden rounded-md border border-slate-700 bg-[#0b0f14] text-left outline-none transition hover:border-slate-500 focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/40"
          onClick={() => setIsOpen(true)}
          type="button"
        >
          {mediaType === "screenshot" ? (
            <img
              alt=""
              className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.02]"
              src={artifact.viewUrl}
            />
          ) : (
            <>
              <video
                aria-hidden="true"
                className="h-full w-full object-cover"
                muted
                playsInline
                preload="metadata"
                src={`${artifact.viewUrl}#t=0.1`}
              />
              <span className="absolute inset-0 flex items-center justify-center bg-black/20 transition group-hover:bg-black/10">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/70 text-white shadow-lg backdrop-blur-sm">
                  <Play className="ml-0.5 h-5 w-5 fill-current" />
                </span>
              </span>
            </>
          )}
        </button>

        <div className="mt-2 flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <div
              className="truncate text-sm font-medium text-slate-200"
              title={artifact.name}
            >
              {artifact.name}
            </div>
            <div className="mt-0.5 text-xs text-slate-500">
              {typeLabel}
              {artifact.size !== "-" ? ` · ${artifact.size}` : ""}
            </div>
          </div>
          <a
            aria-label={`Download ${artifact.name}`}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-800 hover:text-slate-100"
            download
            href={artifact.downloadUrl}
            title="Download"
          >
            <Download className="h-4 w-4" />
          </a>
        </div>
      </article>

      {isOpen
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                  setIsOpen(false);
                }
              }}
            >
              <section
                aria-labelledby={titleId}
                aria-modal="true"
                className="flex h-[90vh] w-[90vw] flex-col overflow-hidden rounded-lg border border-slate-700 bg-[#0d1117] shadow-2xl"
                role="dialog"
              >
                <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-800 px-4">
                  <h2
                    className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-100"
                    id={titleId}
                  >
                    {artifact.name}
                  </h2>
                  <a
                    aria-label={`Download ${artifact.name} from preview`}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                    download
                    href={artifact.downloadUrl}
                    title="Download"
                  >
                    <Download className="h-4 w-4" />
                  </a>
                  <button
                    aria-label="Close preview"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                    onClick={() => setIsOpen(false)}
                    ref={closeButtonRef}
                    type="button"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </header>

                <div className="flex min-h-0 flex-1 items-center justify-center bg-black p-3">
                  {mediaType === "screenshot" ? (
                    <img
                      alt={`Full-size ${artifact.name}`}
                      className="max-h-full max-w-full object-contain"
                      src={artifact.viewUrl}
                    />
                  ) : (
                    <video
                      aria-label={`Video player for ${artifact.name}`}
                      className="max-h-full max-w-full"
                      controls
                      playsInline
                      preload="metadata"
                      src={artifact.viewUrl}
                    />
                  )}
                </div>
              </section>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
