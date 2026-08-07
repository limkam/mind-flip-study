/**
 * MindFlip Mobile Design Tokens
 * Centralized semantic design tokens for the MindFlip mobile application.
 */

export const TOKENS = {
  colors: {
    brand: {
      primary: "#4f46e5", // Indigo 600
      primaryMuted: "#818cf8", // Indigo 400
      primaryPressed: "#4338ca", // Indigo 700
      primarySoft: "#e0e7ff", // Indigo 100
      accent: "#ec4899", // Pink 500
    },
    light: {
      background: "#ffffff",
      surface: "#f8fafc",
      surfaceElevated: "#ffffff",
      surfaceMuted: "#f1f5f9",
      textPrimary: "#0f172a",
      textSecondary: "#334155",
      textMuted: "#64748b",
      border: "#e2e8f0",
      borderStrong: "#cbd5e1",
      primary: "#4f46e5",
      primaryMuted: "#818cf8",
      primaryPressed: "#4338ca",
      primarySoft: "#e0e7ff",
      success: "#047857",
      warning: "#b45309",
      danger: "#b91c1c",
      info: "#0284c7",
      xp: "#d97706",
      streak: "#ea580c",
      overlay: "rgba(15, 23, 42, 0.4)",
      skeleton: "#e2e8f0",
      cardFront: "#ffffff",
      cardBack: "#f0f4ff",
    },
    dark: {
      background: "#0f172a",
      surface: "#1e293b",
      surfaceElevated: "#334155",
      surfaceMuted: "#1e293b",
      textPrimary: "#f1f5f9",
      textSecondary: "#cbd5e1",
      textMuted: "#94a3b8",
      border: "#334155",
      borderStrong: "#475569",
      primary: "#818cf8",
      primaryMuted: "#a5b4fc",
      primaryPressed: "#6366f1",
      primarySoft: "#312e81",
      success: "#34d399",
      warning: "#fbbf24",
      danger: "#f87171",
      info: "#38bdf8",
      xp: "#fbbf24",
      streak: "#f97316",
      overlay: "rgba(0, 0, 0, 0.6)",
      skeleton: "#334155",
      cardFront: "#1e293b",
      cardBack: "#312e81",
    },
  },
  typography: {
    display: {
      fontSize: 32,
      lineHeight: 38,
      fontWeight: "800" as const,
    },
    screenTitle: {
      fontSize: 24,
      lineHeight: 30,
      fontWeight: "800" as const,
    },
    sectionTitle: {
      fontSize: 18,
      lineHeight: 24,
      fontWeight: "700" as const,
    },
    cardTitle: {
      fontSize: 16,
      lineHeight: 22,
      fontWeight: "700" as const,
    },
    body: {
      fontSize: 15,
      lineHeight: 22,
      fontWeight: "400" as const,
    },
    bodyEmphasis: {
      fontSize: 15,
      lineHeight: 22,
      fontWeight: "600" as const,
    },
    secondaryBody: {
      fontSize: 14,
      lineHeight: 20,
      fontWeight: "400" as const,
    },
    label: {
      fontSize: 13,
      lineHeight: 18,
      fontWeight: "600" as const,
    },
    caption: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "500" as const,
    },
    buttonLabel: {
      fontSize: 15,
      lineHeight: 20,
      fontWeight: "700" as const,
    },
    metric: {
      fontSize: 28,
      lineHeight: 34,
      fontWeight: "800" as const,
    },
    metricLabel: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "600" as const,
    },
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
    xxxl: 40,
  },
  radii: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    pill: 9999,
    circular: 9999,
  },
  elevation: {
    flat: {
      shadowColor: "transparent",
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
    },
    raised: {
      shadowColor: "#0f172a",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 6,
      elevation: 3,
    },
    floating: {
      shadowColor: "#0f172a",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.14,
      shadowRadius: 12,
      elevation: 8,
    },
    sheet: {
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.18,
      shadowRadius: 16,
      elevation: 12,
    },
  },
  motion: {
    duration: {
      instant: 0,
      fast: 150,
      standard: 250,
      deliberate: 400,
    },
    spring: {
      tight: { damping: 20, stiffness: 200 },
      standard: { damping: 15, stiffness: 120 },
      gentle: { damping: 12, stiffness: 80 },
    },
  },
  layout: {
    minTouchTarget: 44,
  },
} as const;

export type ThemeMode = "light" | "dark";
export type ThemeColorTokens = typeof TOKENS.colors.light;
