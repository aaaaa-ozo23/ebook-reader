import { useEffect, useRef } from "react";

import {
  endReadingSession,
  heartbeatReadingSession,
  startReadingSession,
} from "../tauri/readingHistory";

const HEARTBEAT_INTERVAL_MS = 30_000;
const RECENT_INTERACTION_MS = 5 * 60_000;

export function useReadingHistorySession({
  bookId,
  ready,
}: {
  bookId: string;
  ready: boolean;
}) {
  const lastInteractionAtRef = useRef(0);

  useEffect(() => {
    const rememberInteraction = () => {
      lastInteractionAtRef.current = Date.now();
    };
    const passiveOptions: AddEventListenerOptions = { passive: true };
    window.addEventListener("pointerdown", rememberInteraction, passiveOptions);
    window.addEventListener("keydown", rememberInteraction);
    window.addEventListener("wheel", rememberInteraction, passiveOptions);
    window.addEventListener("touchstart", rememberInteraction, passiveOptions);
    window.addEventListener("scroll", rememberInteraction, passiveOptions);
    return () => {
      window.removeEventListener("pointerdown", rememberInteraction);
      window.removeEventListener("keydown", rememberInteraction);
      window.removeEventListener("wheel", rememberInteraction);
      window.removeEventListener("touchstart", rememberInteraction);
      window.removeEventListener("scroll", rememberInteraction);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    let disposed = false;
    let sessionId: string | null = null;
    lastInteractionAtRef.current = Date.now();

    void startReadingSession(bookId)
      .then((session) => {
        if (session === null) return;
        sessionId = session.id;
        if (disposed) void endReadingSession(session.id).catch(() => undefined);
      })
      .catch(() => undefined);

    const intervalId = window.setInterval(() => {
      if (
        sessionId === null ||
        document.visibilityState !== "visible" ||
        !document.hasFocus() ||
        Date.now() - lastInteractionAtRef.current > RECENT_INTERACTION_MS
      ) {
        return;
      }
      void heartbeatReadingSession(sessionId).catch(() => undefined);
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
      if (sessionId !== null) void endReadingSession(sessionId).catch(() => undefined);
    };
  }, [bookId, ready]);
}
