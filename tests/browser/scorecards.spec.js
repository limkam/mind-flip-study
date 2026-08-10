import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const metrics = (overrides = {}) => ({ assessments_completed: 2, average_assessment_score: 80, learning_minutes: 20, cards_reviewed: 8, active_days: 3, current_streak: 2, longest_streak: 4, available_days: 7, data_state: "complete", personal_best: false,
  component_scores: { accuracy: 80, consistency: 43, activity: 40, healthy_time: 13 }, component_weights: { accuracy: 40, consistency: 30, activity: 20, healthy_time: 10 },
  metric_explanations: { accuracy: "Average assessment accuracy.", consistency: "Recorded active days.", activity: "Completed assessments.", healthy_time: "Recorded learning time." }, comparison: { score_delta: 3, direction: "up", component_deltas: { accuracy: 5, consistency: 0, activity: 10, healthy_time: 0 }, most_improved_skill: "activity" }, ...overrides });
const card = (id, period_type, score, extra = {}) => ({ id, period_type, entity_id: extra.entity_id || "", period_start: "2026-07-01", period_end: "2026-07-29", score, formula_version: extra.formula_version || "v2", metrics: metrics(extra.metrics), visibility: "private", public_share_token: `${id}-token-token-token-token-token-token`, expires_at: null });

async function setup(page, { holdRefresh = false } = {}) {
  let cards = [card("weekly", "weekly", 55), { ...card("weekly-old", "weekly", 42, { formula_version: "v1" }), period_start: "2026-06-23", period_end: "2026-06-29" }, card("monthly", "monthly", 0, { metrics: { data_state: "empty", assessments_completed: 0, cards_reviewed: 0 } }), card("course-a", "course", 20, { entity_id: "course-a", metrics: { data_state: "partial", course_title: "Biology", assessments_completed: 0, average_assessment_score: null } }), card("course-b", "course", 70, { entity_id: "course-b", metrics: { course_title: "Chemistry" } })];
  let refreshCalls = 0; let generateCalls = 0;
  let shareCounter = 0;
  let releaseRefresh; const refreshGate = new Promise((resolve) => { releaseRefresh = resolve; });
  await page.addInitScript(() => { localStorage.setItem("mindflip_access_token", "test-token"); localStorage.setItem("mindflip_remember_me", "true"); });
  await page.route("http://localhost:8000/**", async (route) => {
    const url = new URL(route.request().url()); const method = route.request().method();
    if (url.pathname === "/users/me") return route.fulfill({ json: { id: "user-1", full_name: "Ada Learner", onboarding_completed: true, preferences: { settings: {} } } });
    if (url.pathname === "/scorecards/" && method === "GET") return route.fulfill({ json: cards });
    if (url.pathname === "/scorecards/refresh" && method === "POST") { refreshCalls++; if (holdRefresh) await refreshGate; cards = cards.map((item) => item.id === "weekly" ? card("weekly", "weekly", 61, { metrics: { comparison: { score_delta: 9, direction: "up", component_deltas: { accuracy: 5, consistency: 4, activity: 20, healthy_time: 0 }, most_improved_skill: "activity" }, personal_best: true } }) : item); return route.fulfill({ json: cards }); }
    if (url.pathname === "/scorecards/generate") { generateCalls++; return route.fulfill({ status: 500, json: {} }); }
    if (/^\/scorecards\/[^/]+\/share$/.test(url.pathname) && method === "POST") { shareCounter++; const body = route.request().postDataJSON(); return route.fulfill({ status: 201, json: { id: `00000000-0000-0000-0000-${String(shareCounter).padStart(12, "0")}`, share_url: `http://127.0.0.1:58126/share/scorecard/public-token-${shareCounter}`, expires_at: "2026-08-30T12:00:00Z", show_display_name: body.show_display_name } }); }
    if (/^\/scorecards\/[^/]+\/share\/[^/]+$/.test(url.pathname) && method === "DELETE") return route.fulfill({ json: { revoked: true } });
    if (url.pathname === "/billing/entitlements") return route.fulfill({ json: { features: {} } });
    if (url.pathname.includes("unread-count")) return route.fulfill({ json: { count: 0 } });
    return route.fulfill({ json: url.pathname.includes("summary") ? {} : [] });
  });
  return { counts: () => ({ refreshCalls, generateCalls }), cards: () => cards, releaseRefresh };
}

test("owner creates, copies, revokes, and regenerates an explicitly consented share", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await setup(page); await page.goto("/scorecards");
  await expect(page.getByRole("button", { name: /generate/i })).toHaveCount(0);
  const consent = page.getByRole("checkbox", { name: "Share a public display name" });
  await expect(consent).not.toBeChecked();
  await page.getByLabel("Expires after").selectOption("7");
  await consent.check(); await page.getByRole("textbox", { name: "Public display name" }).fill("Public Ada");
  await page.getByRole("button", { name: "Create and copy link" }).click();
  await expect(page.getByLabel("Share URL")).toHaveValue(/public-token-1/);
  await expect(page.getByRole("button", { name: "Copy link" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Share image" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Whatsapp" })).toHaveCount(0);
  await page.getByRole("button", { name: "Revoke" }).click();
  await expect(page.getByRole("button", { name: "Create and copy link" })).toBeVisible();
  const accessibility = await new AxeBuilder({ page }).include("#scorecard-share-controls").analyze();
  expect(accessibility.violations.filter((item) => ["serious", "critical"].includes(item.impact))).toEqual([]);
});

test("persisted weekly card appears before background refresh replaces it", async ({ page }) => {
  const server = await setup(page, { holdRefresh: true }); await page.goto("/scorecards");
  await expect(page.getByRole("region", { name: "Weekly scorecard" })).toContainText("55"); await expect(page.getByRole("region", { name: "Weekly scorecard" })).toContainText("Formula v2");
  server.releaseRefresh();
  await expect(page.getByRole("region", { name: "Weekly scorecard" })).toContainText("61"); expect(server.counts()).toEqual({ refreshCalls: 1, generateCalls: 0 });
  await expect(page.getByText("Most improved skill: Assessment activity")).toBeVisible(); await expect(page.getByText("Personal best")).toBeVisible();
});

test("monthly empty and independent course partial/populated states render safely", async ({ page }) => {
  await setup(page); await page.goto("/scorecards"); await page.getByRole("tab", { name: "Monthly" }).click(); await expect(page.getByText("No study activity yet")).toBeVisible();
  await page.getByRole("tab", { name: "Course" }).click(); await expect(page.getByLabel("Available course scorecards")).toBeVisible();
  await expect(page.getByText("Partial score:")).toBeVisible(); await page.getByLabel("Available course scorecards").selectOption("course-b"); await expect(page.getByRole("heading", { name: "Chemistry" })).toBeVisible();
});

test("component breakdown is omitted while persisted formula version remains visible", async ({ page }) => {
  await setup(page); await page.goto("/scorecards");
  await expect(page.getByText("80/100 · 40%", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Average assessment accuracy.")).toHaveCount(0);
  await page.getByLabel("Available weekly scorecards").selectOption("weekly-old"); await expect(page.getByRole("region", { name: "Weekly scorecard" })).toContainText("Formula v1");
});

test("persisted refreshed score survives reload and navigation without manual generation", async ({ page }) => {
  const server = await setup(page); await page.goto("/scorecards"); await expect(page.getByRole("region", { name: "Weekly scorecard" })).toContainText("61"); await page.reload(); await expect(page.getByRole("region", { name: "Weekly scorecard" })).toContainText("61");
  await page.goto("/library"); await page.goto("/scorecards"); await expect(page.getByRole("region", { name: "Weekly scorecard" })).toContainText("61"); expect(server.counts().generateCalls).toBe(0); await expect(page.getByRole("button", { name: /generate/i })).toHaveCount(0);
});
