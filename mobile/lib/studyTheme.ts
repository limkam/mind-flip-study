/** Study card color themes — mirrors web `src/lib/studyTheme.js`. */

export type StudyThemeId = "indigo" | "ocean" | "sunset" | "forest" | "midnight" | "rose";

export type StudyThemeColors = {
  id: StudyThemeId;
  label: string;
  questionHeader: string;
  answerHeader: string;
  cardFront: string;
  cardBack: string;
};

export const STUDY_THEMES: StudyThemeColors[] = [
  {
    id: "indigo",
    label: "Indigo Classic",
    questionHeader: "#4f46e5",
    answerHeader: "#059669",
    cardFront: "#ffffff",
    cardBack: "#f0f4ff",
  },
  {
    id: "ocean",
    label: "Ocean Blue",
    questionHeader: "#2563eb",
    answerHeader: "#0d9488",
    cardFront: "#ffffff",
    cardBack: "#ecfeff",
  },
  {
    id: "sunset",
    label: "Sunset",
    questionHeader: "#f97316",
    answerHeader: "#d97706",
    cardFront: "#ffffff",
    cardBack: "#fff7ed",
  },
  {
    id: "forest",
    label: "Forest",
    questionHeader: "#15803d",
    answerHeader: "#65a30d",
    cardFront: "#ffffff",
    cardBack: "#f0fdf4",
  },
  {
    id: "midnight",
    label: "Midnight",
    questionHeader: "#6b21a8",
    answerHeader: "#7c3aed",
    cardFront: "#ffffff",
    cardBack: "#faf5ff",
  },
  {
    id: "rose",
    label: "Rose",
    questionHeader: "#f43f5e",
    answerHeader: "#d946ef",
    cardFront: "#ffffff",
    cardBack: "#fff1f2",
  },
];

export function getStudyTheme(themeId?: string | null): StudyThemeColors {
  return STUDY_THEMES.find((t) => t.id === themeId) ?? STUDY_THEMES[0];
}

export function studyThemeFromPreferences(preferences?: Record<string, unknown> | null): StudyThemeColors {
  const id = preferences?.study_theme as string | undefined;
  return getStudyTheme(id);
}
