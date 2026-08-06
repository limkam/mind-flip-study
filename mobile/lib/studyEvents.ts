import { api } from "../api/client";

/**
 * Authoritative taxonomy of client study events supported by existing app flows.
 * Only events with explicit repository evidence are included.
 */
export const STUDY_EVENTS = {
  GAME_START: "game_start",
  GAME_FINISH: "game_finish",
  GAME_CONTINUE: "game_continue",
} as const;

export type StudyEventName = (typeof STUDY_EVENTS)[keyof typeof STUDY_EVENTS];

const VALID_EVENT_TYPES = new Set<string>(Object.values(STUDY_EVENTS));

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface StudyEventInput {
  eventType: StudyEventName;
  setId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Recursively sanitize metadata into a plain JSON-compatible object.
 * Strips non-serializable values (functions, symbols, undefined, circular refs, non-finite numbers),
 * email, access tokens, refresh tokens, and raw card contents.
 * Enforces depth limit of 5 and max 50 keys/elements for payload size safety.
 */
export function sanitizeMetadata(
  data: unknown,
  seen = new WeakSet<object>(),
  depth = 0,
): unknown {
  if (data === null || data === undefined || depth > 5) return undefined;

  const type = typeof data;
  if (type === "boolean") return data;
  if (typeof data === "string") {
    const str = data as string;
    return str.length > 512 ? str.slice(0, 512) : str;
  }
  if (type === "number") {
    return Number.isFinite(data) ? data : undefined;
  }
  if (type !== "object") return undefined;

  // Reject functions, symbols, bigint
  if (typeof data === "function" || typeof data === "symbol" || typeof data === "bigint") {
    return undefined;
  }

  const obj = data as Record<string, unknown>;

  // Check circular reference
  if (seen.has(obj)) return undefined;
  seen.add(obj);

  if (Array.isArray(obj)) {
    const arrOut: unknown[] = [];
    for (const item of obj.slice(0, 50)) {
      const sanitized = sanitizeMetadata(item, seen, depth + 1);
      if (sanitized !== undefined) {
        arrOut.push(sanitized);
      }
    }
    return arrOut;
  }

  // Reject non-plain objects / custom class instances (except Date converted to ISO string)
  if (obj instanceof Date) {
    return Number.isNaN(obj.getTime()) ? undefined : obj.toISOString();
  }
  const proto = Object.getPrototypeOf(obj);
  if (proto !== null && proto !== Object.prototype) {
    return undefined;
  }

  const out: Record<string, unknown> = {};
  const entries = Object.entries(obj).slice(0, 50);
  for (const [key, val] of entries) {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey.includes("email") ||
      lowerKey.includes("token") ||
      lowerKey.includes("authorization") ||
      lowerKey.includes("password") ||
      lowerKey === "cards" ||
      lowerKey === "card_content"
    ) {
      continue;
    }

    const sanitizedVal = sanitizeMetadata(val, seen, depth + 1);
    if (sanitizedVal !== undefined) {
      out[key] = sanitizedVal;
    }
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Single authoritative fire-and-forget transport for mobile study events.
 *
 * Guarantees:
 * 1. Validates inputs against strict taxonomy, canonical UUIDs, and 64-char limit.
 * 2. Sanitizes metadata safely.
 * 3. Never throws or blocks primary user learning UX.
 * 4. No UI alerts, no retry loop, no offline queue.
 * 5. Resolves safely on HTTP error / network failure.
 */
export async function logStudyEvent(input: StudyEventInput): Promise<void> {
  try {
    const { eventType, setId, metadata } = input;

    if (!eventType || typeof eventType !== "string" || !VALID_EVENT_TYPES.has(eventType)) {
      if (__DEV__) {
        console.warn(`[StudyEvents] Ignored invalid eventType: "${String(eventType)}"`);
      }
      return;
    }

    if (eventType.length > 64) {
      if (__DEV__) {
        console.warn(`[StudyEvents] Ignored eventType exceeding 64 chars: "${eventType}"`);
      }
      return;
    }

    let canonicalSetId: string | undefined;
    if (setId !== undefined && setId !== null) {
      if (typeof setId === "string" && UUID_REGEX.test(setId.trim())) {
        canonicalSetId = setId.trim();
      } else if (__DEV__) {
        console.warn(`[StudyEvents] Ignored non-canonical setId: "${String(setId)}"`);
      }
    }

    const sanitizedMeta = metadata ? (sanitizeMetadata(metadata) as Record<string, unknown> | undefined) : undefined;

    const payload = {
      event_type: eventType,
      set_id: canonicalSetId ?? null,
      metadata: sanitizedMeta ?? null,
    };

    if (__DEV__) {
      console.info("[StudyEvents]", payload.event_type, payload);
    }

    await api.post("/study/events", payload).catch((err) => {
      if (__DEV__) {
        console.warn("[StudyEvents] Event dispatch failed non-blockingly:", err?.message ?? String(err));
      }
    });
  } catch (err) {
    if (__DEV__) {
      console.warn("[StudyEvents] Error handling study event input:", err);
    }
  }
}
