import { useCallback, useRef } from 'react';

import { trackClientEvent } from '@/lib/analytics';

/** Fire-and-forget structured log for game debugging. */
export function logGameEvent(event, metadata = {}) {
  if (typeof console !== 'undefined' && import.meta.env?.DEV) {
    console.info('[game]', event, metadata);
  }
  trackClientEvent(`game_${event}`, metadata);
}

/** Wrap a completion handler so it only runs once (Continue button). */
export function useFinishOnce(onComplete) {
  const doneRef = useRef(false);
  return useCallback(
    (result) => {
      if (doneRef.current) return;
      doneRef.current = true;
      logGameEvent('finish', { result });
      onComplete?.(result);
    },
    [onComplete],
  );
}
