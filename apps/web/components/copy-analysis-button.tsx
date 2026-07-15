"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type CopyAnalysisButtonProps = {
  text: string;
};

export function CopyAnalysisButton({ text }: CopyAnalysisButtonProps) {
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
      }
    },
    [],
  );

  async function copyAnalysis() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);

      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
      }
      resetTimerRef.current = setTimeout(() => setCopied(false), 2_000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      aria-label="Copy AI analysis"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-cyan-950 text-cyan-200 transition-colors hover:bg-cyan-900 hover:text-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
      onClick={() => void copyAnalysis()}
      title={copied ? "AI analysis copied" : "Copy AI analysis"}
      type="button"
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
    </button>
  );
}
