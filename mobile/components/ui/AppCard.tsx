import { type ReactNode } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { useTheme } from "../../hooks/useTheme";
import { hapticImpact } from "../../lib/haptics";
import { TOKENS } from "../../theme/tokens";

export type CardVariant = "standard" | "elevated" | "interactive" | "outlined";

type Props = {
  children: ReactNode;
  variant?: CardVariant;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
};

export function AppCard({
  children,
  variant = "standard",
  onPress,
  accessibilityLabel,
  accessibilityHint,
  style,
}: Props) {
  const { colors, isDark } = useTheme();

  const getVariantStyles = (pressed: boolean) => {
    switch (variant) {
      case "elevated":
        return {
          backgroundColor: isDark ? colors.surfaceElevated : colors.surface,
          borderColor: colors.border,
          borderWidth: 1,
          ...TOKENS.elevation.raised,
        };
      case "interactive":
        return {
          backgroundColor: pressed
            ? isDark
              ? colors.surfaceElevated
              : colors.surfaceMuted
            : colors.surface,
          borderColor: pressed ? colors.primaryMuted : colors.border,
          borderWidth: 1,
          ...(pressed ? TOKENS.elevation.raised : TOKENS.elevation.flat),
        };
      case "outlined":
        return {
          backgroundColor: "transparent",
          borderColor: colors.borderStrong,
          borderWidth: 1,
          ...TOKENS.elevation.flat,
        };
      case "standard":
      default:
        return {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: 1,
          ...TOKENS.elevation.flat,
        };
    }
  };

  const handlePress = () => {
    if (!onPress) return;
    void hapticImpact("light");
    onPress();
  };

  if (onPress || variant === "interactive") {
    return (
      <Pressable
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        style={({ pressed }) => [styles.card, getVariantStyles(pressed), style]}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <View style={[styles.card, getVariantStyles(false), style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: TOKENS.radii.lg,
    padding: TOKENS.spacing.lg,
  },
});
