import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { useTheme } from "../../hooks/useTheme";
import { TOKENS } from "../../theme/tokens";

export type StatChipTone = "streak" | "xp" | "success" | "info" | "neutral" | "onBrand";

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  tone?: StatChipTone;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/** Compact pill for streak/XP/status readouts. `onBrand` tone is for placement on a BrandSurface. */
export function StatChip({ icon, label, tone = "neutral", accessibilityLabel, style }: Props) {
  const { colors } = useTheme();

  const toneStyles = (() => {
    switch (tone) {
      case "streak":
        return { bg: colors.streakSurface, fg: colors.streak };
      case "xp":
        return { bg: colors.xpSurface, fg: colors.xp };
      case "success":
        return { bg: colors.successSurface, fg: colors.success };
      case "info":
        return { bg: colors.infoSurface, fg: colors.info };
      case "onBrand":
        return { bg: `${colors.onBrand}2E`, fg: colors.onBrand };
      case "neutral":
      default:
        return { bg: colors.surfaceMuted, fg: colors.textSecondary };
    }
  })();

  return (
    <View
      accessibilityLabel={accessibilityLabel ?? label}
      style={[styles.chip, { backgroundColor: toneStyles.bg }, style]}
    >
      <Ionicons name={icon} size={14} color={toneStyles.fg} />
      <Text style={[styles.label, { color: toneStyles.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minHeight: 30,
    paddingHorizontal: TOKENS.spacing.sm,
    borderRadius: TOKENS.radii.pill,
  },
  label: {
    fontSize: TOKENS.typography.label.fontSize,
    fontWeight: TOKENS.typography.label.fontWeight,
  },
});
