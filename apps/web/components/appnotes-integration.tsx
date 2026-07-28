"use client";

import { AppNotes } from "@appnotes/react";
import { useEffect, useState } from "react";

const APPNOTES_API_URL = "https://appnotes.tech/api";
const APPNOTES_PROJECT_KEY = "appnotes_pk_DtXYxqlZ6H0EoAts";

export function AppNotesIntegration() {
  const [roomId, setRoomId] = useState("");

  useEffect(() => {
    setRoomId(window.location.host);
  }, []);

  return (
    <AppNotes
      apiUrl={APPNOTES_API_URL}
      projectKey={APPNOTES_PROJECT_KEY}
      roomId={roomId}
      theme="dark"
    />
  );
}
