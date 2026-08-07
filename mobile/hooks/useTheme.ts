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

export function useTheme() {
  const systemScheme = useColorScheme();
  const user = useAuthStore((state) => state.user);
  const userId = user?.id ?? "anonymous";
  const preferredScheme = user?.preferences?.color_scheme;
  const [savedScheme, setSavedScheme] = useStorageString(`color-scheme:${userId}`);

  const scheme = (savedScheme === "dark" || savedScheme === "light"
    ? savedScheme
    : preferredScheme === "dark" || preferredScheme === "light"
      ? preferredScheme
    : systemScheme) || "light";

  const colors = scheme === "dark" ? DARK : LIGHT;

  return {
    scheme: scheme as "light" | "dark",
    colors,
    tokens: TOKENS,
    isDark: scheme === "dark",
    toggleScheme: () => setSavedScheme(scheme === "dark" ? "light" : "dark"),
    setScheme: (next: "light" | "dark" | "system") => {
      if (next === "system") setSavedScheme(undefined);
      else setSavedScheme(next);
    },
  };
}
