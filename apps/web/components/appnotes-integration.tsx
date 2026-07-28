"use client";

import { useAppNotes } from "@appnotes/react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const APPNOTES_API_URL = "https://app.appnotes.tech/api";
const APPNOTES_ACTIONS_SELECTOR = "[data-appnotes-actions]";

export function AppNotesIntegration() {
  const projectKey = process.env.NEXT_PUBLIC_APPNOTES_PROJECT_KEY;
  const [roomId, setRoomId] = useState("");
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [actionsTarget, setActionsTarget] = useState<HTMLElement | null>(null);
  const [rootElement, setRootElement] = useState<HTMLDivElement | null>(null);
  const [toggleElement, setToggleElement] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!projectKey) {
      return;
    }

    setRoomId(window.location.host);
    setPortalTarget(document.body);

    const updateActionsTarget = () => {
      const nextActionsTarget = document.querySelector<HTMLElement>(
        APPNOTES_ACTIONS_SELECTOR,
      );

      setActionsTarget((currentActionsTarget) =>
        currentActionsTarget === nextActionsTarget
          ? currentActionsTarget
          : nextActionsTarget,
      );
    };

    updateActionsTarget();

    const observer = new MutationObserver(updateActionsTarget);

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, [projectKey]);

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
      {portalTarget
        ? createPortal(
            <div
              className={
                actionsTarget
                  ? "order-first h-10 shrink-0"
                  : "fixed right-4 top-3 z-[2147482999] h-10"
              }
              data-appnotes-toggle=""
              ref={setToggleElement}
            />,
            actionsTarget ?? portalTarget,
          )
        : null}
      {portalTarget
        ? createPortal(
            <div data-appnotes-drawer-root="" ref={setRootElement} />,
            portalTarget,
          )
        : null}
    </>
  );
}
