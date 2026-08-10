import { getAudioAsset } from "./audioManifest.js";

export const SOUND_PRIORITY = Object.freeze({ lesson_complete: 1, streak_extended: 2, achievement_unlock: 3, streak_milestone: 4, course_complete: 5 });

export class AudioManager {
  /** @param {{createAudio?: (src: string) => any, preferences?: Record<string, boolean>, onOutcome?: (result: any) => void, getAsset?: (key: string) => any}=} options */
  constructor({ createAudio, preferences, onOutcome, getAsset = getAudioAsset } = {}) {
    this.createAudio = createAudio || ((src) => new Audio(src));
    this.preferences = { globalMuted: false, achievement: false, streak: false, ...preferences };
    this.onOutcome = onOutcome || (() => {});
    this.getAsset = getAsset;
    this.cache = new Map(); this.loading = new Map(); this.active = null; this.unlocked = false; this.destroyed = false;
  }
  result(outcome, soundKey) { const value = { outcome, soundKey }; this.onOutcome(value); return value; }
  isUnlocked() { return this.unlocked; }
  isMuted() { return this.preferences.globalMuted; }
  async unlock() { if (typeof window === "undefined" || this.destroyed) return false; this.unlocked = true; return true; }
  setPreferences(next) {
    this.preferences = { ...this.preferences, ...next };
    if (this.preferences.globalMuted || (this.active && !this.categoryAllowed(this.active.asset.category))) this.stop("preference_changed");
  }
  setGlobalMute(muted) { this.setPreferences({ globalMuted: muted }); }
  categoryAllowed(category) {
    if (this.preferences.globalMuted) return false;
    if (category === "achievement") return this.preferences.achievement;
    if (category === "streak") return this.preferences.streak;
    return true;
  }
  async preload(key) {
    const asset = this.getAsset(key);
    if (!asset?.src) return this.result("asset_missing", key);
    if (!asset.enabled) return this.result("asset_disabled", key);
    if (typeof window === "undefined") return this.result("asset_disabled", key);
    if (this.cache.has(key)) return this.result("ready", key);
    if (this.loading.has(key)) return this.loading.get(key);
    const load = Promise.resolve().then(() => {
      const audio = this.createAudio(asset.src); audio.preload = asset.preload; audio.volume = asset.volume;
      this.cache.set(key, audio); return this.result("ready", key);
    }).catch(() => this.result("error", key)).finally(() => this.loading.delete(key));
    this.loading.set(key, load); return load;
  }
  async play(key) {
    const asset = this.getAsset(key);
    if (!asset) return this.result("asset_missing", key);
    if (!asset.src) return this.result("asset_missing", key);
    if (!asset.enabled) return this.result("asset_disabled", key);
    if (this.preferences.globalMuted) return this.result("muted", key);
    if (!this.categoryAllowed(asset.category)) return this.result("category_disabled", key);
    if (!this.unlocked) return this.result("locked", key);
    if (this.active) {
      if (this.active.key === key || SOUND_PRIORITY[key] <= SOUND_PRIORITY[this.active.key]) return this.result("already_playing", key);
      this.stop("priority_replaced");
    }
    const loaded = await this.preload(key);
    if (loaded.outcome !== "ready" || this.destroyed) return loaded;
    const audio = this.cache.get(key);
    this.active = { key, asset, audio, timer: null };
    audio.onended = () => { if (this.active?.audio === audio) this.active = null; };
    try {
      await Promise.resolve(audio.play());
      if (this.active?.audio === audio) this.active.timer = setTimeout(() => this.stop("duration_limit"), asset.maxDurationMs);
      return this.result("played", key);
    } catch (error) {
      if (this.active?.audio === audio) this.active = null;
      return this.result(error?.name === "NotAllowedError" ? "rejected" : "error", key);
    }
  }
  stop(reason = "stopped") {
    const active = this.active; this.active = null;
    if (!active) return;
    clearTimeout(active.timer); active.audio.onended = null;
    try { active.audio.pause(); active.audio.currentTime = 0; } catch { /* detached media */ }
    this.result("stopped", active.key); void reason;
  }
  destroy() { this.destroyed = true; this.stop("unmount"); this.cache.clear(); this.loading.clear(); }
}
