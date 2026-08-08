import { Ionicons } from "@expo/vector-icons";
import { useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "../../hooks/useTheme";
import { hapticImpact } from "../../lib/haptics";
import { TOKENS } from "../../theme/tokens";
import { GAMES, type GameSlug } from "./types";

type Props = { onSelect: (slug: GameSlug) => void; maxGames?: number };

const ICONS: Record<GameSlug, keyof typeof Ionicons.glyphMap> = {
  quiz: "help-circle-outline", lightning: "flash-outline", battle: "shield-outline", memory: "grid-outline",
  hangman: "text-outline", tugofwar: "fitness-outline", bricks: "apps-outline", scramble: "shuffle-outline",
};

export function GameSelector({ onSelect, maxGames = GAMES.length }: Props) {
  const { colors } = useTheme();
  const navigationLock = useRef(false);
  const unlockedCount = Math.max(0, Math.min(Number(maxGames) || 0, GAMES.length));

  const select = (slug: GameSlug) => {
    if (navigationLock.current) return;
    navigationLock.current = true;
    void hapticImpact("light");
    onSelect(slug);
    setTimeout(() => { navigationLock.current = false; }, 600);
  };

  return (
    <View>
      <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>Choose a game</Text>
      <Text style={[styles.sub, { color: colors.textSecondary }]}>Each mode practices the same study material in a different way.</Text>
      <View style={styles.list}>
        {GAMES.map((game, index) => {
          const isLocked = index >= unlockedCount;
          return (
            <Pressable
              key={game.slug}
              accessibilityRole="button"
              accessibilityState={{ disabled: isLocked }}
              accessibilityLabel={`${game.title}. ${game.description}${isLocked ? ". Available with an upgraded plan" : ". Start game"}`}
              disabled={isLocked}
              onPress={() => select(game.slug)}
              style={({ pressed }) => [styles.card, { backgroundColor: colors.surface, borderColor: colors.border, opacity: isLocked ? 0.58 : pressed ? 0.68 : 1 }]}
            >
              <View style={[styles.icon, { backgroundColor: colors.primarySoft }]}><Ionicons name={ICONS[game.slug]} size={24} color={colors.primary} /></View>
              <View style={styles.copy}><View style={styles.titleRow}><Text style={[styles.title, { color: colors.text }]}>{game.title}</Text><Text style={[styles.badge, { color: colors.primary, borderColor: colors.primary }]}>{game.badge}</Text></View><Text style={[styles.desc, { color: colors.textSecondary }]}>{game.description}</Text>{isLocked ? <Text style={[styles.lock, { color: colors.textMuted }]}>Available with an upgraded plan</Text> : null}</View>
              <Ionicons name={isLocked ? "lock-closed-outline" : "play-circle-outline"} size={23} color={isLocked ? colors.textMuted : colors.primary} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { ...TOKENS.typography.screenTitle }, sub: { ...TOKENS.typography.body, marginTop: TOKENS.spacing.xs, marginBottom: TOKENS.spacing.xl },
  list: { gap: TOKENS.spacing.md }, card: { minHeight: 92, borderRadius: TOKENS.radii.lg, borderWidth: 1, padding: TOKENS.spacing.md, flexDirection: "row", alignItems: "center", gap: TOKENS.spacing.md },
  icon: { width: 48, height: 48, borderRadius: TOKENS.radii.md, alignItems: "center", justifyContent: "center" }, copy: { flex: 1 }, titleRow: { flexDirection: "row", alignItems: "center", gap: TOKENS.spacing.sm, flexWrap: "wrap" },
  title: { ...TOKENS.typography.cardTitle }, badge: { ...TOKENS.typography.caption, borderWidth: 1, borderRadius: TOKENS.radii.pill, paddingHorizontal: TOKENS.spacing.sm, paddingVertical: 2 }, desc: { ...TOKENS.typography.secondaryBody, marginTop: TOKENS.spacing.xs }, lock: { ...TOKENS.typography.caption, marginTop: TOKENS.spacing.xs },
});
