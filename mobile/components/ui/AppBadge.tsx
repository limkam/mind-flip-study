import { Ionicons } from "@expo/vector-icons";
import { type ReactNode } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { useTheme } from "../../hooks/useTheme";
import { TOKENS } from "../../theme/tokens";

export type BadgeVariant =
  | "primary"
  | "secondary"
  | "success"
  | "warning"
  | "danger"
  | "xp"
  | "streak"
  | "outline";

type Props = {
  label: string;
  variant?: BadgeVariant;
  icon?: keyof typeof Ionicons.glyphMap | ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function AppBadge({ label, variant = "primary", icon, style }: Props) {
  const { colors } = useTheme();

  const getVariantStyles = () => {
    switch (variant) {
      case "secondary":
        return {
          bg: colors.surfaceMuted,
          border: colors.border,
          text: colors.textSecondary,
        };
      case "success":
        return {
          bg: colors.successSurface,
          border: "transparent",
          text: colors.success,
        };
      case "warning":
        return {
          bg: colors.warningSurface,
          border: "transparent",
          text: colors.warning,
        };
      case "danger":
        return {
          bg: colors.dangerSurface,
          border: "transparent",
          text: colors.danger,
        };
      case "xp":
        return {
          bg: colors.xpSurface,
          border: "transparent",
          text: colors.xp,
        };
      case "streak":
        return {
          bg: colors.streakSurface,
          border: "transparent",
          text: colors.streak,
        };
      case "outline":
        return {
          bg: "transparent",
          border: colors.borderStrong,
          text: colors.textSecondary,
        };
      case "primary":
      default:
        return {
          bg: colors.primarySoft,
          border: "transparent",
          text: colors.primary,
        };
    }
  };

  const vStyle = getVariantStyles();

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: vStyle.bg,
          borderColor: vStyle.border,
        },
        style,
      ]}
    >
      {icon ? (
        <View style={styles.iconWrap}>
          {typeof icon === "string" ? (
            <Ionicons
              name={icon as keyof typeof Ionicons.glyphMap}
              size={12}
              color={vStyle.text}
            />
          ) : (
            icon
          )}
        </View>
      ) : null}
      <Text style={[styles.label, { color: vStyle.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: TOKENS.spacing.sm,
    paddingVertical: TOKENS.spacing.xs,
    borderRadius: TOKENS.radii.pill,
    borderWidth: 1,
  },
  iconWrap: {
    marginRight: 4,
  },
  label: {
    fontSize: TOKENS.typography.caption.fontSize,
    fontWeight: TOKENS.typography.caption.fontWeight,
    lineHeight: TOKENS.typography.caption.lineHeight,
  },
});
