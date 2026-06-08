import { useColorScheme } from "react-native";

import { useStorageString } from "./useStorageString";

export type ThemeColors = {
  background: string;
  surface: string;
  text: string;
  muted: string;
  primary: string;
  border: string;
  success: string;
  warning: string;
  danger: string;
  skeleton: string;
  cardFront: string;
  cardBack: string;
};

const LIGHT: ThemeColors = {
  background: "#ffffff",
  surface: "#f8fafc",
  text: "#0f172a",
  muted: "#64748b",
  primary: "#6366f1",
  border: "#e2e8f0",
  success: "#047857",
  warning: "#b45309",
  danger: "#b91c1c",
  skeleton: "#e2e8f0",
  cardFront: "#ffffff",
  cardBack: "#f0f4ff",
};

const DARK: ThemeColors = {
  background: "#0f172a",
  surface: "#1e293b",
  text: "#f1f5f9",
  muted: "#94a3b8",
  primary: "#818cf8",
  border: "#334155",
  success: "#34d399",
  warning: "#fbbf24",
  danger: "#f87171",
  skeleton: "#334155",
  cardFront: "#1e293b",
  cardBack: "#312e81",
};

export function useTheme() {
  const systemScheme = useColorScheme();
  const [savedScheme, setSavedScheme] = useStorageString("color-scheme");

  const scheme = (savedScheme === "dark" || savedScheme === "light"
    ? savedScheme
    : systemScheme) || "light";

  const colors = scheme === "dark" ? DARK : LIGHT;

  return {
    scheme: scheme as "light" | "dark",
    colors,
    isDark: scheme === "dark",
    toggleScheme: () => setSavedScheme(scheme === "dark" ? "light" : "dark"),
    setScheme: (next: "light" | "dark" | "system") => {
      if (next === "system") setSavedScheme(undefined);
      else setSavedScheme(next);
    },
  };
}
