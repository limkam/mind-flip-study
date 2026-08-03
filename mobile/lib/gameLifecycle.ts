import { useCallback, useRef } from "react";

import { api } from "../api/client";

export function logGameEvent(event: string, metadata: Record<string, unknown> = {}) {
  if (__DEV__) {
    console.info("[game]", event, metadata);
  }
  const { set_id: setId, ...eventMetadata } = metadata;
  void api
    .post("/study/events", {
      event_type: `game_${event}`,
      set_id: typeof setId === "string" ? setId : undefined,
      metadata: eventMetadata,
    })
    .catch(() => undefined);
}

export function useFinishOnce(onComplete: () => void) {
  const doneRef = useRef(false);
  return useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    logGameEvent("finish", {});
    onComplete();
  }, [onComplete]);
}
