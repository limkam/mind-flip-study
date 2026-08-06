import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AccessibilityInfo, AppState } from "react-native";
import * as Haptics from "expo-haptics";
import { usePathname } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { api } from "../api/client";
import { CelebrationOverlay } from "../components/CelebrationOverlay";
import type { NormalizedCelebration } from "../lib/celebrations/policy";
import {
  aggregateCelebrations,
  getLevelRank,
  MOBILE_PRESENTATION_AUTO_DISMISS_MS,
} from "../lib/celebrations/policy";
import type { SeenState } from "../lib/celebrations/seenState";
import { createSeenState } from "../lib/celebrations/seenState";
import { parseTrustedCelebrationEvents } from "../lib/celebrations/trustedEvents";
import { useAuthStore } from "../store/authStore";
import type { EngagementPreferencesOut } from "../types/api";

const QUEUE_LIMIT = 4;
const MAX_QUEUE_AGE_MS = 30_000;

export interface CelebrationOptions {
  destination?: {
    type: "quiz-result";
    resultId: string;
  };
}

export interface CelebrationContextValue {
  requestMany: (events: unknown, options?: CelebrationOptions) => Promise<void>;
  dismissActive: (reason?: string) => void;
  active: NormalizedCelebration | null;
  queueLength: number;
}

const CelebrationContext = createContext<CelebrationContextValue | null>(null);

export const CelebrationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const userId = useAuthStore((s) => s.user?.id);
  const bootstrapStatus = useAuthStore((s) => s.bootstrapStatus);
  const isAuthenticated = bootstrapStatus === "authenticated" && !!userId;

  const pathname = usePathname();

  // Authoritative query for engagement preferences matching Settings
  const engagementQuery = useQuery({
    queryKey: ["engagement-preferences"],
    queryFn: async () => {
      const { data } = await api.get<EngagementPreferencesOut>("/engagement/preferences");
      return data;
    },
    enabled: isAuthenticated,
  });

  const animationsEnabled = engagementQuery.data?.celebration_animations !== false;

  const [active, setActive] = useState<NormalizedCelebration | null>(null);
  const [queue, setQueue] = useState<NormalizedCelebration[]>([]);
  const [reduceMotion, setReduceMotion] = useState<boolean>(false);

  const activeRef = useRef<NormalizedCelebration | null>(null);
  const queueRef = useRef<NormalizedCelebration[]>([]);
  const autoDismissTimerRef = useRef<NodeJS.Timeout | null>(null);
  const activeEventInstanceKeyRef = useRef<string | null>(null);

  // Authoritative handoff holder for quiz result celebration survival during navigation
  const pendingQuizCelebrationRef = useRef<{ resultId: string; celebration: NormalizedCelebration } | null>(null);

  const seenStateRef = useRef<{ userId: string; instance: SeenState } | null>(null);

  if (userId) {
    if (!seenStateRef.current || seenStateRef.current.userId !== userId) {
      const instance = createSeenState(userId);
      if (instance) {
        seenStateRef.current = { userId, instance };
      }
    }
  } else {
    seenStateRef.current = null;
  }
  const seen = seenStateRef.current?.instance ?? null;

  // Accessibility reduced motion listener
  useEffect(() => {
    let activeSubscription = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (activeSubscription) setReduceMotion(enabled);
    }).catch(() => {});

    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", (enabled) => {
      setReduceMotion(enabled);
    });

    return () => {
      activeSubscription = false;
      subscription?.remove();
    };
  }, []);

  const clearAutoDismissTimer = useCallback(() => {
    if (autoDismissTimerRef.current) {
      clearTimeout(autoDismissTimerRef.current);
      autoDismissTimerRef.current = null;
    }
  }, []);

  const triggerHaptic = useCallback((level: NormalizedCelebration["level"]) => {
    try {
      if (level === "subtle") {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } else if (level === "medium") {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } else if (level === "major") {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {
      // Harmless fallback
    }
  }, []);

  const showCelebration = useCallback((event: NormalizedCelebration) => {
    clearAutoDismissTimer();

    const instanceKey = `${event.eventId}:${Date.now()}`;
    activeEventInstanceKeyRef.current = instanceKey;

    activeRef.current = event;
    setActive(event);

    // Seen persistence policy: seen = first visible presentation ownership
    if (seen) {
      void seen.presented({ eventId: event.eventId, type: event.type });
      if (event.relatedEventIds) {
        for (const relId of event.relatedEventIds) {
          void seen.presented({ eventId: relId, type: event.type });
        }
      }
    }

    triggerHaptic(event.level);

    const dismissMs = MOBILE_PRESENTATION_AUTO_DISMISS_MS[event.level];
    autoDismissTimerRef.current = setTimeout(() => {
      if (activeEventInstanceKeyRef.current === instanceKey) {
        dismissActive("auto_dismiss");
      }
    }, dismissMs);
  }, [clearAutoDismissTimer, seen, triggerHaptic]);

  const dismissActive = useCallback((reason: string = "manual") => {
    clearAutoDismissTimer();
    activeEventInstanceKeyRef.current = null;

    const current = activeRef.current;
    if (!current) return;

    if (seen) {
      void seen.dismissed(current.eventId);
    }

    activeRef.current = null;
    setActive(null);

    const next = queueRef.current.shift() || null;
    setQueue([...queueRef.current]);

    if (next) {
      setTimeout(() => {
        showCelebration(next);
      }, 50);
    }
  }, [clearAutoDismissTimer, seen, showCelebration]);

  const clearActiveAndQueue = useCallback(() => {
    clearAutoDismissTimer();
    activeEventInstanceKeyRef.current = null;
    activeRef.current = null;
    setActive(null);
    if (queueRef.current.length > 0) {
      queueRef.current = [];
      setQueue([]);
    }
  }, [clearAutoDismissTimer]);

  // Route change listener: check for pending quiz result handoff before clearing
  useEffect(() => {
    if (pendingQuizCelebrationRef.current) {
      const targetPath = `/quiz-results/${pendingQuizCelebrationRef.current.resultId}`;
      const normalizedCurrent = pathname.replace(/\/$/, "");
      const normalizedTarget = targetPath.replace(/\/$/, "");
      const match = normalizedCurrent === normalizedTarget;
      if (match) {
        const pending = pendingQuizCelebrationRef.current.celebration;
        pendingQuizCelebrationRef.current = null;
        clearAutoDismissTimer();
        activeRef.current = null;
        setActive(null);
        showCelebration(pending);
        return;
      }
    }
    pendingQuizCelebrationRef.current = null;
    clearActiveAndQueue();
  }, [pathname, clearActiveAndQueue, clearAutoDismissTimer, showCelebration]);

  // AppState change listener
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "background" || nextState === "inactive") {
        pendingQuizCelebrationRef.current = null;
        clearActiveAndQueue();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [clearActiveAndQueue]);

  // Auth / User change listener
  useEffect(() => {
    pendingQuizCelebrationRef.current = null;
    clearActiveAndQueue();
  }, [userId, clearActiveAndQueue]);

  const requestMany = useCallback(
    async (responsePayload: unknown, options?: CelebrationOptions): Promise<void> => {
      try {
        if (!isAuthenticated || !seen) return;

        const parsedInputs = parseTrustedCelebrationEvents(responsePayload);
        if (parsedInputs.length === 0) return;

        const event = aggregateCelebrations(parsedInputs);
        if (!event) return;

        const idsToCheck = event.relatedEventIds || [event.eventId];
        let allSeen = true;
        for (const id of idsToCheck) {
          const isSeen = await seen.has(id);
          if (!isSeen) {
            allSeen = false;
            break;
          }
        }
        if (allSeen) return;

        if (
          activeRef.current?.eventId === event.eventId
          || queueRef.current.some((x) => x.eventId === event.eventId)
        ) {
          return;
        }

        // Authoritative destination handoff option check
        if (options?.destination?.type === "quiz-result" && options.destination.resultId) {
          const resId = options.destination.resultId.trim();
          const targetPath = `/quiz-results/${resId}`;
          const normalizedCurrent = pathname.replace(/\/$/, "");
          const normalizedTarget = targetPath.replace(/\/$/, "");
          if (resId && normalizedCurrent !== normalizedTarget) {
            pendingQuizCelebrationRef.current = { resultId: resId, celebration: event };
            return;
          }
        }

        if (!activeRef.current) {
          showCelebration(event);
          return;
        }

        // Preemption check for major level events
        if (
          event.level === "major"
          && getLevelRank(event.level) > getLevelRank(activeRef.current.level)
        ) {
          const preempted = activeRef.current;
          clearAutoDismissTimer();

          queueRef.current = [preempted, ...queueRef.current].slice(0, QUEUE_LIMIT);
          setQueue([...queueRef.current]);

          showCelebration(event);
          return;
        }

        // Queue insertion for lower or equal level events
        const now = Date.now();
        let nextQueue = queueRef.current.filter((x) => {
          const age = now - Date.parse(x.occurredAt);
          return x.level === "major" || (Number.isFinite(age) && age <= MAX_QUEUE_AGE_MS);
        });

        if (event.level === "subtle") {
          nextQueue = nextQueue.filter((x) => x.level !== "subtle");
        }

        nextQueue = [...nextQueue, event]
          .sort((a, b) => getLevelRank(b.level) - getLevelRank(a.level))
          .slice(0, QUEUE_LIMIT);

        queueRef.current = nextQueue;
        setQueue([...queueRef.current]);
      } catch {
        // Ignored safely
      }
    },
    [isAuthenticated, seen, pathname, showCelebration, clearAutoDismissTimer],
  );

  const contextValue = useMemo<CelebrationContextValue>(() => ({
    requestMany,
    dismissActive,
    active,
    queueLength: queue.length,
  }), [requestMany, dismissActive, active, queue.length]);

  return (
    <CelebrationContext.Provider value={contextValue}>
      {children}
      <CelebrationOverlay
        active={active}
        onDismiss={dismissActive}
        reduceMotion={reduceMotion}
        animationsEnabled={animationsEnabled}
      />
    </CelebrationContext.Provider>
  );
};

export function useCelebration(): CelebrationContextValue {
  const context = useContext(CelebrationContext);
  if (!context) {
    throw new Error("useCelebration must be used within a CelebrationProvider");
  }
  return context;
}
