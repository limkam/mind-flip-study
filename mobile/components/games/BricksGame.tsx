import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { buildMcq } from "../../lib/gameUtils";
import { useGameMcq } from "../../hooks/useGameMcq";
import { hapticImpact, hapticSuccess, hapticWarning } from "../../lib/haptics";
import { useTheme } from "../../hooks/useTheme";
import type { GameProps } from "./types";
import { DifficultyModePicker } from "./DifficultyModePicker";
import { GameResult } from "./GameResult";
import { McqOptions } from "./McqOptions";

const COLS = 8;
const ROWS = 4;
const BRICK_COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#a855f7"];

export function BricksGame({ cards, onComplete, generationSeed = 0 }: GameProps) {
  const { colors } = useTheme();
  const totalBricks = Math.min(cards.length * 4, COLS * ROWS);
  const { mode, setMode, questions } = useGameMcq(cards, Math.min(10, cards.length), generationSeed, 4);
  const [alive, setAlive] = useState(() =>
    Array.from({ length: COLS * ROWS }, (_, i) => i < totalBricks),
  );
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [score, setScore] = useState(0);
  const [smashed, setSmashed] = useState(0);
  const [lives, setLives] = useState(3);
  const [done, setDone] = useState<"won" | "lost" | null>(null);

  const remaining = alive.filter(Boolean).length;
  const q = questions[idx];

  const smashBrick = () => {
    const indices = alive.map((a, i) => (a ? i : -1)).filter((i) => i >= 0);
    if (!indices.length) return;
    const pick = indices[Math.floor(Math.random() * indices.length)];
    setAlive((prev) => {
      const next = [...prev];
      next[pick] = false;
      return next;
    });
    setSmashed((s) => s + 1);
    void hapticImpact("medium");
  };

  const pick = (opt: string) => {
    if (showResult || done) return;
    setSelected(opt);
    setShowResult(true);
    const ok = opt === q?.correct;
    if (ok) {
      setScore((s) => s + 1);
      smashBrick();
      void hapticSuccess();
      if (remaining <= 1) setDone("won");
    } else {
      setLives((l) => l - 1);
      void hapticWarning();
      if (lives <= 1) setDone("lost");
    }
  };

  const next = () => {
    if (done) return;
    if (remaining === 0) {
      setDone("won");
      return;
    }
    setIdx((i) => (i + 1) % questions.length);
    setSelected(null);
    setShowResult(false);
  };

  if (done) {
    return (
      <GameResult
        emoji={done === "won" ? "🧱" : "😬"}
        title={done === "won" ? "Board cleared!" : "Out of lives"}
        subtitle={`${smashed} bricks smashed · ${score} correct`}
        onPrimary={() => onComplete({ playerScore: score, computerScore: 0, totalRounds: questions.length })}
      />
    );
  }

  return (
    <View>
      <DifficultyModePicker value={mode} onChange={setMode} disabled={showResult || !!done} />
      <View style={styles.meta}>
        <Text style={{ color: colors.primary, fontWeight: "700" }}>{score} correct</Text>
        <Text style={{ color: colors.muted }}>{remaining} bricks left</Text>
        <Text style={{ color: colors.danger }}>❤️ {lives}</Text>
      </View>
      <View style={[styles.grid, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {alive.map((isAlive, i) => {
          if (!isAlive) return <View key={i} style={styles.gap} />;
          const row = Math.floor(i / COLS);
          const col = i % COLS;
          return (
            <View
              key={i}
              style={[styles.brick, { backgroundColor: BRICK_COLORS[(row + col) % BRICK_COLORS.length] }]}
            />
          );
        })}
      </View>
      <View style={[styles.qCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={{ color: colors.text, fontWeight: "600", textAlign: "center" }}>{q?.question}</Text>
      </View>
      <McqOptions
        options={q?.options ?? []}
        selected={selected}
        correct={q?.correct ?? null}
        showResult={showResult}
        onSelect={pick}
      />
      {showResult ? (
        <Pressable style={[styles.next, { backgroundColor: colors.primary }]} onPress={() => { void hapticImpact("light"); next(); }}>
          <Text style={styles.nextText}>Next</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  meta: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderRadius: 12,
    borderWidth: 1,
    padding: 8,
    gap: 4,
    marginBottom: 12,
  },
  brick: { width: "11.5%", aspectRatio: 2.2, borderRadius: 4 },
  gap: { width: "11.5%", aspectRatio: 2.2 },
  qCard: { borderRadius: 12, borderWidth: 1, padding: 16 },
  next: { marginTop: 12, minHeight: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  nextText: { color: "#fff", fontWeight: "700" },
});
