import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { buildMcq, formatMmSs, type QuizDifficultyMode } from "../../lib/gameUtils";
import { hapticError, hapticImpact, hapticSuccess } from "../../lib/haptics";
import { useTheme } from "../../hooks/useTheme";
import type { GameProps } from "./types";
import type { McqQuestion } from "./types";
import type { ChallengeQuestionOut } from "../../types/api";
import { DifficultyModePicker } from "./DifficultyModePicker";
import { GameResult } from "./GameResult";
import { McqOptions } from "./McqOptions";

type QuizGameProps = Omit<GameProps, "cards"> & {
  cards?: GameProps["cards"];
  questions?: ChallengeQuestionOut[];
};

export function QuizGame({ cards, questions: providedQuestions, onComplete, generationSeed = 0 }: QuizGameProps) {
  const { colors } = useTheme();
  const [mode, setMode] = useState<QuizDifficultyMode>("mixed");
  const usingProvidedQuestions = Array.isArray(providedQuestions);
  const questions: McqQuestion[] = useMemo(() => {
    if (providedQuestions) {
      return providedQuestions.map((q) => ({
        question: q.question,
        correct: q.correct_answer,
        options: q.options,
        chapter: q.chapter,
        difficulty: q.difficulty,
      }));
    }
    return buildMcq(cards ?? [], Math.min(20, cards?.length ?? 0), 4, generationSeed, mode);
  }, [cards, providedQuestions, generationSeed, mode]);
  const [idx, setIdx] = useState(0);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [score, setScore] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [done, setDone] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setIdx(0);
    setAnsweredCount(0);
    setScore(0);
    setSelected(null);
    setShowResult(false);
    setDone(false);
    setElapsed(0);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [mode]);

  const q = questions[idx];

  const pick = (opt: string) => {
    if (showResult || !q) return;
    setSelected(opt);
    setShowResult(true);
    setAnsweredCount((c) => c + 1);
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
        subtitle={`${score}/${questions.length} correct (${pct}%) · ${answeredCount} answered · ${formatMmSs(elapsed)} · ${mode}`}
        onPrimary={() =>
          onComplete({
            playerScore: score,
            computerScore: questions.length - score,
            totalRounds: Math.max(questions.length, 1),
            percentage: pct,
            timeTakenSeconds: elapsed,
          })
        }
      />
    );
  }

  return (
    <View>
      {!usingProvidedQuestions ? (
        <DifficultyModePicker value={mode} onChange={setMode} disabled={answeredCount > 0} />
      ) : null}
      <View style={styles.meta}>
        <Text style={{ color: colors.muted }}>{answeredCount} of {questions.length} answered</Text>
        {q?.difficulty ? (
          <Text style={{ color: colors.primary, fontWeight: "700", textTransform: "uppercase", fontSize: 11 }}>
            {q.difficulty}
          </Text>
        ) : null}
        <Text style={{ color: colors.primary, fontWeight: "700" }}>{score} correct</Text>
        <Text style={{ color: colors.muted }}>{formatMmSs(elapsed)}</Text>
      </View>
      <View style={[styles.qCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {q?.chapter ? (
          <Text style={[styles.chapter, { color: colors.muted, backgroundColor: `${colors.border}55` }]}>{q.chapter}</Text>
        ) : null}
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
          <Text style={[styles.nextText, { color: colors.onPrimary }]}>{idx + 1 >= questions.length ? "Finish" : "Next"}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  meta: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 8, flexWrap: "wrap" },
  qCard: { borderRadius: 16, borderWidth: 1, padding: 20, minHeight: 100, justifyContent: "center" },
  chapter: { alignSelf: "flex-start", fontSize: 11, fontWeight: "600", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginBottom: 8 },
  q: { fontSize: 18, fontWeight: "600", textAlign: "center", lineHeight: 26 },
  next: { marginTop: 16, minHeight: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  nextText: { fontWeight: "700", fontSize: 16 },
});
