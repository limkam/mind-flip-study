import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

import { buildMcq } from "../../lib/gameUtils";
import { hapticError, hapticImpact, hapticSuccess, hapticWarning } from "../../lib/haptics";
import { useTheme } from "../../hooks/useTheme";
import type { GameProps } from "./types";
import { GameResult } from "./GameResult";
import { McqOptions } from "./McqOptions";

const TIME_PER_Q = 10;

export function TugOfWarGame({ cards, onComplete }: GameProps) {
  const { colors } = useTheme();
  const questions = useMemo(() => buildMcq(cards, Math.min(10, cards.length), 4), [cards]);
  const [idx, setIdx] = useState(0);
  const [ropePos, setRopePos] = useState(50);
  const rope = useSharedValue(50);
  const [selected, setSelected] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [timeLeft, setTimeLeft] = useState(TIME_PER_Q);
  const [correctCount, setCorrectCount] = useState(0);
  const [winner, setWinner] = useState<"player" | "computer" | null>(null);
  const timedOut = useRef(false);

  const ropeStyle = useAnimatedStyle(() => ({
    width: `${rope.value}%`,
  }));
  const knotStyle = useAnimatedStyle(() => ({
    left: `${rope.value}%`,
  }));

  useEffect(() => {
    rope.value = withSpring(ropePos);
    if (ropePos <= 5) setWinner("computer");
    else if (ropePos >= 95) setWinner("player");
  }, [ropePos, rope]);

  useEffect(() => {
    if (showResult || winner) return;
    timedOut.current = false;
    setTimeLeft(TIME_PER_Q);
    const t = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(t);
          if (!timedOut.current) {
            timedOut.current = true;
            setRopePos((p) => Math.max(5, p - 15));
            setSelected("__timeout__");
            setShowResult(true);
            void hapticWarning();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [idx, showResult, winner, rope]);

  const q = questions[idx];

  const pick = (opt: string) => {
    if (showResult || winner) return;
    const ok = opt === q?.correct;
    setSelected(opt);
    setShowResult(true);
    if (ok) {
      setCorrectCount((c) => c + 1);
      setRopePos((p) => Math.min(95, p + 18));
      void hapticSuccess();
    } else {
      setRopePos((p) => Math.max(5, p - 15));
      void hapticError();
    }
  };

  const next = () => {
    if (winner) return;
    if (idx + 1 >= questions.length) {
      setWinner(ropePos > 50 ? "player" : "computer");
      return;
    }
    setIdx((i) => i + 1);
    setSelected(null);
    setShowResult(false);
  };

  if (winner) {
    return (
      <GameResult
        emoji={winner === "player" ? "🎉" : "🤖"}
        title={winner === "player" ? "You win!" : "Computer wins"}
        subtitle={`${correctCount}/${questions.length} correct`}
        onPrimary={() =>
          onComplete({
            playerScore: correctCount,
            computerScore: questions.length - correctCount,
            totalRounds: questions.length,
          })
        }
      />
    );
  }

  return (
    <View>
      <Text style={{ color: colors.muted, textAlign: "center", marginBottom: 8 }}>
        Q {idx + 1}/{questions.length} · {timeLeft}s
      </Text>
      <View style={[styles.arena, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={styles.side}>🤖</Text>
        <View style={[styles.ropeTrack, { backgroundColor: colors.border }]}>
          <Animated.View style={[styles.ropeFill, ropeStyle]} />
          <Animated.View style={[styles.knot, knotStyle]} />
        </View>
        <Text style={styles.side}>🧑</Text>
      </View>
      <View style={[styles.qCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={{ color: colors.text, fontWeight: "600", textAlign: "center" }}>{q?.question}</Text>
      </View>
      <McqOptions
        options={q?.options ?? []}
        selected={selected === "__timeout__" ? null : selected}
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
  arena: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 16, borderWidth: 1, padding: 12, marginBottom: 12 },
  side: { fontSize: 24 },
  ropeTrack: { flex: 1, height: 24, borderRadius: 12, overflow: "hidden", position: "relative" },
  ropeFill: { position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: "#22c55e" },
  knot: {
    position: "absolute",
    top: 2,
    width: 20,
    height: 20,
    marginLeft: -10,
    borderRadius: 10,
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: "#6366f1",
  },
  qCard: { borderRadius: 12, borderWidth: 1, padding: 16, marginBottom: 4 },
  next: { marginTop: 12, minHeight: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  nextText: { color: "#fff", fontWeight: "700" },
});
