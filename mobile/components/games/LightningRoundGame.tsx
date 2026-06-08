import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { shuffle } from "../../lib/gameUtils";
import { hapticError, hapticImpact, hapticSuccess } from "../../lib/haptics";
import { useTheme } from "../../hooks/useTheme";
import type { GameCard, GameProps } from "./types";
import { GameResult } from "./GameResult";

const DURATION = 60;

function buildQuestions(cards: GameCard[]) {
  return shuffle(cards).map((card) => {
    const wrong = shuffle(cards.filter((c) => c.back !== card.back))[0]?.back ?? "None";
    return { q: card.front, correct: card.back, options: shuffle([card.back, wrong]) };
  });
}

export function LightningRoundGame({ cards, onComplete }: GameProps) {
  const { colors } = useTheme();
  const questions = useMemo(() => buildQuestions(cards), [cards]);
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [answered, setAnswered] = useState(0);
  const [timeLeft, setTimeLeft] = useState(DURATION);
  const [done, setDone] = useState(false);
  const barWidth = useSharedValue(100);

  useEffect(() => {
    const t = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(t);
          setDone(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    barWidth.value = withTiming((timeLeft / DURATION) * 100, { duration: 400 });
  }, [timeLeft, barWidth]);

  const barStyle = useAnimatedStyle(() => ({ width: `${barWidth.value}%` }));

  const answer = (opt: string) => {
    if (done) return;
    const correct = opt === questions[idx]?.correct;
    if (correct) {
      setScore((s) => s + 1);
      void hapticSuccess();
    } else void hapticError();
    setAnswered((a) => a + 1);
    setIdx((i) => (i + 1) % questions.length);
  };

  if (done) {
    const acc = answered > 0 ? Math.round((score / answered) * 100) : 0;
    return (
      <GameResult
        emoji="⚡"
        title="Time's up!"
        subtitle={`${score} correct · ${answered} answered · ${acc}% accuracy`}
        onPrimary={() => onComplete({ playerScore: score, computerScore: 0, totalRounds: answered })}
      />
    );
  }

  const q = questions[idx];
  const urgent = timeLeft <= 10;

  return (
    <View>
      <View style={styles.top}>
        <Text style={{ color: colors.primary, fontWeight: "700" }}>{score} correct</Text>
        <Text style={{ color: urgent ? colors.danger : colors.text, fontSize: 22, fontWeight: "800" }}>
          {timeLeft}s
        </Text>
      </View>
      <View style={[styles.track, { backgroundColor: colors.border }]}>
        <Animated.View
          style={[
            styles.fill,
            barStyle,
            { backgroundColor: urgent ? colors.danger : timeLeft > 30 ? colors.success : colors.warning },
          ]}
        />
      </View>
      <View style={[styles.qCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.q, { color: colors.text }]}>{q?.q}</Text>
      </View>
      <View style={styles.opts}>
        {q?.options.map((opt) => (
          <Pressable
            key={opt}
            style={[styles.opt, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => {
              void hapticImpact("light");
              answer(opt);
            }}
          >
            <Text style={{ color: colors.text, fontWeight: "600", textAlign: "center" }}>{opt}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  track: { height: 10, borderRadius: 8, overflow: "hidden", marginBottom: 16 },
  fill: { height: 10, borderRadius: 8 },
  qCard: { borderRadius: 16, borderWidth: 1, padding: 24, minHeight: 100, justifyContent: "center" },
  q: { fontSize: 18, fontWeight: "600", textAlign: "center" },
  opts: { gap: 12, marginTop: 16 },
  opt: { minHeight: 52, borderRadius: 12, borderWidth: 1, justifyContent: "center", paddingHorizontal: 16 },
});
