const VERSION = 1, MAX_ENTRIES = 200, DEFAULT_RETENTION = 90;
export const seenStorageKey = (namespace) => `bilkeys:celebrations:v${VERSION}:${namespace || "anonymous"}`;
/** @param {{storage?: Storage | {getItem(key: string): string | null, setItem(key: string, value: string): void}, namespace?: string, retentionDays?: number, now?: () => number}=} options */
export function createSeenState({ storage, namespace = "anonymous", retentionDays = DEFAULT_RETENTION, now = () => Date.now() } = {}) {
  const target = storage || (typeof localStorage === "undefined" ? null : localStorage); const key = seenStorageKey(namespace);
  const read = () => {
    if (!target) return [];
    try { const parsed = JSON.parse(target.getItem(key) || "[]"); const cutoff = now() - retentionDays * 86400000; return Array.isArray(parsed) ? parsed.filter((x) => typeof x?.eventId === "string" && x.presentedAt >= cutoff).slice(-MAX_ENTRIES) : []; } catch { return []; }
  };
  const write = (rows) => { try { target?.setItem(key, JSON.stringify(rows.slice(-MAX_ENTRIES))); } catch { /* storage unavailable */ } };
  return {
    has: (eventId) => read().some((x) => x.eventId === eventId),
    presented(event) { const rows = read(); if (!rows.some((x) => x.eventId === event.eventId)) write([...rows, { eventId: event.eventId, type: event.type, presentedAt: now() }]); },
    dismissed(eventId) { write(read().map((x) => x.eventId === eventId ? { ...x, dismissedAt: now() } : x)); },
    entries: read,
  };
}
