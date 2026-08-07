import { Ionicons } from "@expo/vector-icons";
import { type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
  View,
} from "react-native";

import { useTheme } from "../../hooks/useTheme";
import { hapticImpact } from "../../lib/haptics";
import { TOKENS } from "../../theme/tokens";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
export type ButtonSize = "sm" | "md" | "lg";

type Props = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap | ReactNode;
  iconPosition?: "left" | "right";
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

export function AppButton({
  label,
  onPress,
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  icon,
  iconPosition = "left",
  fullWidth = false,
  style,
  labelStyle,
  accessibilityLabel,
  accessibilityHint,
}: Props) {
  const { colors, isDark } = useTheme();

  const handlePress = () => {
    if (disabled || loading) return;
    void hapticImpact("light");
    onPress();
  };

  const getVariantStyles = (pressed: boolean) => {
    switch (variant) {
      case "secondary":
        return {
          backgroundColor: pressed ? colors.border : colors.surfaceElevated,
          borderColor: colors.borderStrong,
          textColor: colors.textPrimary,
          spinnerColor: colors.textPrimary,
        };
      case "ghost":
        return {
          backgroundColor: pressed ? `${colors.primary}15` : "transparent",
          borderColor: "transparent",
          textColor: colors.primary,
          spinnerColor: colors.primary,
        };
      case "destructive":
        return {
          backgroundColor: pressed ? "#991b1b" : colors.danger,
          borderColor: "transparent",
          textColor: "#ffffff",
          spinnerColor: "#ffffff",
        };
      case "primary":
      default:
        return {
          backgroundColor: pressed ? colors.primaryPressed : colors.primary,
          borderColor: "transparent",
          textColor: "#ffffff",
          spinnerColor: "#ffffff",
        };
    }
  };

  const getSizeStyles = () => {
    switch (size) {
      case "sm":
        return {
          minHeight: 44, // Minimum native touch target height requirement
          paddingHorizontal: TOKENS.spacing.md,
          fontSize: TOKENS.typography.caption.fontSize,
          iconSize: 16,
        };
      case "lg":
        return {
          minHeight: 52,
          paddingHorizontal: TOKENS.spacing.xl,
          fontSize: TOKENS.typography.buttonLabel.fontSize + 1,
          iconSize: 22,
        };
      case "md":
      default:
        return {
          minHeight: 48,
          paddingHorizontal: TOKENS.spacing.lg,
          fontSize: TOKENS.typography.buttonLabel.fontSize,
          iconSize: 18,
        };
    }
  };

  const sizeStyle = getSizeStyles();

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: disabled || loading }}
      style={({ pressed }) => {
        const vStyle = getVariantStyles(pressed);
        return [
          styles.base,
          {
            minHeight: sizeStyle.minHeight,
            paddingHorizontal: sizeStyle.paddingHorizontal,
            backgroundColor: vStyle.backgroundColor,
            borderColor: vStyle.borderColor,
            borderWidth: variant === "secondary" ? 1 : 0,
            opacity: disabled ? (isDark ? 0.4 : 0.5) : 1,
          },
          fullWidth && styles.fullWidth,
          style,
        ];
      }}
    >
      {({ pressed }) => {
        const vStyle = getVariantStyles(pressed);

        const renderIcon = () => {
          if (!icon) return null;
          if (typeof icon === "string") {
            return (
              <Ionicons
                name={icon as keyof typeof Ionicons.glyphMap}
                size={sizeStyle.iconSize}
                color={vStyle.textColor}
              />
            );
          }
          return icon;
        };

        return (
          <View style={styles.contentRow}>
            {loading ? (
              <ActivityIndicator
                size="small"
                color={vStyle.spinnerColor}
                style={styles.spinner}
              />
            ) : icon && iconPosition === "left" ? (
              <View style={styles.iconLeft}>{renderIcon()}</View>
            ) : null}

            <Text
              style={[
                styles.label,
                {
                  color: vStyle.textColor,
                  fontSize: sizeStyle.fontSize,
                },
                labelStyle,
              ]}
              numberOfLines={1}
            >
              {label}
            </Text>

            {!loading && icon && iconPosition === "right" ? (
              <View style={styles.iconRight}>{renderIcon()}</View>
            ) : null}
          </View>
        );
      }}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: TOKENS.radii.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  fullWidth: {
    width: "100%",
  },
  contentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  spinner: {
    marginRight: TOKENS.spacing.sm,
  },
  iconLeft: {
    marginRight: TOKENS.spacing.sm,
  },
  iconRight: {
    marginLeft: TOKENS.spacing.sm,
  },
  label: {
    fontWeight: TOKENS.typography.buttonLabel.fontWeight,
  },
});
