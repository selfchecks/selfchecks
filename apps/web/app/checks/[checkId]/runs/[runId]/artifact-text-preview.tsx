"use client";

import { useEffect, useState } from "react";

type ArtifactTextPreviewProps = {
  name: string;
  viewUrl: string;
};

export function ArtifactTextPreview({ name, viewUrl }: ArtifactTextPreviewProps) {
  const [content, setContent] = useState("Loading…");

  useEffect(() => {
    const controller = new AbortController();

    async function loadContent() {
      try {
        const response = await fetch(viewUrl, { signal: controller.signal });

        if (!response.ok) {
          throw new Error(`Unable to load artifact (${response.status}).`);
        }

        setContent(await response.text());
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setContent("Unable to load artifact contents.");
      }
    }

    void loadContent();

    return () => controller.abort();
  }, [viewUrl]);

  return (
    <textarea
      aria-label={`Contents of ${name}`}
      className="w-full resize-y overflow-auto rounded-md border border-slate-700 bg-[#0b0f14] px-3 py-2 font-mono text-xs leading-5 text-slate-300 outline-none focus:border-slate-600"
      readOnly
      rows={5}
      value={content}
    />
  );
}
