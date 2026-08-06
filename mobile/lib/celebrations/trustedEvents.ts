import type { CelebrationEventOut } from "../../types/api";
import { isSupportedCelebrationType } from "./policy";

export interface ParsedCelebrationInput {
  eventId: string;
  type: CelebrationEventOut["event_type"];
  occurredAt: string;
  entityId?: string;
  title?: string;
  message?: string;
  metadata: Record<string, unknown>;
}

export function parseTrustedCelebrationEvents(response: unknown): ParsedCelebrationInput[] {
  if (!response || typeof response !== "object") return [];
  const rawEvents = (response as Record<string, unknown>).celebration_events;
  if (!Array.isArray(rawEvents)) return [];

  const parsed: ParsedCelebrationInput[] = [];

  for (const item of rawEvents) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;

    const eventId = typeof raw.event_id === "string" ? raw.event_id.trim() : "";
    if (!eventId) continue;

    const eventType = raw.event_type;
    if (!isSupportedCelebrationType(eventType)) continue;

    const occurredAt = typeof raw.occurred_at === "string" ? raw.occurred_at.trim() : "";
    if (!occurredAt || Number.isNaN(Date.parse(occurredAt))) continue;

    const entityId = typeof raw.entity_id === "string" && raw.entity_id.trim() ? raw.entity_id.trim() : undefined;
    const title = typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : undefined;
    const message = typeof raw.message === "string" && raw.message.trim() ? raw.message.trim() : undefined;

    const metadata = raw.metadata && typeof raw.metadata === "object" && !Array.isArray(raw.metadata)
      ? (raw.metadata as Record<string, unknown>)
      : {};

    parsed.push({
      eventId,
      type: eventType,
      occurredAt,
      entityId,
      title,
      message,
      metadata,
    });
  }

  return parsed;
}
