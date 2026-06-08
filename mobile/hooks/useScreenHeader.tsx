import { Stack } from "expo-router";

import { useTheme } from "./useTheme";

export function useScreenHeader(title: string) {
  const { colors } = useTheme();

  return (
    <Stack.Screen
      options={{
        headerShown: true,
        title,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}
