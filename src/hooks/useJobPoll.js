import { useCallback, useEffect, useRef } from 'react';

import client from '@/api/client';

/**
 * Polls GET /jobs/{jobId} while the document is visible; clears on unmount.
 */
export function useJobPoll(jobId, options = {}) {
  const { intervalMs = 1500, onTerminal, onProgress } = options;
  const timerRef = useRef(null);
  const visibleRef = useRef(
    typeof document !== 'undefined' && document.visibilityState === 'visible',
  );
  const lastPhaseRef = useRef(null);
  const terminalHandledRef = useRef(false);
  const onTerminalRef = useRef(onTerminal);
  const onProgressRef = useRef(onProgress);

  onTerminalRef.current = onTerminal;
  onProgressRef.current = onProgress;

  useEffect(() => {
    const onVis = () => {
      visibleRef.current = document.visibilityState === 'visible';
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const tick = useCallback(async () => {
    if (!jobId || !visibleRef.current) return;
    try {
      const { data } = await client.get(`/jobs/${jobId}`);
      const phaseChanged = data.phase !== lastPhaseRef.current;
      if (phaseChanged) {
        lastPhaseRef.current = data.phase;
      }
      if (
        phaseChanged
        || data.status === 'started'
        || data.status === 'pending'
        || data.chapters_done != null
        || data.percent_complete != null
      ) {
        onProgressRef.current?.(data);
      }
      if (data.status === 'complete' || data.status === 'failed') {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        if (!terminalHandledRef.current) {
          terminalHandledRef.current = true;
          onTerminalRef.current?.(data);
        }
      }
    } catch {
      /* ignore transient errors */
    }
  }, [jobId]);

  useEffect(() => {
    if (!jobId) return;
    lastPhaseRef.current = null;
    terminalHandledRef.current = false;
    void tick();
    timerRef.current = setInterval(() => void tick(), intervalMs);
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [jobId, intervalMs, tick]);
}
