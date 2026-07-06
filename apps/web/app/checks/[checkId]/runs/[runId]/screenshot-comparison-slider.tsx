"use client";

/* eslint-disable @next/next/no-img-element */

import { useId, useState } from "react";
import { ExternalLink } from "lucide-react";

import type { DashboardRunArtifact } from "@/lib/dashboard-types";

export type ScreenshotComparison = {
  actual: DashboardRunArtifact;
  diff?: DashboardRunArtifact;
  expected: DashboardRunArtifact;
  id: string;
  label: string;
};

export function ScreenshotComparisonPanel({
  comparisons,
}: {
  comparisons: ScreenshotComparison[];
}) {
  if (comparisons.length === 0) {
    return null;
  }

  return (
    <section className="grid gap-4 rounded-md border border-slate-700 bg-[#0f151d] p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-100">
            Screenshot comparisons
          </h3>
          <div className="mt-1 text-xs text-slate-500">
            {comparisons.length === 1
              ? "1 visual mismatch"
              : `${comparisons.length} visual mismatches`}
          </div>
        </div>
      </div>

      <div className="grid gap-4">
        {comparisons.map((comparison) => (
          <ScreenshotComparisonSlider comparison={comparison} key={comparison.id} />
        ))}
      </div>
    </section>
  );
}

function ScreenshotComparisonSlider({
  comparison,
}: {
  comparison: ScreenshotComparison;
}) {
  const sliderId = useId();
  const [position, setPosition] = useState(50);
  const actualClipPath = `inset(0 ${100 - position}% 0 0)`;

  return (
    <article className="overflow-hidden rounded-md border border-slate-800 bg-[#0b0f14]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-3 py-2">
        <div className="min-w-0">
          <h4
            className="truncate text-sm font-medium text-slate-100"
            title={comparison.label}
          >
            {comparison.label}
          </h4>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>{comparison.expected.name}</span>
            <span className="text-slate-700">/</span>
            <span>{comparison.actual.name}</span>
          </div>
        </div>

        {comparison.diff ? (
          <a
            className="inline-flex h-8 shrink-0 items-center gap-2 rounded border border-slate-700 px-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-slate-100"
            href={comparison.diff.viewUrl}
            rel="noreferrer"
            target="_blank"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Diff
          </a>
        ) : null}
      </div>

      <div className="p-3">
        <div className="relative overflow-hidden rounded border border-slate-800 bg-black">
          <img
            alt={`Expected screenshot for ${comparison.label}`}
            className="block w-full select-none"
            draggable={false}
            src={comparison.expected.viewUrl}
          />
          <img
            alt={`Actual screenshot for ${comparison.label}`}
            className="absolute inset-0 h-full w-full select-none object-contain"
            draggable={false}
            src={comparison.actual.viewUrl}
            style={{ clipPath: actualClipPath }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 flex items-center"
            style={{ left: `${position}%` }}
          >
            <div className="h-full w-px bg-white/80 shadow-[0_0_10px_rgba(255,255,255,0.8)]" />
            <div className="absolute left-1/2 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/80 bg-slate-950/80 shadow" />
          </div>
          <div className="pointer-events-none absolute left-2 top-2 rounded bg-black/70 px-2 py-1 text-[11px] font-semibold uppercase text-slate-100">
            Actual
          </div>
          <div className="pointer-events-none absolute right-2 top-2 rounded bg-black/70 px-2 py-1 text-[11px] font-semibold uppercase text-slate-100">
            Expected
          </div>
        </div>

        <label className="sr-only" htmlFor={sliderId}>
          Reveal actual screenshot for {comparison.label}
        </label>
        <input
          aria-valuetext={`${position}% actual`}
          className="mt-3 h-2 w-full cursor-ew-resize accent-blue-500"
          id={sliderId}
          max={100}
          min={0}
          onChange={(event) => setPosition(Number(event.currentTarget.value))}
          type="range"
          value={position}
        />
        <div className="mt-1 flex justify-between text-xs text-slate-500">
          <span>Expected</span>
          <span>Actual</span>
        </div>
      </div>
    </article>
  );
}
