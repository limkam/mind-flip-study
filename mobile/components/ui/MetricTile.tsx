import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { useTheme } from "../../hooks/useTheme";
import { TOKENS } from "../../theme/tokens";

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  value: string | number;
  label: string;
  style?: StyleProp<ViewStyle>;
};

/** A single Learning Journey metric — used in a row of authoritative-data-only tiles. */
export function MetricTile({ icon, iconColor, value, label, style }: Props) {
  const { colors } = useTheme();

  return (
    <View style={[styles.tile, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>
      <View style={[styles.iconWrap, { backgroundColor: colors.surfaceMuted }]}>
        <Ionicons name={icon} size={18} color={iconColor ?? colors.primary} />
      </View>
      <Text style={[styles.value, { color: colors.textPrimary }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={[styles.label, { color: colors.textMuted }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    borderWidth: 1,
    borderRadius: TOKENS.radii.lg,
    padding: TOKENS.spacing.md,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: TOKENS.radii.sm,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: TOKENS.spacing.sm,
  },
  value: {
    fontSize: TOKENS.typography.metric.fontSize,
    lineHeight: TOKENS.typography.metric.lineHeight,
    fontWeight: TOKENS.typography.metric.fontWeight,
    letterSpacing: TOKENS.typography.metric.letterSpacing,
    fontVariant: ["tabular-nums"],
  },
  label: {
    fontSize: TOKENS.typography.metricLabel.fontSize,
    lineHeight: TOKENS.typography.metricLabel.lineHeight,
    fontWeight: TOKENS.typography.metricLabel.fontWeight,
    marginTop: 2,
  },
});
