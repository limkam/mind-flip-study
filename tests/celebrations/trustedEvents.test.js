import test from "node:test";
import assert from "node:assert/strict";
import { parseTrustedCelebrationEvents } from "../../src/lib/celebrations/trustedEvents.js";

test("trusted response fields map to the central request shape", () => {
  const events = parseTrustedCelebrationEvents({ celebration_events: [{ event_id: "db-id", event_type: "course_complete", occurred_at: "2026-01-01T00:00:00Z", entity_id: "course-id", metadata: {} }] });
  assert.equal(events[0].eventId, "db-id"); assert.equal(events[0].type, "course_complete");
});
test("unknown, unstable, and malformed response events are ignored", () => {
  assert.deepEqual(parseTrustedCelebrationEvents({ celebration_events: [{ event_id: "", event_type: "lesson_complete", occurred_at: "now" }, { event_id: "1", event_type: "unknown", occurred_at: "2026-01-01T00:00:00Z" }] }), []);
});
