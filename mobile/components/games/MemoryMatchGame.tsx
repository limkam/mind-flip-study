import { useEffect, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

import { shuffle, formatMmSs } from "../../lib/gameUtils";
import { hapticImpact, hapticSuccess, hapticWarning } from "../../lib/haptics";
import { useTheme } from "../../hooks/useTheme";
import type { GameCard, GameProps } from "./types";
import { GameResult } from "./GameResult";

type Tile = {
  id: string;
  pairId: number;
  type: "question" | "answer";
  text: string;
};

export function MemoryMatchGame({ cards, onComplete }: GameProps) {
  const { colors } = useTheme();
  const pairs = cards.slice(0, 8);
  const [tiles] = useState<Tile[]>(() =>
    shuffle([
      ...pairs.map((c, i) => ({ id: `q${i}`, pairId: i, type: "question" as const, text: c.front })),
      ...pairs.map((c, i) => ({ id: `a${i}`, pairId: i, type: "answer" as const, text: c.back })),
    ]),
  );
  const [flipped, setFlipped] = useState<Set<string>>(new Set());
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Tile[]>([]);
  const [moves, setMoves] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [done, setDone] = useState(false);
  const lock = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (matched.size === tiles.length && tiles.length > 0) {
      void hapticSuccess();
      setDone(true);
    }
  }, [matched.size, tiles.length]);

  const flip = (tile: Tile) => {
    if (lock.current || flipped.has(tile.id) || matched.has(tile.id)) return;
    void hapticImpact("light");
    const nextSel = [...selected, tile];
    setFlipped((f) => new Set([...f, tile.id]));
    setSelected(nextSel);
    if (nextSel.length === 2) {
      setMoves((m) => m + 1);
      lock.current = true;
      const [a, b] = nextSel;
      if (a.pairId === b.pairId && a.type !== b.type) {
        setTimeout(() => {
          setMatched((m) => new Set([...m, a.id, b.id]));
          setSelected([]);
          lock.current = false;
          void hapticSuccess();
        }, 400);
      } else {
        void hapticWarning();
        setTimeout(() => {
          setFlipped((f) => {
            const n = new Set(f);
            n.delete(a.id);
            n.delete(b.id);
            return n;
          });
          setSelected([]);
          lock.current = false;
        }, 700);
      }
    }
  };

  if (done) {
    return (
      <GameResult
        emoji="🃏"
        title="Board cleared!"
        subtitle={`${moves} moves · ${formatMmSs(elapsed)}`}
        onPrimary={() => onComplete({ playerScore: pairs.length, computerScore: 0, totalRounds: pairs.length })}
      />
    );
  }

  return (
    <View>
      <View style={styles.meta}>
        <Text style={{ color: colors.muted }}>{matched.size / 2}/{pairs.length} matched</Text>
        <Text style={{ color: colors.muted }}>{formatMmSs(elapsed)}</Text>
        <Text style={{ color: colors.muted }}>{moves} moves</Text>
      </View>
      <FlatList
        data={tiles}
        numColumns={4}
        keyExtractor={(t) => t.id}
        scrollEnabled={false}
        columnWrapperStyle={{ gap: 8 }}
        contentContainerStyle={{ gap: 8 }}
        renderItem={({ item }) => (
          <MemoryTile
            tile={item}
            show={flipped.has(item.id) || matched.has(item.id)}
            matched={matched.has(item.id)}
            colors={colors}
            onPress={() => flip(item)}
          />
        )}
      />
    </View>
  );
}

function MemoryTile({
  tile,
  show,
  matched,
  colors,
  onPress,
}: {
  tile: Tile;
  show: boolean;
  matched: boolean;
  colors: ReturnType<typeof useTheme>["colors"];
  onPress: () => void;
}) {
  const rot = useSharedValue(0);
  useEffect(() => {
    rot.value = withSpring(show ? 180 : 0);
  }, [show, rot]);
  const frontStyle = useAnimatedStyle(() => ({
    transform: [{ rotateY: `${rot.value}deg` }],
    backfaceVisibility: "hidden" as const,
  }));
  const backStyle = useAnimatedStyle(() => ({
    transform: [{ rotateY: `${180 + rot.value}deg` }],
    backfaceVisibility: "hidden" as const,
  }));

  return (
    <Pressable style={styles.tileWrap} onPress={onPress} disabled={matched}>
      <Animated.View style={[styles.tile, frontStyle, { backgroundColor: colors.primary }]}>
        <Text style={styles.tileEmoji}>?</Text>
      </Animated.View>
      <Animated.View
        style={[
          styles.tile,
          styles.tileBack,
          backStyle,
          {
            backgroundColor: matched ? colors.success + "33" : colors.surface,
            borderColor: colors.border,
          },
        ]}
      >
        <Text style={[styles.tileText, { color: colors.text }]} numberOfLines={4}>
          {tile.text}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  meta: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  tileWrap: { width: "23%", aspectRatio: 0.75, position: "relative" },
  tile: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    padding: 6,
  },
  tileBack: { borderWidth: 1 },
  tileEmoji: { color: "#fff", fontSize: 22, fontWeight: "800" },
  tileText: { fontSize: 11, textAlign: "center", fontWeight: "600" },
});
