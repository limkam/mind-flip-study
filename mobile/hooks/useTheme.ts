import { DarkTheme as NavDarkTheme, DefaultTheme as NavDefaultTheme, type Theme as NavigationTheme } from "@react-navigation/native";
import { useColorScheme } from "react-native";

import { TOKENS, type ThemeColorTokens } from "../theme/tokens";
import { useStorageString } from "./useStorageString";
import { useAuthStore } from "../store/authStore";

export type ThemeColors = {
  [K in keyof ThemeColorTokens]: string;
} & {
  text: string;
  muted: string;
};

export type BrandGradient = [string, string];

export type BrandElevation = {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
};

const LIGHT: ThemeColors = {
  ...TOKENS.colors.light,
  text: TOKENS.colors.light.textPrimary,
  muted: TOKENS.colors.light.textMuted,
};

const DARK: ThemeColors = {
  ...TOKENS.colors.dark,
  text: TOKENS.colors.dark.textPrimary,
  muted: TOKENS.colors.dark.textMuted,
};

function buildNavigationTheme(isDark: boolean, colors: ThemeColors): NavigationTheme {
  const base = isDark ? NavDarkTheme : NavDefaultTheme;
  return {
    ...base,
    dark: isDark,
    colors: {
      ...base.colors,
      primary: colors.primary,
      background: colors.background,
      card: colors.surfaceElevated,
      text: colors.textPrimary,
      border: colors.border,
      notification: colors.danger,
    },
  };
}

function buildBrandElevation(isDark: boolean, colors: ThemeColors): BrandElevation {
  return {
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: isDark ? 0.45 : 0.28,
    shadowRadius: 24,
    elevation: 10,
  };
}

export function useTheme() {
  const systemScheme = useColorScheme();
  const user = useAuthStore((state) => state.user);
  const userId = user?.id ?? "anonymous";
  const preferredScheme = user?.preferences?.color_scheme;
  const [savedScheme, setSavedScheme] = useStorageString(`color-scheme:${userId}`);

  const scheme = (savedScheme === "system"
    ? systemScheme
    : savedScheme === "dark" || savedScheme === "light"
      ? savedScheme
      : preferredScheme === "dark" || preferredScheme === "light"
        ? preferredScheme
        : systemScheme) || "light";
  const mode = savedScheme === "dark" || savedScheme === "light" || savedScheme === "system"
    ? savedScheme
    : preferredScheme === "dark" || preferredScheme === "light"
      ? preferredScheme
      : "system";

  const isDark = scheme === "dark";
  const colors = isDark ? DARK : LIGHT;
  const gradients = {
    brand: (isDark ? TOKENS.gradients.dark.brand : TOKENS.gradients.light.brand) as BrandGradient,
  };

  return {
    scheme: scheme as "light" | "dark",
    mode: mode as "light" | "dark" | "system",
    colors,
    tokens: TOKENS,
    isDark,
    gradients,
    elevationBrand: buildBrandElevation(isDark, colors),
    navigationTheme: buildNavigationTheme(isDark, colors),
    toggleScheme: () => setSavedScheme(scheme === "dark" ? "light" : "dark"),
    setScheme: (next: "light" | "dark" | "system") => {
      setSavedScheme(next);
    },
  };
}
