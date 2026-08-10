export const EVENT_TYPES = Object.freeze(["lesson_complete", "achievement_unlock", "streak_extended", "streak_milestone", "course_complete"]);
const rank = { subtle: 1, medium: 2, major: 3 };
export const DEFAULT_SOUND = Object.freeze({ lesson_complete: "lesson_complete", achievement_unlock: "achievement_unlock", streak_extended: "streak_extended", streak_milestone: "streak_milestone", course_complete: "course_complete" });

export function celebrationLevel(type, metadata = {}) {
  if (type === "course_complete") return "major";
  if (type === "achievement_unlock") return metadata.major === true ? "major" : "medium";
  if (type === "streak_milestone") { const days = Number(metadata.streakDays || 0); return days >= 30 ? "major" : days >= 7 ? "medium" : "subtle"; }
  return "subtle";
}
export function normaliseCelebration(input) {
  if (!input || !EVENT_TYPES.includes(input.type) || typeof input.eventId !== "string" || !input.eventId.trim()) return null;
  const level = input.level || celebrationLevel(input.type, input.metadata);
  if (!rank[level]) return null;
  return { ...input, level, soundKey: input.soundKey || DEFAULT_SOUND[input.type], occurredAt: input.occurredAt || new Date().toISOString() };
}
export function aggregateCelebrations(events) {
  const valid = events.map(normaliseCelebration).filter(Boolean);
  if (!valid.length) return null;
  const winner = [...valid].sort((a, b) => rank[b.level] - rank[a.level] || EVENT_TYPES.indexOf(b.type) - EVENT_TYPES.indexOf(a.type))[0];
  return { ...winner, relatedEventIds: [...new Set(valid.map((event) => event.eventId))], metadata: { ...winner.metadata, collapsedCount: valid.length - 1 } };
}
export function mayUseConfetti(event) { return event?.level === "major" && (event.type === "course_complete" || event.type === "streak_milestone" || event.metadata?.major === true); }
