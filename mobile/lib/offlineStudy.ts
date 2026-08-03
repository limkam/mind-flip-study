import NetInfo from "@react-native-community/netinfo";

import type { FlashcardOut, FlashcardSetOut, StudyProgressInput } from "../types/api";
import { storage } from "../store/storage";
import { useAuthStore } from "../store/authStore";
import { submitStudyProgress } from "./studyProgress";
import { invalidateAfterStudyProgress } from "./studyInvalidation";
import { mobileQueryClient } from "./queryClient";

const LEGACY_PENDING_KEY = "pending-progress";
const PENDING_KEY_PREFIX = "pending-progress:";

export type PendingProgressItem = {
  queue_id: string;
  card_id: string;
  quality: number;
  timestamp: number;
};

type AuthenticatedOwner = { userId: string; accessToken: string };

function authenticatedOwner(): AuthenticatedOwner | null {
  const { user, accessToken } = useAuthStore.getState();
  return user?.id && accessToken ? { userId: user.id, accessToken } : null;
}

function pendingProgressKey(userId: string) {
  return `${PENDING_KEY_PREFIX}${userId}`;
}

function createQueueId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export type CachedStudySet = {
  id: string;
  title: string;
  book_title: string | null;
  cards: FlashcardOut[];
  cachedAt: number;
  serverUpdatedAt?: string | null;
};

function studySetCacheKey(setId: string) {
  return `study-set-${setId}`;
}

export async function isOnline(): Promise<boolean> {
  const state = await NetInfo.fetch();
  return state.isConnected === true && state.isInternetReachable !== false;
}

export function cacheStudySet(set: FlashcardSetOut) {
  const payload: CachedStudySet = {
    id: set.id,
    title: set.title,
    book_title: set.book_title,
    cards: set.cards ?? [],
    cachedAt: Date.now(),
    serverUpdatedAt: (set as { updated_at?: string }).updated_at ?? null,
  };
  storage.set(studySetCacheKey(set.id), JSON.stringify(payload));
}

export function getCachedStudySet(setId: string): CachedStudySet | null {
  const raw = storage.getString(studySetCacheKey(setId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CachedStudySet;
  } catch {
    return null;
  }
}

function getPendingProgressForUser(userId: string): PendingProgressItem[] {
  const raw = storage.getString(pendingProgressKey(userId));
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const queueIds = new Set<string>();
    return parsed.filter((value): value is PendingProgressItem => {
      if (!value || typeof value !== "object") return false;
      const item = value as Record<string, unknown>;
      if (
        typeof item.queue_id !== "string"
        || !item.queue_id
        || queueIds.has(item.queue_id)
        || typeof item.card_id !== "string"
        || !item.card_id
        || !Number.isInteger(item.quality)
        || (item.quality as number) < 0
        || (item.quality as number) > 5
        || typeof item.timestamp !== "number"
        || !Number.isFinite(item.timestamp)
      ) return false;
      queueIds.add(item.queue_id);
      return true;
    });
  } catch {
    return [];
  }
}

const pendingWriteLocks = new Map<string, Promise<void>>();

async function updatePendingProgressForUser(
  userId: string,
  update: (items: PendingProgressItem[]) => PendingProgressItem[],
): Promise<void> {
  const previous = pendingWriteLocks.get(userId) ?? Promise.resolve();
  const operation = previous.catch(() => undefined).then(async () => {
    const next = update(getPendingProgressForUser(userId));
    await storage.setAsync(pendingProgressKey(userId), JSON.stringify(next));
  });
  pendingWriteLocks.set(userId, operation);
  try {
    await operation;
  } finally {
    if (pendingWriteLocks.get(userId) === operation) pendingWriteLocks.delete(userId);
  }
}

async function waitForPendingWrites(userId: string) {
  await pendingWriteLocks.get(userId)?.catch(() => undefined);
}

export function discardLegacyPendingProgress() {
  storage.remove(LEGACY_PENDING_KEY);
}

export function getPendingProgress(): PendingProgressItem[] {
  const owner = authenticatedOwner();
  return owner ? getPendingProgressForUser(owner.userId) : [];
}

export async function queueProgressSync(item: StudyProgressInput): Promise<boolean> {
  const owner = authenticatedOwner();
  if (!owner) return false;
  try {
    await updatePendingProgressForUser(owner.userId, (pending) => [
      ...pending,
      { ...item, queue_id: createQueueId(), timestamp: Date.now() },
    ]);
    return true;
  } catch {
    return false;
  }
}

const flushInFlight = new Map<string, Promise<number>>();

export function flushPendingProgress(): Promise<number> {
  const owner = authenticatedOwner();
  if (!owner) return Promise.resolve(0);
  const existing = flushInFlight.get(owner.userId);
  if (existing) return existing;

  const flush = (async () => {
    await waitForPendingWrites(owner.userId);

    const currentOwner = authenticatedOwner();
    if (
      currentOwner?.userId !== owner.userId
      || currentOwner.accessToken !== owner.accessToken
    ) return 0;

    const pending = getPendingProgressForUser(owner.userId);
    if (!pending.length) return 0;

    let synced = 0;
    const successfulCardIds = new Set<string>();
    for (const item of pending) {
      const activeOwner = authenticatedOwner();
      if (
        activeOwner?.userId !== owner.userId
        || activeOwner.accessToken !== owner.accessToken
      ) break;
      const result = await submitStudyProgress({
        card_id: item.card_id,
        quality: item.quality,
      });
      if (result.status === "submitted") {
        successfulCardIds.add(result.progress.card_id);
        try {
          await updatePendingProgressForUser(
            owner.userId,
            (latest) => latest.filter((queued) => queued.queue_id !== item.queue_id),
          );
        } catch {
          console.warn("[offlineStudy] Progress submitted, but its queued record could not be removed.");
          break;
        }
        synced += 1;
        continue;
      }
      if (result.status === "rejected" && !result.retryable) {
        console.warn(
          `[offlineStudy] Dropping permanently rejected progress item (${result.httpStatus ?? "unknown"}): ${result.reason}`,
        );
        try {
          await updatePendingProgressForUser(
            owner.userId,
            (latest) => latest.filter((queued) => queued.queue_id !== item.queue_id),
          );
        } catch {
          console.warn("[offlineStudy] Permanently rejected progress item could not be removed.");
          break;
        }
        continue;
      }
      if (result.status !== "queued") {
        break;
      }
    }
    if (successfulCardIds.size && authenticatedOwner()?.userId === owner.userId) {
      await invalidateAfterStudyProgress(mobileQueryClient, {
        expectedUserId: owner.userId,
        cardIds: successfulCardIds,
      }).catch(() => {
        console.warn("[offlineStudy] Progress synced, but dependent queries could not be invalidated.");
      });
    }
    return synced;
  })();
  flushInFlight.set(owner.userId, flush);

  return flush.finally(() => {
    if (flushInFlight.get(owner.userId) === flush) {
      flushInFlight.delete(owner.userId);
    }
  });
}

export function subscribeConnectivity(onReconnect: () => void) {
  return NetInfo.addEventListener((state) => {
    if (state.isConnected && state.isInternetReachable !== false) {
      onReconnect();
    }
  });
}
