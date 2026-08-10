import { getStudyTheme, STUDY_THEMES } from "./studyTheme";

// A minimal mapping from study theme id to a set of root CSS variable overrides.
// These values are HSL triples compatible with the existing CSS variables (h s% l%).
/** @type {Record<string, Record<string, string>>} */
const THEME_TOKENS = {
  indigo: {
    "--primary": "258 80% 58%",
    "--theme-highlight": "258 80% 58%",
    "--ring": "258 80% 58%",
    "--accent": "330 85% 58%",
    "--sidebar-background": "252 38% 9%",
    "--sidebar-primary": "258 80% 58%",
  },
  ocean: {
    "--primary": "206 78% 46%",
    "--theme-highlight": "206 78% 46%",
    "--ring": "206 78% 46%",
    "--accent": "170 65% 40%",
    "--sidebar-background": "210 30% 12%",
    "--sidebar-primary": "206 78% 46%",
  },
  sunset: {
    "--primary": "18 86% 54%",
    "--theme-highlight": "18 86% 54%",
    "--ring": "18 86% 54%",
    "--accent": "42 95% 52%",
    "--sidebar-background": "14 60% 8%",
    "--sidebar-primary": "18 86% 54%",
  },
  forest: {
    "--primary": "140 40% 30%",
    "--theme-highlight": "140 40% 38%",
    "--ring": "140 40% 38%",
    "--accent": "84 60% 48%",
    "--sidebar-background": "145 30% 6%",
    "--sidebar-primary": "140 40% 38%",
  },
  midnight: {
    "--primary": "260 50% 22%",
    "--theme-highlight": "270 60% 46%",
    "--ring": "270 60% 46%",
    "--accent": "270 60% 28%",
    "--sidebar-background": "255 30% 6%",
    "--sidebar-primary": "270 60% 46%",
  },
  rose: {
    "--primary": "340 80% 55%",
    "--theme-highlight": "340 80% 55%",
    "--ring": "340 80% 55%",
    "--accent": "300 70% 52%",
    "--sidebar-background": "340 30% 9%",
    "--sidebar-primary": "340 80% 55%",
  },
};

/** @param {string} themeId */
export function applyTheme(themeId) {
  if (typeof document === "undefined") return;
  const tokens = THEME_TOKENS[themeId] || THEME_TOKENS.indigo;
  const root = document.documentElement;
  root.dataset.appTheme = THEME_TOKENS[themeId] ? themeId : "indigo";
  Object.entries(tokens).forEach(([k, v]) => {
    root.style.setProperty(k, v);
  });
}

export function initTheme(themeId = "indigo") {
  if (typeof document === "undefined") return;
  const defaultId = (STUDY_THEMES?.[0]?.id) || "indigo";
  applyTheme(THEME_TOKENS[themeId] ? themeId : defaultId);
}

export function getAvailableThemes() {
  return STUDY_THEMES.map((t) => ({ id: t.id, label: t.label }));
}
