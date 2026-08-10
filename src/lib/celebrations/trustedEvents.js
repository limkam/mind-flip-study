import { EVENT_TYPES } from "./policy.js";

export function parseTrustedCelebrationEvents(response) {
  if (!Array.isArray(response?.celebration_events)) return [];
  return response.celebration_events.flatMap((item) => {
    if (!item || typeof item.event_id !== "string" || !item.event_id || !EVENT_TYPES.includes(item.event_type)) return [];
    if (typeof item.occurred_at !== "string" || Number.isNaN(Date.parse(item.occurred_at))) return [];
    return [{ eventId: item.event_id, type: item.event_type, occurredAt: item.occurred_at,
      entityId: typeof item.entity_id === "string" ? item.entity_id : undefined,
      title: typeof item.title === "string" ? item.title : undefined,
      message: typeof item.message === "string" ? item.message : undefined,
      metadata: item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata) ? item.metadata : {} }];
  });
}
