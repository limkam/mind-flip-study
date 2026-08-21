import { queryClientInstance } from "@/lib/query-client";

const CACHE_VERSION = 1;
const CACHE_PREFIX = "bilkeys_core_data";
const MAX_CACHE_AGE_MS = 24 * 60 * 60 * 1000;
const CORE_QUERY_KEYS = new Set([
  JSON.stringify(["books"]),
  JSON.stringify(["flashcard-sets"]),
  JSON.stringify(["analytics-summary"]),
  JSON.stringify(["billing-entitlements"]),
  JSON.stringify(["quiz-results", "dashboard-recent"]),
]);

let activeUserId = null;
let persistTimer = null;

function storageKey(userId) {
  return `${CACHE_PREFIX}:v${CACHE_VERSION}:${userId}`;
}

function isCoreQuery(query) {
  return CORE_QUERY_KEYS.has(JSON.stringify(query.queryKey));
}

function persistActiveUserData() {
  persistTimer = null;
  if (!activeUserId || typeof window === "undefined") return;

  const queries = queryClientInstance.getQueryCache().getAll()
    .filter((query) => isCoreQuery(query) && query.state.status === "success")
    .map((query) => ({
      queryKey: query.queryKey,
      data: query.state.data,
      dataUpdatedAt: query.state.dataUpdatedAt,
    }));

  try {
    localStorage.setItem(storageKey(activeUserId), JSON.stringify({
      savedAt: Date.now(),
      queries,
    }));
  } catch {
    // Storage can be unavailable or full. Network fetching remains the fallback.
  }
}

function schedulePersist() {
  if (!activeUserId || persistTimer !== null || typeof window === "undefined") return;
  persistTimer = window.setTimeout(persistActiveUserData, 150);
}

queryClientInstance.getQueryCache().subscribe((event) => {
  if (event?.type === "updated" && isCoreQuery(event.query)) schedulePersist();
});

export function activateCoreDataCache(userId) {
  const nextUserId = String(userId || "");
  if (!nextUserId || typeof window === "undefined") return;
  if (activeUserId === nextUserId) return;

  if (activeUserId) persistActiveUserData();
  queryClientInstance.removeQueries({ predicate: isCoreQuery });

  activeUserId = nextUserId;
  let cached;
  try {
    cached = JSON.parse(localStorage.getItem(storageKey(nextUserId)) || "null");
  } catch {
    cached = null;
  }

  if (!cached || Date.now() - Number(cached.savedAt || 0) > MAX_CACHE_AGE_MS) return;
  for (const entry of cached.queries || []) {
    if (!CORE_QUERY_KEYS.has(JSON.stringify(entry.queryKey))) continue;
    queryClientInstance.setQueryData(entry.queryKey, entry.data, {
      updatedAt: Number(entry.dataUpdatedAt || cached.savedAt),
    });
  }
}

export function deactivateCoreDataCache() {
  if (persistTimer !== null && typeof window !== "undefined") {
    window.clearTimeout(persistTimer);
    persistActiveUserData();
  }
  activeUserId = null;
}
