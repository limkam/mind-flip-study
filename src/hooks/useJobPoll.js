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
      if (data.phase !== lastPhaseRef.current) {
        lastPhaseRef.current = data.phase;
        onProgress?.(data);
      } else if (data.status === 'started' || data.status === 'pending') {
        onProgress?.(data);
      }
      if (data.status === 'complete' || data.status === 'failed') {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        onTerminal?.(data);
      }
    } catch {
      /* ignore transient errors */
    }
  }, [jobId, onTerminal, onProgress]);

  useEffect(() => {
    if (!jobId) return;
    lastPhaseRef.current = null;
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
