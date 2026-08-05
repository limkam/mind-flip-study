import { useCallback, useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import axios from "axios";

import type { JobStatusResponse } from "../types/api";

const TERMINAL = new Set<JobStatusResponse["status"]>(["complete", "failed"]);
// Defensive client-side resource bounds; not backend job expiry rules.
const MAX_ACTIVE_OBSERVATION_MS = 10 * 60 * 1000; // 10 minutes maximum client status polling window
const MAX_CONSECUTIVE_POLL_ERRORS = 15; // Max consecutive transient network/5xx poll errors before pausing

type Options = {
  intervalMs?: number;
  onTerminal?: (body: JobStatusResponse) => void;
  onTimeout?: () => void;
  onErrorStop?: (error: unknown) => void;
};

/**
 * Polls GET /jobs/{id} while the app is active; clears the interval on unmount,
 * prevents concurrent in-flight requests, and bounds duration.
 */
export function useJobPoll(
  jobId: string | null | undefined,
  fetchStatus: () => Promise<JobStatusResponse>,
  options?: Options
) {
  const intervalMs = options?.intervalMs ?? 2500;
  const onTerminal = options?.onTerminal;
  const onTimeout = options?.onTimeout;
  const onErrorStop = options?.onErrorStop;

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const terminalHandledRef = useRef(false);
  const inFlightRef = useRef(false);
  const startTimeRef = useRef<number>(Date.now());
  const consecutiveFailuresRef = useRef(0);

  const fetchStatusRef = useRef(fetchStatus);
  const onTerminalRef = useRef(onTerminal);
  const onTimeoutRef = useRef(onTimeout);
  const onErrorStopRef = useRef(onErrorStop);

  fetchStatusRef.current = fetchStatus;
  onTerminalRef.current = onTerminal;
  onTimeoutRef.current = onTimeout;
  onErrorStopRef.current = onErrorStop;

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const tick = useCallback(async () => {
    if (appState.current !== "active" || !jobId || inFlightRef.current || terminalHandledRef.current) {
      return;
    }

    if (Date.now() - startTimeRef.current > MAX_ACTIVE_OBSERVATION_MS) {
      clearTimer();
      if (!terminalHandledRef.current) {
        terminalHandledRef.current = true;
        onTimeoutRef.current?.();
      }
      return;
    }

    inFlightRef.current = true;
    try {
      const body = await fetchStatusRef.current();
      consecutiveFailuresRef.current = 0;

      if (TERMINAL.has(body.status)) {
        clearTimer();
        if (!terminalHandledRef.current) {
          terminalHandledRef.current = true;
          onTerminalRef.current?.(body);
        }
      }
    } catch (error: unknown) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;

      if (status === 404 || status === 401 || status === 403) {
        clearTimer();
        if (!terminalHandledRef.current) {
          terminalHandledRef.current = true;
          onErrorStopRef.current?.(error);
        }
      } else {
        consecutiveFailuresRef.current += 1;
        if (consecutiveFailuresRef.current >= MAX_CONSECUTIVE_POLL_ERRORS) {
          clearTimer();
          if (!terminalHandledRef.current) {
            terminalHandledRef.current = true;
            onErrorStopRef.current?.(error);
          }
        }
      }
    } finally {
      inFlightRef.current = false;
    }
  }, [jobId, clearTimer]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      appState.current = next;
      if (next === "active" && jobId && !inFlightRef.current) {
        void tick();
      }
    });
    return () => sub.remove();
  }, [jobId, tick]);

  useEffect(() => {
    clearTimer();
    if (!jobId) return;
    terminalHandledRef.current = false;
    inFlightRef.current = false;
    startTimeRef.current = Date.now();
    consecutiveFailuresRef.current = 0;

    void tick();
    timerRef.current = setInterval(() => void tick(), intervalMs);
    return clearTimer;
  }, [jobId, intervalMs, tick, clearTimer]);
}
