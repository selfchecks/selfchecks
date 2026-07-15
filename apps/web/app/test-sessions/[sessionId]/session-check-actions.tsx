"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bot, MoreVertical, X } from "lucide-react";
import Link from "next/link";

import type { TestSessionCheckRow } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";

export function SessionCheckActions({
  check,
  projectSlug,
}: {
  check: TestSessionCheckRow;
  projectSlug: string;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [aiAnalysisOpen, setAiAnalysisOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (
        event.target instanceof Element &&
        event.target.closest("[data-session-check-action-menu]")
      ) {
        return;
      }

      setMenuOpen(false);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [menuOpen]);

  async function runNow() {
    setMenuOpen(false);
    setNotice("");

    try {
      const params = new URLSearchParams({ project: projectSlug });
      const response = await fetch(
        `/api/checks/${encodeURIComponent(check.checkKey)}/run?${params.toString()}`,
        { method: "POST" },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to queue check run.");
      }

      setNotice(`${check.checkName} queued.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      setNotice(`Failed to queue ${check.checkName}: ${message}`);
    }
  }

  const latestRunFailed = ["cancelled", "failed", "timed_out"].includes(check.runState);

  return (
    <>
      <div data-session-check-action-menu>
        <button
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          aria-label={`${check.checkName} actions`}
          className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-800 hover:text-slate-200"
          onClick={() => setMenuOpen((current) => !current)}
          ref={buttonRef}
          type="button"
        >
          <MoreVertical className="h-5 w-5" />
        </button>

        {menuOpen ? (
          <SessionCheckActionMenu
            anchor={buttonRef.current}
            check={check}
            onClose={() => setMenuOpen(false)}
            onCopyNotice={setNotice}
            onOpenAiAnalysis={
              latestRunFailed ? () => setAiAnalysisOpen(true) : undefined
            }
            onRunNow={() => void runNow()}
          />
        ) : null}
      </div>

      {notice
        ? createPortal(
            <div
              className="fixed bottom-4 right-4 z-40 max-w-md rounded-md border border-slate-700 bg-[#12171f] px-4 py-3 text-sm text-slate-300 shadow-xl shadow-black/30"
              role="status"
            >
              {notice}
            </div>,
            document.body,
          )
        : null}

      {aiAnalysisOpen ? (
        <AiAnalysisDrawer check={check} onClose={() => setAiAnalysisOpen(false)} />
      ) : null}
    </>
  );
}

function SessionCheckActionMenu({
  anchor,
  check,
  onClose,
  onCopyNotice,
  onOpenAiAnalysis,
  onRunNow,
}: {
  anchor: HTMLButtonElement | null;
  check: TestSessionCheckRow;
  onClose: () => void;
  onCopyNotice: (notice: string) => void;
  onOpenAiAnalysis?: () => void;
  onRunNow: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    if (!anchor) {
      return;
    }

    const anchorElement = anchor;

    function updatePosition() {
      const menu = menuRef.current;

      if (!menu) {
        return;
      }

      const viewportPadding = 8;
      const menuGap = 4;
      const anchorRect = anchorElement.getBoundingClientRect();
      const menuWidth = menu.offsetWidth || 160;
      const menuHeight = menu.offsetHeight || 160;
      const availableBelow = window.innerHeight - anchorRect.bottom;
      const availableAbove = anchorRect.top;
      const placeAbove =
        availableBelow < menuHeight + menuGap && availableAbove > availableBelow;
      const left = Math.min(
        Math.max(viewportPadding, window.innerWidth - menuWidth - viewportPadding),
        Math.max(viewportPadding, anchorRect.right - menuWidth),
      );
      const desiredTop = placeAbove
        ? anchorRect.top - menuHeight - menuGap
        : anchorRect.bottom + menuGap;
      const top = Math.min(
        Math.max(viewportPadding, window.innerHeight - menuHeight - viewportPadding),
        Math.max(viewportPadding, desiredTop),
      );

      setPosition({ left, top });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchor]);

  async function copyName() {
    try {
      await navigator.clipboard.writeText(check.checkName);
      onCopyNotice(`Copied ${check.checkName}.`);
    } catch {
      onCopyNotice("Unable to copy test name.");
    } finally {
      onClose();
    }
  }

  return createPortal(
    <div
      className="fixed z-50 w-40 rounded-md border border-slate-700 bg-[#12171f] p-1 shadow-xl shadow-black/30"
      data-session-check-action-menu
      ref={menuRef}
      style={{
        left: position?.left ?? 0,
        top: position?.top ?? 0,
        visibility: position ? "visible" : "hidden",
      }}
    >
      <Link
        className="block w-full rounded px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-800"
        href={check.latestRunHref}
        onClick={onClose}
      >
        Open
      </Link>
      <button
        className="block w-full rounded px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-800"
        onClick={onRunNow}
        type="button"
      >
        Run now
      </button>
      {onOpenAiAnalysis ? (
        <button
          className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-cyan-200 hover:bg-slate-800"
          onClick={() => {
            onOpenAiAnalysis();
            onClose();
          }}
          type="button"
        >
          <Bot className="h-4 w-4" />
          AI analysis
        </button>
      ) : null}
      <button
        className="block w-full rounded px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-800"
        onClick={() => void copyName()}
        type="button"
      >
        Copy name
      </button>
    </div>,
    document.body,
  );
}

function AiAnalysisDrawer({
  check,
  onClose,
}: {
  check: TestSessionCheckRow;
  onClose: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const analysis = check.aiAnalysis;
  const meta = [
    analysis?.model,
    analysis?.responseLanguage,
    check.latestRunOccurredAt,
  ].filter(Boolean);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/65 backdrop-blur-[1px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <aside
        aria-labelledby="session-check-ai-analysis-title"
        aria-modal="true"
        className="flex h-full w-full flex-col border-l border-slate-700 bg-[#0d1117] shadow-2xl shadow-black/60 md:w-1/2"
        role="dialog"
      >
        <header className="flex items-start gap-3 border-b border-slate-800 px-6 py-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cyan-950 text-cyan-300">
            <Bot className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2
              className="text-lg font-semibold text-slate-100"
              id="session-check-ai-analysis-title"
            >
              AI analysis
            </h2>
            <div className="mt-0.5 truncate text-sm text-slate-400">
              {check.checkName}
            </div>
          </div>
          <button
            aria-label="Close AI analysis"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-100"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="break-all text-xs text-slate-500">{meta.join(" · ")}</div>
            {analysis ? (
              <span
                className={cn(
                  "rounded px-2 py-1 text-xs font-semibold uppercase",
                  analysis.status === "completed"
                    ? "bg-cyan-950 text-cyan-200"
                    : "bg-amber-950 text-amber-200",
                )}
              >
                {analysis.status}
              </span>
            ) : null}
          </div>

          {analysis?.content ? (
            <pre className="mt-5 whitespace-pre-wrap break-words rounded-md border border-cyan-950/70 bg-[#111821] p-5 font-sans text-sm leading-6 text-slate-200">
              {analysis.content}
            </pre>
          ) : analysis?.error ? (
            <div className="mt-5 rounded-md border border-amber-900/70 bg-amber-950/30 p-5 text-sm leading-6 text-amber-100">
              {analysis.error}
            </div>
          ) : (
            <div className="mt-5 rounded-md border border-slate-800 bg-[#111821] p-5 text-sm leading-6 text-slate-300">
              AI analysis is unavailable for this run. Check the AI settings and run the
              test again to generate a failure analysis.
            </div>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  );
}
