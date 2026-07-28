"use client";

import { AppNotes } from "@appnotes/react";
import { useEffect, useState } from "react";

const APPNOTES_API_URL = "https://appnotes.tech/api";

export function AppNotesIntegration() {
  const projectKey = process.env.NEXT_PUBLIC_APPNOTES_PROJECT_KEY;
  const [roomId, setRoomId] = useState("");

  useEffect(() => {
    setRoomId(window.location.host);
  }, []);

  if (!projectKey) {
    return null;
  }

  return (
    <AppNotes
      apiUrl={APPNOTES_API_URL}
      projectKey={projectKey}
      roomId={roomId}
      theme="dark"
    />
  );
}
