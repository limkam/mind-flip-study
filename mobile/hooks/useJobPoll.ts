import { useCallback, useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";

import type { JobStatusResponse } from "../types/api";

const TERMINAL = new Set<JobStatusResponse["status"]>(["complete", "failed"]);

type Options = {
  intervalMs?: number;
  onTerminal?: (body: JobStatusResponse) => void;
};

/**
 * Polls GET /jobs/{id} while the app is active; clears the interval on unmount
 * and skips ticks while backgrounded.
 */
export function useJobPoll(jobId: string | null | undefined, fetchStatus: () => Promise<JobStatusResponse>, options?: Options) {
  const intervalMs = options?.intervalMs ?? 2500;
  const onTerminal = options?.onTerminal;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appState = useRef<AppStateStatus>(AppState.currentState);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const tick = useCallback(async () => {
    if (appState.current !== "active" || !jobId) return;
    try {
      const body = await fetchStatus();
      if (TERMINAL.has(body.status)) {
        clearTimer();
        onTerminal?.(body);
      }
    } catch {
      /* transient network errors — next tick retries */
    }
  }, [jobId, fetchStatus, onTerminal, clearTimer]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      appState.current = next;
      if (next === "active" && jobId) void tick();
    });
    return () => sub.remove();
  }, [jobId, tick]);

  useEffect(() => {
    clearTimer();
    if (!jobId) return;
    void tick();
    timerRef.current = setInterval(() => void tick(), intervalMs);
    return clearTimer;
  }, [jobId, intervalMs, tick, clearTimer]);
}
