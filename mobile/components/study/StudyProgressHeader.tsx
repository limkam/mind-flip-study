import { StyleSheet, Text, View } from "react-native";

import { useTheme } from "../../hooks/useTheme";
import { TOKENS } from "../../theme/tokens";
import { AppProgressBar } from "../ui/AppProgressBar";

type Props = {
  current: number;
  total: number;
  title?: string;
};

export function StudyProgressHeader({ current, total, title }: Props) {
  const { colors } = useTheme();
  const safeTotal = Math.max(0, total);
  const safeCurrent = safeTotal ? Math.min(Math.max(1, current), safeTotal) : 0;

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{title ?? "Study"}</Text>
        <Text style={[styles.count, { color: colors.textSecondary }]}>
          {safeCurrent} of {safeTotal}
        </Text>
      </View>
      <AppProgressBar
        progress={safeTotal ? (safeCurrent - 1) / safeTotal : 0}
        height={6}
        accessibilityLabel={`${title ?? "Study"} progress, ${safeCurrent} of ${safeTotal}`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: TOKENS.spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: TOKENS.spacing.md },
  title: { ...TOKENS.typography.label, flex: 1 },
  count: { ...TOKENS.typography.caption, fontVariant: ["tabular-nums"] },
});
