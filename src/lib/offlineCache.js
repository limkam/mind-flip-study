import { openDB } from 'idb';

const DB_NAME = 'mindflip-offline';
const DB_VERSION = 1;

/** Single-flight guard: concurrent flush calls share one in-flight promise. */
let flushInFlight = null;

export function cardsFingerprint(cards) {
  if (!cards?.length) return '';
  return [...cards.map((c) => String(c.id))].sort().join('|');
}

export function isStudySetCacheStale(cached, server) {
  if (!cached || !server) return Boolean(server && !cached);
  const serverTs = server.updated_at ? new Date(server.updated_at).getTime() : 0;
  const cachedTs = cached.serverUpdatedAt
    ? new Date(cached.serverUpdatedAt).getTime()
    : 0;
  if (serverTs > cachedTs) return true;
  return cardsFingerprint(cached.cards) !== cardsFingerprint(server.cards);
}

function normalizeStudySetForCache(set) {
  return {
    ...set,
    id: set.id,
    cards: set.cards || [],
    serverUpdatedAt: set.updated_at ?? set.serverUpdatedAt ?? null,
    cachedAt: Date.now(),
    cardsFingerprint: cardsFingerprint(set.cards),
  };
}

export async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('study-sets')) {
        db.createObjectStore('study-sets', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('pending-progress')) {
        db.createObjectStore('pending-progress', { keyPath: 'id', autoIncrement: true });
      }
    },
  });
}

export async function cacheStudySet(set) {
  const db = await getDB();
  await db.put('study-sets', normalizeStudySetForCache(set));
}

export async function getCachedStudySet(setId) {
  const db = await getDB();
  return db.get('study-sets', setId);
}

export async function invalidateStudySet(setId) {
  const db = await getDB();
  await db.delete('study-sets', setId);
}

/**
 * Prefer server payload when online; drop cache when server reports newer edits.
 */
export async function resolveStudySetForSession(serverSet, setId) {
  const cached = await getCachedStudySet(setId);
  if (!serverSet) {
    return cached ?? null;
  }
  if (cached && isStudySetCacheStale(cached, serverSet)) {
    await cacheStudySet(serverSet);
    return serverSet;
  }
  if (!cached || !isStudySetCacheStale(cached, serverSet)) {
    await cacheStudySet(serverSet);
  }
  return serverSet;
}

export async function queueProgressSync(progressItem) {
  const db = await getDB();
  await db.add('pending-progress', {
    ...progressItem,
    synced: false,
    queuedAt: Date.now(),
  });
}

/** Pending items in FIFO order (auto-increment id). */
export async function getPendingProgressOrdered() {
  const db = await getDB();
  const tx = db.transaction('pending-progress', 'readonly');
  const store = tx.objectStore('pending-progress');
  const items = await store.getAll();
  await tx.done;
  return items.sort((a, b) => a.id - b.id);
}

export async function flushPendingProgress(apiClient) {
  if (flushInFlight) {
    return flushInFlight;
  }

  flushInFlight = (async () => {
    const pending = await getPendingProgressOrdered();
    const db = await getDB();
    for (const item of pending) {
      try {
        await apiClient.post('/study/progress', {
          card_id: item.card_id,
          quality: item.quality,
        });
        await db.delete('pending-progress', item.id);
      } catch {
        break;
      }
    }
  })();

  try {
    await flushInFlight;
  } finally {
    flushInFlight = null;
  }
}
