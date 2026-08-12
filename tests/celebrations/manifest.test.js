import test from "node:test";
import assert from "node:assert/strict";
import { audioAssetManifest, getAudioAsset, SOUND_KEYS, validateAudioManifest } from "../../src/lib/celebrations/audioManifest.js";

test("manifest has every required key and validates", () => { assert.deepEqual(audioAssetManifest.map((x) => x.key), SOUND_KEYS); assert.equal(validateAudioManifest(), true); });
test("all production assets are enabled OGG files", () => { for (const item of audioAssetManifest) { assert.equal(item.enabled, true); assert.match(item.src, /^\/audio\/.+\.ogg$/); } });
test("duplicate keys fail", () => assert.throws(() => validateAudioManifest([...audioAssetManifest, audioAssetManifest[0]]), /Duplicate/));
test("invalid volume fails", () => assert.throws(() => validateAudioManifest(audioAssetManifest.map((x, i) => i ? x : { ...x, volume: 2 })), /Invalid volume/));
test("unknown keys are safe", () => assert.equal(getAudioAsset("unknown"), null));
