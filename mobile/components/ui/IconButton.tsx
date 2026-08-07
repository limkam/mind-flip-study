import { Ionicons } from "@expo/vector-icons";
import { type ReactNode } from "react";
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from "react-native";

import { useTheme } from "../../hooks/useTheme";
import { hapticImpact } from "../../lib/haptics";
import { TOKENS } from "../../theme/tokens";

export type IconButtonVariant = "ghost" | "filled" | "outlined";
export type IconButtonSize = "sm" | "md" | "lg";

type Props = {
  icon: keyof typeof Ionicons.glyphMap | ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  disabled?: boolean;
  color?: string;
  style?: StyleProp<ViewStyle>;
};

export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  variant = "ghost",
  size = "md",
  disabled = false,
  color,
  style,
}: Props) {
  const { colors, isDark } = useTheme();

  const getSizeParams = () => {
    switch (size) {
      case "sm":
        return { containerSize: 44, iconSize: 18 };
      case "lg":
        return { containerSize: 52, iconSize: 24 };
      case "md":
      default:
        return { containerSize: 44, iconSize: 20 };
    }
  };

  const params = getSizeParams();

  const handlePress = () => {
    if (disabled) return;
    void hapticImpact("light");
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      style={({ pressed }) => {
        let bg = "transparent";
        let border = "transparent";
        let defaultIconColor = color ?? colors.textPrimary;

        if (variant === "filled") {
          bg = pressed ? colors.borderStrong : colors.surfaceElevated;
        } else if (variant === "outlined") {
          bg = pressed ? `${colors.primary}15` : "transparent";
          border = colors.border;
        } else if (pressed) {
          bg = `${colors.primary}15`;
        }

        return [
          styles.base,
          {
            width: params.containerSize,
            height: params.containerSize,
            borderRadius: TOKENS.radii.md,
            backgroundColor: bg,
            borderColor: border,
            borderWidth: variant === "outlined" ? 1 : 0,
            opacity: disabled ? (isDark ? 0.4 : 0.5) : 1,
          },
          style,
        ];
      }}
    >
      {typeof icon === "string" ? (
        <Ionicons
          name={icon as keyof typeof Ionicons.glyphMap}
          size={params.iconSize}
          color={color ?? colors.textPrimary}
        />
      ) : (
        icon
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 44,
    minHeight: 44,
  },
});
