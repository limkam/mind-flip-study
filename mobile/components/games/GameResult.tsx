import { Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "../../hooks/useTheme";
import { hapticImpact } from "../../lib/haptics";
import { useFinishOnce } from "../../lib/gameLifecycle";
import { TOKENS } from "../../theme/tokens";

type Props = {
  emoji: string;
  title: string;
  subtitle: string;
  primaryLabel?: string;
  onPrimary: () => void;
};

export function GameResult({ emoji, title, subtitle, primaryLabel = "Continue", onPrimary }: Props) {
  const { colors } = useTheme();
  const finish = useFinishOnce(onPrimary);

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.icon, { backgroundColor: colors.primarySoft }]}><Text style={styles.emoji}>{emoji}</Text></View>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.sub, { color: colors.muted }]}>{subtitle}</Text>
      <Pressable
        style={[styles.btn, { backgroundColor: colors.primary }]}
        onPress={() => {
          void hapticImpact("light");
          finish();
        }}
      >
        <Text style={[styles.btnText, { color: colors.onPrimary }]}>{primaryLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: TOKENS.radii.xl,
    borderWidth: 1,
    padding: TOKENS.spacing.xl,
    alignItems: "center",
    marginTop: 12,
  },
  icon: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", marginBottom: TOKENS.spacing.lg },
  emoji: { fontSize: 38 },
  title: { ...TOKENS.typography.screenTitle, textAlign: "center" },
  sub: { ...TOKENS.typography.body, textAlign: "center", marginTop: TOKENS.spacing.sm, marginBottom: TOKENS.spacing.xl },
  btn: {
    minHeight: 48,
    minWidth: 160,
    borderRadius: 12,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { ...TOKENS.typography.buttonLabel },
});
