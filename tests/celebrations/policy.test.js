import test from "node:test";
import assert from "node:assert/strict";
import { aggregateCelebrations, celebrationLevel, mayUseConfetti, normaliseCelebration } from "../../src/lib/celebrations/policy.js";

test("every event maps deterministically", () => { assert.equal(celebrationLevel("lesson_complete"), "subtle"); assert.equal(celebrationLevel("achievement_unlock"), "medium"); assert.equal(celebrationLevel("course_complete"), "major"); });
test("streak threshold policy", () => { assert.equal(celebrationLevel("streak_milestone", { streakDays: 3 }), "subtle"); assert.equal(celebrationLevel("streak_milestone", { streakDays: 7 }), "medium"); assert.equal(celebrationLevel("streak_milestone", { streakDays: 30 }), "major"); });
test("confetti is major and allowlisted only", () => { assert.equal(mayUseConfetti(normaliseCelebration({ eventId: "1", type: "lesson_complete" })), false); assert.equal(mayUseConfetti(normaliseCelebration({ eventId: "2", type: "course_complete" })), true); });
test("combined completion chooses one course event and retains IDs", () => { const result = aggregateCelebrations([{ eventId: "lesson", type: "lesson_complete" }, { eventId: "award", type: "achievement_unlock" }, { eventId: "course", type: "course_complete" }]); assert.equal(result.eventId, "course"); assert.deepEqual(result.relatedEventIds, ["lesson", "award", "course"]); });
test("untrusted payload is ignored", () => { assert.equal(normaliseCelebration({ eventId: "", type: "course_complete" }), null); assert.equal(normaliseCelebration({ eventId: "x", type: "made_up" }), null); });
