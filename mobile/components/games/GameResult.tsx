import { Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "../../hooks/useTheme";
import { hapticImpact } from "../../lib/haptics";

type Props = {
  emoji: string;
  title: string;
  subtitle: string;
  primaryLabel?: string;
  onPrimary: () => void;
};

export function GameResult({ emoji, title, subtitle, primaryLabel = "Continue", onPrimary }: Props) {
  const { colors } = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={styles.emoji}>{emoji}</Text>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.sub, { color: colors.muted }]}>{subtitle}</Text>
      <Pressable
        style={[styles.btn, { backgroundColor: colors.primary }]}
        onPress={() => {
          void hapticImpact("light");
          onPrimary();
        }}
      >
        <Text style={styles.btnText}>{primaryLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 28,
    alignItems: "center",
    marginTop: 12,
  },
  emoji: { fontSize: 48, marginBottom: 8 },
  title: { fontSize: 22, fontWeight: "800", textAlign: "center" },
  sub: { fontSize: 15, textAlign: "center", marginTop: 8, marginBottom: 20, lineHeight: 22 },
  btn: {
    minHeight: 44,
    minWidth: 160,
    borderRadius: 12,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
