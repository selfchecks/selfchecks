"use client";

import { useAppNotes } from "@appnotes/react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const APPNOTES_API_URL = "https://app.appnotes.tech/api";

export function AppNotesIntegration() {
  const projectKey = process.env.NEXT_PUBLIC_APPNOTES_PROJECT_KEY;
  const [roomId, setRoomId] = useState("");
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [rootElement, setRootElement] = useState<HTMLDivElement | null>(null);
  const [toggleElement, setToggleElement] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    setRoomId(window.location.host);
    setPortalTarget(document.body);
  }, []);

  useAppNotes(
    projectKey && roomId && rootElement && toggleElement
      ? {
          apiUrl: APPNOTES_API_URL,
          projectKey,
          roomId,
          rootDomElement: rootElement,
          theme: "dark",
          toggleDomElement: toggleElement,
        }
      : null,
  );

  if (!projectKey) {
    return null;
  }

  return (
    <>
      <div className="h-10 shrink-0" data-appnotes-toggle="" ref={setToggleElement} />
      {portalTarget
        ? createPortal(
            <div data-appnotes-drawer-root="" ref={setRootElement} />,
            portalTarget,
          )
        : null}
    </>
  );
}
