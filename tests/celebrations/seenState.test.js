import test from "node:test";
import assert from "node:assert/strict";
import { createSeenState } from "../../src/lib/celebrations/seenState.js";
const memory = () => { const map = new Map(); return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) }; };
test("presentation persists and prevents refresh replay", () => { const storage = memory(); createSeenState({ storage, namespace: "user:1" }).presented({ eventId: "evt", type: "lesson_complete" }); assert.equal(createSeenState({ storage, namespace: "user:1" }).has("evt"), true); });
test("different users are isolated", () => { const storage = memory(); createSeenState({ storage, namespace: "user:1" }).presented({ eventId: "evt", type: "lesson_complete" }); assert.equal(createSeenState({ storage, namespace: "user:2" }).has("evt"), false); });
test("corrupt storage recovers", () => { const storage = memory(); storage.setItem("bilkeys:celebrations:v1:user:1", "{"); assert.deepEqual(createSeenState({ storage, namespace: "user:1" }).entries(), []); });
test("expired entries are cleaned", () => { const storage = memory(); let now = 100_000_000; const state = createSeenState({ storage, namespace: "u", retentionDays: 1, now: () => now }); state.presented({ eventId: "old", type: "lesson_complete" }); now += 2 * 86400000; assert.equal(state.has("old"), false); });
test("dismissal is recorded separately", () => { const storage = memory(); const state = createSeenState({ storage, namespace: "u" }); state.presented({ eventId: "evt", type: "course_complete" }); state.dismissed("evt"); assert.equal(typeof state.entries()[0].dismissedAt, "number"); });
