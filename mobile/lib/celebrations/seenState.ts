import { ensureStorageReady, storage } from "../../store/storage";

const VERSION = 1;
const MAX_ENTRIES = 200;
const RETENTION_MS = 90 * 86_400_000;

export interface SeenEntry {
  eventId: string;
  type: string;
  presentedAt: number;
  dismissedAt?: number;
}

export function seenStorageKey(userId: string): string {
  return `mindflip:celebrations:v${VERSION}:user:${userId}`;
}

export interface SeenState {
  has(eventId: string): Promise<boolean>;
  presented(event: { eventId: string; type: string }): Promise<void>;
  dismissed(eventId: string): Promise<void>;
  entries(): Promise<SeenEntry[]>;
}

export function createSeenState(userId: string, now: () => number = Date.now): SeenState | null {
  if (!userId || !userId.trim()) return null;
  const key = seenStorageKey(userId.trim());
  let lock: Promise<unknown> = Promise.resolve();

  const read = async (): Promise<SeenEntry[]> => {
    try {
      await ensureStorageReady();
      const raw = storage.getString(key);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      const cutoff = now() - RETENTION_MS;
      return parsed
        .filter(
          (x): x is SeenEntry =>
            !!x
            && typeof x === "object"
            && typeof x.eventId === "string"
            && typeof x.presentedAt === "number"
            && x.presentedAt >= cutoff,
        )
        .slice(-MAX_ENTRIES);
    } catch {
      return [];
    }
  };

  const write = async (rows: SeenEntry[]): Promise<void> => {
    try {
      const sliced = rows.slice(-MAX_ENTRIES);
      await storage.setAsync(key, JSON.stringify(sliced));
    } catch {
      // Storage unavailable or quota exceeded
    }
  };

  const synchronized = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = lock.then(fn, fn);
    lock = next;
    return next;
  };

  return {
    async has(eventId: string): Promise<boolean> {
      return synchronized(async () => {
        const rows = await read();
        return rows.some((x) => x.eventId === eventId);
      });
    },

    async presented(event: { eventId: string; type: string }): Promise<void> {
      return synchronized(async () => {
        const rows = await read();
        if (!rows.some((x) => x.eventId === event.eventId)) {
          await write([...rows, { eventId: event.eventId, type: event.type, presentedAt: now() }]);
        }
      });
    },

    async dismissed(eventId: string): Promise<void> {
      return synchronized(async () => {
        const rows = await read();
        const updated = rows.map((x) => (x.eventId === eventId ? { ...x, dismissedAt: now() } : x));
        await write(updated);
      });
    },

    async entries(): Promise<SeenEntry[]> {
      return synchronized(() => read());
    },
  };
}
