import { useCallback, useRef } from "react";
import { logStudyEvent, STUDY_EVENTS, type StudyEventName } from "./studyEvents";

export function logGameEvent(event: string, metadata: Record<string, unknown> = {}) {
  const { set_id: setId, ...eventMetadata } = metadata;

  // Map legacy event string (e.g. "start", "finish", "continue", "save_error") to canonical taxonomy
  let canonicalType: StudyEventName | null = null;

  if (event === "start") {
    canonicalType = STUDY_EVENTS.GAME_START;
  } else if (event === "finish") {
    canonicalType = STUDY_EVENTS.GAME_FINISH;
  } else if (event === "continue") {
    canonicalType = STUDY_EVENTS.GAME_CONTINUE;
  } else if (event.startsWith("game_")) {
    const candidate = event as StudyEventName;
    if (Object.values(STUDY_EVENTS).includes(candidate)) {
      canonicalType = candidate;
    }
  }

  if (!canonicalType) {
    if (__DEV__) {
      console.warn(`[gameLifecycle] Unmapped legacy game event: "${event}"`);
    }
    return;
  }

  void logStudyEvent({
    eventType: canonicalType,
    setId: typeof setId === "string" ? setId : undefined,
    metadata: eventMetadata,
  });
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
