import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { buildMcq, formatMmSs } from "../../lib/gameUtils";
import { hapticError, hapticImpact, hapticSuccess } from "../../lib/haptics";
import { useTheme } from "../../hooks/useTheme";
import type { GameProps } from "./types";
import { GameResult } from "./GameResult";
import { McqOptions } from "./McqOptions";

export function QuizGame({ cards, onComplete }: GameProps) {
  const { colors } = useTheme();
  const questions = useMemo(() => buildMcq(cards, Math.min(20, cards.length), 4), [cards]);
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [done, setDone] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const q = questions[idx];

  const pick = (opt: string) => {
    if (showResult || !q) return;
    setSelected(opt);
    setShowResult(true);
    const ok = opt === q.correct;
    if (ok) {
      setScore((s) => s + 1);
      void hapticSuccess();
    } else void hapticError();
  };

  const next = () => {
    if (idx + 1 >= questions.length) {
      if (timerRef.current) clearInterval(timerRef.current);
      setDone(true);
      return;
    }
    setIdx((i) => i + 1);
    setSelected(null);
    setShowResult(false);
  };

  if (done) {
    const pct = Math.round((score / questions.length) * 100);
    return (
      <GameResult
        emoji="🏆"
        title="Quiz complete!"
        subtitle={`${score}/${questions.length} correct (${pct}%) · ${formatMmSs(elapsed)}`}
        onPrimary={() =>
          onComplete({ playerScore: score, computerScore: questions.length - score, totalRounds: questions.length })
        }
      />
    );
  }

  return (
    <View>
      <View style={styles.meta}>
        <Text style={{ color: colors.muted }}>Q {idx + 1}/{questions.length}</Text>
        <Text style={{ color: colors.primary, fontWeight: "700" }}>{score} correct</Text>
        <Text style={{ color: colors.muted }}>{formatMmSs(elapsed)}</Text>
      </View>
      <View style={[styles.qCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.q, { color: colors.text }]}>{q?.question}</Text>
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
          <Text style={styles.nextText}>{idx + 1 >= questions.length ? "Finish" : "Next"}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  meta: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  qCard: { borderRadius: 16, borderWidth: 1, padding: 20, minHeight: 100, justifyContent: "center" },
  q: { fontSize: 18, fontWeight: "600", textAlign: "center", lineHeight: 26 },
  next: { marginTop: 16, minHeight: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  nextText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
