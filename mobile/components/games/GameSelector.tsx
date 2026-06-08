import { Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "../../hooks/useTheme";
import { hapticImpact } from "../../lib/haptics";
import { GAMES, type GameSlug } from "./types";

type Props = {
  onSelect: (slug: GameSlug) => void;
};

export function GameSelector({ onSelect }: Props) {
  const { colors } = useTheme();

  return (
    <View>
      <Text style={[styles.heading, { color: colors.text }]}>Choose your game</Text>
      <Text style={[styles.sub, { color: colors.muted }]}>Pick a challenge and test your knowledge.</Text>
      <View style={styles.grid}>
        {GAMES.map((game) => (
          <Pressable
            key={game.slug}
            style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => {
              void hapticImpact("light");
              onSelect(game.slug);
            }}
          >
            <Text style={styles.emoji}>{game.emoji}</Text>
            <View style={styles.titleRow}>
              <Text style={[styles.title, { color: colors.text }]}>{game.title}</Text>
              <Text style={[styles.badge, { color: colors.primary, borderColor: colors.primary }]}>{game.badge}</Text>
            </View>
            <Text style={[styles.desc, { color: colors.muted }]}>{game.description}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: 20, fontWeight: "800", marginBottom: 4 },
  sub: { fontSize: 14, marginBottom: 16 },
  grid: { gap: 12 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    minHeight: 44,
  },
  emoji: { fontSize: 32, marginBottom: 8 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  title: { fontSize: 17, fontWeight: "700" },
  badge: {
    fontSize: 11,
    fontWeight: "700",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: "hidden",
  },
  desc: { fontSize: 13, marginTop: 6, lineHeight: 18 },
});
