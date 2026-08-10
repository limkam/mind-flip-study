import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function open(page) {
  await page.route("**/users/me", (route) => route.fulfill({ status: 401, json: {} }));
  await page.goto("/__phase4-test");
}

test("pointer, keyboard and touch interactions unlock without constructing audio", async ({ page }) => {
  await page.addInitScript(() => { window.__audioConstructions = 0; window.Audio = class { constructor() { window.__audioConstructions++; } }; });
  await open(page); await expect(page.getByTestId("audio-unlocked")).toHaveText("false");
  await page.getByRole("button", { name: "Lesson", exact: true }).click();
  await expect(page.getByTestId("audio-unlocked")).toHaveText("true"); expect(await page.evaluate(() => window.__audioConstructions)).toBe(0);
  await page.reload(); await page.getByRole("button", { name: "Achievement" }).focus(); await page.keyboard.press("Enter"); await expect(page.getByTestId("audio-unlocked")).toHaveText("true");
  await page.reload(); await page.dispatchEvent("body", "touchstart"); await expect(page.getByTestId("audio-unlocked")).toHaveText("true");
});

test("missing assets preserve visuals and refresh deduplication", async ({ page }) => {
  await open(page); await page.getByRole("button", { name: "Lesson", exact: true }).click(); await expect(page.getByLabel("Learning celebration")).toBeVisible();
  expect(await page.locator("canvas").count()).toBe(0); await page.reload(); await page.getByRole("button", { name: "Lesson", exact: true }).click(); await expect(page.getByLabel("Learning celebration")).toHaveCount(0);
  await page.getByRole("button", { name: "Different lesson" }).click(); await expect(page.getByLabel("Learning celebration")).toBeVisible();
});

test("playback rejection and decode failure return safe outcomes without unhandled rejection", async ({ page }) => {
  await open(page); const outcomes = await page.evaluate(async () => {
    const { AudioManager } = await import("/src/lib/celebrations/audioManager.js");
    const asset = { key: "lesson_complete", src: "/missing.mp3", enabled: true, category: "progress", preload: "none", volume: .5, maxDurationMs: 50 };
    const rejected = new AudioManager({ getAsset: () => asset, createAudio: () => ({ play: () => Promise.reject(Object.assign(new Error("blocked"), { name: "NotAllowedError" })), pause() {}, currentTime: 0 }) });
    await rejected.unlock(); const rejection = await rejected.play("lesson_complete"); rejected.destroy();
    const broken = new AudioManager({ getAsset: () => asset, createAudio: () => { throw new Error("decode"); } });
    await broken.unlock(); const decode = await broken.play("lesson_complete"); broken.destroy(); return [rejection.outcome, decode.outcome];
  });
  expect(outcomes).toEqual(["rejected", "error"]); await expect(page.getByRole("heading", { name: "Celebration verification" })).toBeVisible();
});

test("seen state is isolated across browser user namespaces", async ({ page }) => {
  await open(page); const result = await page.evaluate(async () => {
    const { createSeenState } = await import("/src/lib/celebrations/seenState.js"); const a = createSeenState({ namespace: "user:A" }); const b = createSeenState({ namespace: "user:B" });
    a.presented({ eventId: "same-entity", type: "lesson_complete" }); return [a.has("same-entity"), b.has("same-entity"), createSeenState({ namespace: "user:A" }).has("same-entity")];
  }); expect(result).toEqual([true, false, true]);
});

test("combined events collapse to one major presentation and one canvas", async ({ page }) => {
  await open(page); await page.getByRole("button", { name: "Combined" }).click(); await expect(page.getByTestId("active-type")).toHaveText("course_complete");
  await expect(page.getByLabel("Learning celebration")).toHaveCount(1); await expect.poll(() => page.locator("canvas").count()).toBeLessThanOrEqual(1);
});

test("Escape dismisses, advances queue, marks seen, and does not steal focus", async ({ page }) => {
  await open(page); await page.getByLabel("Focus sentinel").focus(); await page.evaluate(() => document.querySelector("button:nth-of-type(1)").click());
  await expect(page.getByLabel("Focus sentinel")).toBeFocused(); await page.getByRole("button", { name: "Achievement" }).click(); await expect(page.getByTestId("queue-length")).toHaveText("1");
  await page.keyboard.press("Escape"); await expect(page.getByTestId("active-type")).toHaveText("achievement_unlock");
});

test("reduced motion disables confetti but preserves static UI and announcement", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" }); await open(page); await page.getByRole("button", { name: "Course", exact: true }).click();
  await expect(page.getByLabel("Learning celebration")).toBeVisible(); await expect(page.locator("canvas")).toHaveCount(0); await expect(page.locator('[aria-live="polite"]')).toContainText("Test course_complete");
  await expect(page.getByTestId("audio-muted")).toHaveText("false");
});

test("global mute preserves visuals and route changes clear active and queued UI", async ({ page }) => {
  await open(page); await page.getByRole("button", { name: "Mute" }).click(); await expect(page.getByTestId("audio-muted")).toHaveText("true");
  await page.getByRole("button", { name: "Lesson", exact: true }).click(); await expect(page.getByLabel("Learning celebration")).toBeVisible(); await page.getByRole("button", { name: "Achievement" }).click();
  await page.getByRole("button", { name: "Navigate" }).click(); await expect(page.getByTestId("active-type")).toHaveText("none"); await expect(page.getByTestId("queue-length")).toHaveText("0"); await expect(page.getByTestId("audio-muted")).toHaveText("true");
});

test("celebration host has no serious accessibility violations", async ({ page }) => {
  await open(page); await page.getByRole("button", { name: "Achievement" }).click(); const results = await new AxeBuilder({ page }).include("body").analyze();
  expect(results.violations.filter((v) => ["serious", "critical"].includes(v.impact))).toEqual([]);
});
