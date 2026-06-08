import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { shuffle } from "../../lib/gameUtils";
import { hapticError, hapticImpact, hapticSuccess, hapticWarning } from "../../lib/haptics";
import { useTheme } from "../../hooks/useTheme";
import type { GameProps } from "./types";
import { GameResult } from "./GameResult";

const TIME_PER_ROUND = 20;
const COMPUTER_DELAY = 5;

function shuffleLetters(str: string): string {
  const letters = str.split("");
  for (let i = letters.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [letters[i], letters[j]] = [letters[j], letters[i]];
  }
  return letters.join("");
}

function canScramble(str: string): boolean {
  return str.length > 1 && new Set(str).size > 1;
}

function scrambleWord(str: string): string {
  if (!canScramble(str)) return str;
  for (let attempt = 0; attempt < 16; attempt++) {
    const result = shuffleLetters(str);
    if (result !== str) return result;
  }
  return str.slice(1) + str[0];
}

export function WordScrambleGame({ cards, onComplete }: GameProps) {
  const { colors } = useTheme();
  const rounds = useMemo(
    () =>
      cards.slice(0, 8).flatMap((c) => {
        const raw = c.back.split(".")[0].split(",")[0].trim();
        const answer = raw.replace(/[^a-zA-Z0-9 ]/g, "").slice(0, 20).toUpperCase();
        if (!canScramble(answer)) return [];
        return [{ question: c.front, answer, scrambled: scrambleWord(answer) }];
      }),
    [cards],
  );
  const [idx, setIdx] = useState(0);
  const [input, setInput] = useState("");
  const [playerScore, setPlayerScore] = useState(0);
  const [computerScore, setComputerScore] = useState(0);
  const [roundResult, setRoundResult] = useState<"player" | "computer" | "wrong" | null>(null);
  const [timeLeft, setTimeLeft] = useState(TIME_PER_ROUND);
  const [compLeft, setCompLeft] = useState(COMPUTER_DELAY);
  const [done, setDone] = useState(false);
  const ended = useRef(false);

  const round = rounds[idx];

  useEffect(() => {
    if (roundResult || done) return;
    ended.current = false;
    setTimeLeft(TIME_PER_ROUND);
    setCompLeft(COMPUTER_DELAY);
    setInput("");
    setRoundResult(null);

    const main = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(main);
          if (!ended.current) {
            ended.current = true;
            setRoundResult("computer");
            setComputerScore((s) => s + 1);
            void hapticWarning();
          }
          return 0;
        }
        return t - 1;
      });
    }, 1000);

    const comp = setInterval(() => {
      setCompLeft((c) => {
        if (c <= 1) {
          clearInterval(comp);
          clearInterval(main);
          if (!ended.current) {
            ended.current = true;
            setRoundResult("computer");
            setComputerScore((s) => s + 1);
            void hapticWarning();
          }
          return 0;
        }
        return c - 1;
      });
    }, 1000);

    return () => {
      clearInterval(main);
      clearInterval(comp);
    };
  }, [idx, done, roundResult]);

  const submit = () => {
    if (roundResult || !round) return;
    ended.current = true;
    if (input.trim().toUpperCase() === round.answer) {
      setRoundResult("player");
      setPlayerScore((s) => s + 1);
      void hapticSuccess();
    } else {
      setRoundResult("wrong");
      setComputerScore((s) => s + 1);
      void hapticError();
    }
  };

  const next = () => {
    if (idx + 1 >= rounds.length) {
      setDone(true);
      return;
    }
    setIdx((i) => i + 1);
  };

  if (rounds.length === 0) {
    return (
      <GameResult
        emoji="🔤"
        title="Can't play Word Scramble"
        subtitle="Need answers with at least two different letters."
        onPrimary={() => onComplete({ playerScore: 0, computerScore: 0, totalRounds: 0 })}
      />
    );
  }

  if (done) {
    const title =
      playerScore > computerScore ? "You win!" : playerScore === computerScore ? "It's a tie!" : "Computer wins";
    return (
      <GameResult
        emoji="🔤"
        title={title}
        subtitle={`You ${playerScore} — Computer ${computerScore}`}
        onPrimary={() => onComplete({ playerScore, computerScore, totalRounds: rounds.length })}
      />
    );
  }

  return (
    <View>
      <View style={[styles.score, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={{ color: colors.primary, fontWeight: "800", fontSize: 22 }}>{playerScore}</Text>
        <Text style={{ color: colors.muted }}>VS</Text>
        <Text style={{ color: colors.danger, fontWeight: "800", fontSize: 22 }}>{computerScore}</Text>
      </View>
      <Text style={{ color: colors.muted, textAlign: "center" }}>Round {idx + 1}/{rounds.length}</Text>
      <View style={[styles.hint, { backgroundColor: colors.surface }]}>
        <Text style={{ color: colors.muted, fontSize: 12 }}>Question</Text>
        <Text style={{ color: colors.text }}>{round?.question}</Text>
      </View>
      <Text style={[styles.scramble, { color: colors.primary }]}>{round?.scrambled}</Text>
      <Text style={{ color: colors.muted, textAlign: "center", marginBottom: 8 }}>
        You: {timeLeft}s · Computer: {compLeft}s
      </Text>
      {!roundResult ? (
        <>
          <TextInput
            value={input}
            onChangeText={setInput}
            autoCapitalize="characters"
            placeholder="Your answer"
            placeholderTextColor={colors.muted}
            style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
            onSubmitEditing={submit}
          />
          <Pressable style={[styles.btn, { backgroundColor: colors.primary }]} onPress={() => { void hapticImpact("light"); submit(); }}>
            <Text style={styles.btnText}>Submit</Text>
          </Pressable>
        </>
      ) : (
        <Pressable style={[styles.btn, { backgroundColor: colors.primary }]} onPress={next}>
          <Text style={styles.btnText}>{idx + 1 >= rounds.length ? "Results" : "Next"}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  score: {
    flexDirection: "row",
    justifyContent: "space-around",
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  hint: { borderRadius: 12, padding: 12, marginVertical: 12 },
  scramble: { fontSize: 28, fontWeight: "800", textAlign: "center", letterSpacing: 4, marginVertical: 12 },
  input: { borderWidth: 1, borderRadius: 12, minHeight: 44, paddingHorizontal: 14, fontSize: 16, marginBottom: 12 },
  btn: { minHeight: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
