import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { buildMcq, type QuizDifficultyMode } from "../../lib/gameUtils";
import { hapticError, hapticImpact, hapticSuccess } from "../../lib/haptics";
import { useTheme } from "../../hooks/useTheme";
import type { GameProps } from "./types";
import { DifficultyModePicker } from "./DifficultyModePicker";
import { GameResult } from "./GameResult";

const DURATION = 60;

export function LightningRoundGame({ cards, onComplete, generationSeed = 0 }: GameProps) {
  const { colors } = useTheme();
  const [mode, setMode] = useState<QuizDifficultyMode>("mixed");
  const questions = useMemo(
    () => buildMcq(cards, cards.length, 2, generationSeed, mode),
    [cards, generationSeed, mode],
  );
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [answered, setAnswered] = useState(0);
  const [timeLeft, setTimeLeft] = useState(DURATION);
  const [done, setDone] = useState(false);
  const barWidth = useSharedValue(100);

  useEffect(() => {
    setIdx(0);
    setScore(0);
    setAnswered(0);
    setTimeLeft(DURATION);
    setDone(false);
  }, [mode, questions.length]);

  useEffect(() => {
    barWidth.value = withTiming((timeLeft / DURATION) * 100, { duration: 300 });
  }, [timeLeft, barWidth]);

  useEffect(() => {
    if (done) return;
    const t = setInterval(() => {
      setTimeLeft((s) => {
        if (s <= 1) {
          setDone(true);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [done]);

  const q = questions[idx % Math.max(questions.length, 1)];

  const pick = (opt: string) => {
    if (done || !q) return;
    const ok = opt === q.correct;
    setAnswered((a) => a + 1);
    if (ok) {
      setScore((s) => s + 1);
      void hapticSuccess();
    } else void hapticError();
    setIdx((i) => i + 1);
  };

  if (done) {
    return (
      <GameResult
        emoji="⚡"
        title="Time's up!"
        subtitle={`${score}/${answered} correct · ${mode}`}
        onPrimary={() =>
          onComplete({ playerScore: score, computerScore: answered - score, totalRounds: answered })
        }
      />
    );
  }

  const barStyle = useAnimatedStyle(() => ({ width: `${barWidth.value}%` }));

  return (
    <View>
      <DifficultyModePicker value={mode} onChange={setMode} />
      <View style={styles.meta}>
        <Text style={{ color: colors.muted }}>{timeLeft}s left</Text>
        <Text style={{ color: colors.primary, fontWeight: "700" }}>{score} correct</Text>
      </View>
      <View style={[styles.barTrack, { backgroundColor: colors.border }]}>
        <Animated.View style={[styles.barFill, barStyle, { backgroundColor: colors.primary }]} />
      </View>
      <View style={[styles.qCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={{ color: colors.text, fontWeight: "600", textAlign: "center" }}>{q?.question}</Text>
      </View>
      <View style={styles.opts}>
        {(q?.options ?? []).map((opt) => (
          <Pressable
            key={opt}
            style={[styles.opt, { borderColor: colors.border, backgroundColor: colors.background }]}
            onPress={() => {
              void hapticImpact("light");
              pick(opt);
            }}
          >
            <Text style={{ color: colors.text, textAlign: "center" }}>{opt}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  meta: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  barTrack: { height: 6, borderRadius: 3, overflow: "hidden", marginBottom: 12 },
  barFill: { height: "100%" },
  qCard: { borderRadius: 12, borderWidth: 1, padding: 16, marginBottom: 12 },
  opts: { gap: 10 },
  opt: { borderWidth: 1, borderRadius: 12, padding: 14, minHeight: 48, justifyContent: "center" },
});
