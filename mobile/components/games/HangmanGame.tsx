import { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line } from "react-native-svg";

import { normalizeAnswer } from "../../lib/gameUtils";
import { hapticError, hapticImpact, hapticSuccess, hapticWarning } from "../../lib/haptics";
import { useGameCardPool } from "../../hooks/useGameCardPool";
import { useTheme } from "../../hooks/useTheme";
import type { GameProps } from "./types";
import { DifficultyModePicker } from "./DifficultyModePicker";
import { GameResult } from "./GameResult";

const MAX_WRONG = 6;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function HangmanFigure({ wrong, color }: { wrong: number; color: string }) {
  return (
    <Svg width={160} height={180} viewBox="0 0 200 220">
      <Line x1="20" y1="210" x2="180" y2="210" stroke={color} strokeWidth="4" />
      <Line x1="60" y1="210" x2="60" y2="20" stroke={color} strokeWidth="4" />
      <Line x1="60" y1="20" x2="130" y2="20" stroke={color} strokeWidth="4" />
      <Line x1="130" y1="20" x2="130" y2="45" stroke={color} strokeWidth="4" />
      {wrong >= 1 ? <Circle cx="130" cy="60" r="15" stroke="#ef4444" strokeWidth="3" fill="none" /> : null}
      {wrong >= 2 ? <Line x1="130" y1="75" x2="130" y2="135" stroke="#ef4444" strokeWidth="3" /> : null}
      {wrong >= 3 ? <Line x1="130" y1="90" x2="105" y2="115" stroke="#ef4444" strokeWidth="3" /> : null}
      {wrong >= 4 ? <Line x1="130" y1="90" x2="155" y2="115" stroke="#ef4444" strokeWidth="3" /> : null}
      {wrong >= 5 ? <Line x1="130" y1="135" x2="105" y2="170" stroke="#ef4444" strokeWidth="3" /> : null}
      {wrong >= 6 ? <Line x1="130" y1="135" x2="155" y2="170" stroke="#ef4444" strokeWidth="3" /> : null}
    </Svg>
  );
}

export function HangmanGame({ cards, onComplete, generationSeed = 0 }: GameProps) {
  const { colors } = useTheme();
  const { mode, setMode, pool: rounds } = useGameCardPool(
    cards,
    Math.min(8, cards.length),
    generationSeed,
    "hangman",
  );
  const totalRounds = rounds.length;
  const [idx, setIdx] = useState(0);
  const [guessed, setGuessed] = useState<Set<string>>(new Set());
  const [wrong, setWrong] = useState(0);
  const [playerScore, setPlayerScore] = useState(0);
  const [computerScore, setComputerScore] = useState(0);
  const [roundResult, setRoundResult] = useState<"win" | "lose" | null>(null);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    setIdx(0);
    setGuessed(new Set());
    setWrong(0);
    setPlayerScore(0);
    setComputerScore(0);
    setRoundResult(null);
    setFinished(false);
  }, [mode]);

  const answer = normalizeAnswer(rounds[idx]?.back ?? "");
  const letters = [...new Set(answer.split("").filter((c) => /[A-Z0-9]/.test(c)))];
  const revealed = letters.every((c) => guessed.has(c));
  const dead = wrong >= MAX_WRONG;

  useEffect(() => {
    if (roundResult) return;
    if (revealed) {
      setRoundResult("win");
      setPlayerScore((s) => s + 1);
      void hapticSuccess();
    } else if (dead) {
      setRoundResult("lose");
      setComputerScore((s) => s + 1);
      void hapticError();
    }
  }, [revealed, dead, roundResult]);

  const guess = (letter: string) => {
    if (roundResult || guessed.has(letter)) return;
    const next = new Set(guessed);
    next.add(letter);
    setGuessed(next);
    if (!answer.includes(letter)) {
      setWrong((w) => w + 1);
      void hapticWarning();
    } else void hapticImpact("light");
  };

  const nextRound = () => {
    if (idx + 1 >= totalRounds) {
      setFinished(true);
      return;
    }
    setIdx((i) => i + 1);
    setGuessed(new Set());
    setWrong(0);
    setRoundResult(null);
  };

  if (finished) {
    return (
      <GameResult
        emoji={playerScore >= computerScore ? "🎉" : "💀"}
        title={playerScore >= computerScore ? "You win!" : "Computer wins"}
        subtitle={`You ${playerScore} — Computer ${computerScore}`}
        onPrimary={() => onComplete({ playerScore, computerScore, totalRounds })}
      />
    );
  }

  const display = answer
    .split("")
    .map((c) => (/[A-Z0-9]/.test(c) ? (guessed.has(c) ? c : "_") : c))
    .join(" ");

  return (
    <View>
      <DifficultyModePicker
        value={mode}
        onChange={setMode}
        disabled={idx > 0 || !!roundResult || finished}
      />
      <View style={[styles.score, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={{ color: colors.text, fontWeight: "800", fontSize: 24 }}>{playerScore}</Text>
        <Text style={{ color: colors.muted }}>VS</Text>
        <Text style={{ color: colors.danger, fontWeight: "800", fontSize: 24 }}>{computerScore}</Text>
      </View>
      <Text style={{ color: colors.muted, textAlign: "center", marginBottom: 8 }}>
        Round {idx + 1} of {totalRounds} · {MAX_WRONG - wrong} lives
      </Text>
      <View style={[styles.hint, { backgroundColor: colors.surface }]}>
        <Text style={{ color: colors.muted, fontSize: 12 }}>Question</Text>
        <Text style={{ color: colors.text, fontWeight: "600" }}>{rounds[idx]?.front}</Text>
      </View>
      <HangmanFigure wrong={wrong} color={colors.text} />
      <Text style={[styles.word, { color: colors.text }]}>{display}</Text>
      {roundResult ? (
        <Pressable style={[styles.next, { backgroundColor: colors.primary }]} onPress={nextRound}>
          <Text style={styles.nextText}>{idx + 1 >= totalRounds ? "See results" : "Next round"}</Text>
        </Pressable>
      ) : null}
      <FlatList
        data={ALPHABET}
        numColumns={7}
        keyExtractor={(l) => l}
        scrollEnabled={false}
        columnWrapperStyle={styles.row}
        contentContainerStyle={{ gap: 6, marginTop: 12 }}
        renderItem={({ item }) => {
          const used = guessed.has(item);
          return (
            <Pressable
              style={[
                styles.key,
                { borderColor: colors.border, backgroundColor: used ? colors.border : colors.surface },
              ]}
              disabled={used || !!roundResult}
              onPress={() => guess(item)}
            >
              <Text style={{ color: colors.text, fontWeight: "700" }}>{item}</Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  score: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  hint: { borderRadius: 12, padding: 12, marginBottom: 12 },
  word: { textAlign: "center", fontSize: 22, fontWeight: "800", letterSpacing: 4, marginVertical: 8 },
  next: { minHeight: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  nextText: { color: "#fff", fontWeight: "700" },
  row: { gap: 6, justifyContent: "center" },
  key: {
    minWidth: 44,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
