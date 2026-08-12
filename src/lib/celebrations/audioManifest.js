export const SOUND_KEYS = Object.freeze([
  "lesson_complete", "achievement_unlock", "streak_extended", "streak_milestone", "course_complete",
]);

const categories = {
  lesson_complete: "progress", achievement_unlock: "achievement", streak_extended: "streak",
  streak_milestone: "streak", course_complete: "achievement",
};

const sources = {
  lesson_complete: "/audio/celebration-power-up.ogg",
  achievement_unlock: "/audio/achievement-unlock.ogg",
  streak_extended: "/audio/celebration-power-up.ogg",
  streak_milestone: "/audio/achievement-unlock.ogg",
  course_complete: "/audio/achievement-unlock.ogg",
};

export const audioAssetManifest = Object.freeze(SOUND_KEYS.map((key) => Object.freeze({
  key, src: sources[key], category: categories[key], enabled: true, preload: "metadata", volume: 0.7, maxDurationMs: 8_000,
})));

export function validateAudioManifest(entries = audioAssetManifest) {
  const seen = new Set();
  for (const item of entries) {
    if (!SOUND_KEYS.includes(item.key)) throw new Error(`Unknown sound key: ${item.key}`);
    if (seen.has(item.key)) throw new Error(`Duplicate sound key: ${item.key}`);
    if (!(item.volume >= 0 && item.volume <= 1)) throw new Error(`Invalid volume: ${item.key}`);
    if (item.enabled && !item.src) throw new Error(`Enabled sound has no source: ${item.key}`);
    seen.add(item.key);
  }
  for (const key of SOUND_KEYS) if (!seen.has(key)) throw new Error(`Missing sound key: ${key}`);
  return true;
}

export function getAudioAsset(key) {
  return audioAssetManifest.find((item) => item.key === key) || null;
}
