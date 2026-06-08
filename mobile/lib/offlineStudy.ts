import NetInfo from "@react-native-community/netinfo";

import { api } from "../api/client";
import type { FlashcardOut, FlashcardSetOut } from "../types/api";
import { storage } from "../store/storage";

const PENDING_KEY = "pending-progress";

export type PendingProgressItem = {
  card_id: string;
  quality: number;
  timestamp: number;
};

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

export function getPendingProgress(): PendingProgressItem[] {
  const raw = storage.getString(PENDING_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as PendingProgressItem[];
  } catch {
    return [];
  }
}

function setPendingProgress(items: PendingProgressItem[]) {
  storage.set(PENDING_KEY, JSON.stringify(items));
}

export function queueProgressSync(item: Omit<PendingProgressItem, "timestamp">) {
  const pending = getPendingProgress();
  pending.push({ ...item, timestamp: Date.now() });
  setPendingProgress(pending);
}

let flushInFlight: Promise<void> | null = null;

export async function flushPendingProgress(): Promise<number> {
  if (flushInFlight) {
    await flushInFlight;
    return 0;
  }

  const online = await isOnline();
  if (!online) return 0;

  const pending = getPendingProgress();
  if (!pending.length) return 0;

  let synced = 0;
  flushInFlight = (async () => {
    for (const item of pending) {
      try {
        await api.post("/study/progress", {
          card_id: item.card_id,
          quality: item.quality,
        });
        synced += 1;
      } catch {
        break;
      }
    }
    setPendingProgress(pending.slice(synced));
  })();

  try {
    await flushInFlight;
  } finally {
    flushInFlight = null;
  }
  return synced;
}

export function subscribeConnectivity(onReconnect: () => void) {
  return NetInfo.addEventListener((state) => {
    if (state.isConnected && state.isInternetReachable !== false) {
      onReconnect();
    }
  });
}
