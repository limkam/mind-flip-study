import test from "node:test";
import assert from "node:assert/strict";
import { AudioManager } from "../../src/lib/celebrations/audioManager.js";

test("SSR unlock is inert", async () => { const manager = new AudioManager(); assert.equal(await manager.unlock(), false); manager.destroy(); });
test("missing approved assets never create Audio", async () => { let creations = 0; const manager = new AudioManager({ createAudio: () => { creations++; } }); assert.equal((await manager.play("lesson_complete")).outcome, "asset_missing"); assert.equal(creations, 0); });
test("unknown key is represented safely", async () => { const manager = new AudioManager(); assert.equal((await manager.play("unknown")).outcome, "asset_missing"); });
test("global mute state applies immediately", () => { const manager = new AudioManager(); manager.setGlobalMute(true); assert.equal(manager.isMuted(), true); });
test("category preferences and progress policy suppress only matching enabled sounds", async () => {
  global.window = {}; const media = { play: async () => {}, pause() {}, currentTime: 0 };
  const assets = { achievement_unlock: { key: "achievement_unlock", src: "/a.mp3", enabled: true, category: "achievement", preload: "none", volume: .5, maxDurationMs: 20 }, streak_extended: { key: "streak_extended", src: "/s.mp3", enabled: true, category: "streak", preload: "none", volume: .5, maxDurationMs: 20 }, lesson_complete: { key: "lesson_complete", src: "/p.mp3", enabled: true, category: "progress", preload: "none", volume: .5, maxDurationMs: 20 } };
  const manager = new AudioManager({ getAsset: (key) => assets[key], createAudio: () => ({ ...media }), preferences: { achievement: false, streak: false } }); await manager.unlock();
  assert.equal((await manager.play("achievement_unlock")).outcome, "category_disabled"); assert.equal((await manager.play("streak_extended")).outcome, "category_disabled"); assert.equal((await manager.play("lesson_complete")).outcome, "played"); manager.destroy(); delete global.window;
});
test("muting during enabled playback stops and resets media", async () => {
  global.window = {}; let paused = 0; const media = { play: async () => {}, pause: () => { paused++; }, currentTime: 3 };
  const asset = { key: "lesson_complete", src: "/p.mp3", enabled: true, category: "progress", preload: "none", volume: .5, maxDurationMs: 100 };
  const manager = new AudioManager({ getAsset: () => asset, createAudio: () => media }); await manager.unlock(); await manager.play("lesson_complete"); manager.setGlobalMute(true);
  assert.equal(paused, 1); assert.equal(media.currentTime, 0); manager.destroy(); delete global.window;
});
