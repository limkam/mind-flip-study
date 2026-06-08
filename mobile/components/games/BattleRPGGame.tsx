import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withSequence, withTiming } from "react-native-reanimated";

import { buildMcq } from "../../lib/gameUtils";
import { hapticError, hapticImpact, hapticSuccess } from "../../lib/haptics";
import { useTheme } from "../../hooks/useTheme";
import type { GameProps } from "./types";
import { GameResult } from "./GameResult";
import { McqOptions } from "./McqOptions";

const PLAYER_MAX = 100;
const ENEMY_MAX = 100;
const ENEMIES = [
  { name: "Goblin", emoji: "👺" },
  { name: "Dragon", emoji: "🐉" },
  { name: "Wizard", emoji: "🧙" },
  { name: "Robot", emoji: "🤖" },
];

function HpBar({ hp, max, fill }: { hp: number; max: number; fill: string }) {
  const width = useSharedValue((hp / max) * 100);
  width.value = withSpring((hp / max) * 100);
  const style = useAnimatedStyle(() => ({ width: `${width.value}%` }));
  return (
    <View style={styles.hpTrack}>
      <Animated.View style={[styles.hpFill, style, { backgroundColor: fill }]} />
    </View>
  );
}

export function BattleRPGGame({ cards, onComplete }: GameProps) {
  const { colors } = useTheme();
  const questions = useMemo(() => buildMcq(cards, Math.min(12, cards.length), 4), [cards]);
  const [enemy] = useState(() => ENEMIES[Math.floor(Math.random() * ENEMIES.length)]);
  const [idx, setIdx] = useState(0);
  const [playerHp, setPlayerHp] = useState(PLAYER_MAX);
  const [enemyHp, setEnemyHp] = useState(ENEMY_MAX);
  const [selected, setSelected] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [log, setLog] = useState("");
  const [score, setScore] = useState(0);
  const [winner, setWinner] = useState<"player" | "enemy" | null>(null);
  const shake = useSharedValue(0);

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shake.value }],
  }));

  const triggerShake = () => {
    shake.value = withSequence(
      withTiming(-8, { duration: 50 }),
      withTiming(8, { duration: 50 }),
      withTiming(0, { duration: 50 }),
    );
  };

  const q = questions[idx];

  const answer = (opt: string) => {
    if (showResult || winner) return;
    setSelected(opt);
    setShowResult(true);
    const correct = opt === q?.correct;
    if (correct) {
      const dmg = 22 + Math.floor(Math.random() * 8);
      setLog(`You deal ${dmg} damage!`);
      setScore((s) => s + 1);
      triggerShake();
      void hapticSuccess();
      setEnemyHp((hp) => {
        const next = Math.max(0, hp - dmg);
        if (next === 0) setWinner("player");
        return next;
      });
    } else {
      const dmg = 18 + Math.floor(Math.random() * 6);
      setLog(`${enemy.name} hits for ${dmg}!`);
      triggerShake();
      void hapticError();
      setPlayerHp((hp) => {
        const next = Math.max(0, hp - dmg);
        if (next === 0) setWinner("enemy");
        return next;
      });
    }
  };

  const next = () => {
    if (winner || idx + 1 >= questions.length) {
      if (!winner) setWinner(playerHp >= enemyHp ? "player" : "enemy");
      return;
    }
    setIdx((i) => i + 1);
    setSelected(null);
    setShowResult(false);
    setLog("");
  };

  if (winner) {
    return (
      <GameResult
        emoji={winner === "player" ? "🏆" : "💀"}
        title={winner === "player" ? "Victory!" : `Defeated by ${enemy.name}`}
        subtitle={`${score} correct · ${playerHp} HP left`}
        onPrimary={() =>
          onComplete({ playerScore: score, computerScore: questions.length - score, totalRounds: questions.length })
        }
      />
    );
  }

  return (
    <View>
      <View style={[styles.arena, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.fighter}>
          <Text style={{ color: colors.success, fontSize: 12, fontWeight: "700" }}>YOU</Text>
          <HpBar hp={playerHp} max={PLAYER_MAX} fill={colors.success} />
          <Animated.Text style={[styles.emoji, shakeStyle]}>🧙‍♂️</Animated.Text>
        </View>
        <View style={styles.fighter}>
          <Text style={{ color: colors.danger, fontSize: 12, fontWeight: "700" }}>{enemy.name.toUpperCase()}</Text>
          <HpBar hp={enemyHp} max={ENEMY_MAX} fill={colors.danger} />
          <Text style={styles.emoji}>{enemy.emoji}</Text>
        </View>
      </View>
      {log ? <Text style={{ color: colors.muted, textAlign: "center", marginBottom: 8 }}>{log}</Text> : null}
      <View style={[styles.qCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={{ color: colors.text, fontWeight: "600", textAlign: "center" }}>{q?.question}</Text>
      </View>
      <McqOptions
        options={q?.options ?? []}
        selected={selected}
        correct={q?.correct ?? null}
        showResult={showResult}
        disabled={!!winner}
        onSelect={answer}
      />
      {showResult ? (
        <Pressable style={[styles.next, { backgroundColor: colors.primary }]} onPress={() => { void hapticImpact("light"); next(); }}>
          <Text style={styles.nextText}>Continue</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  arena: { borderRadius: 16, borderWidth: 1, padding: 16, flexDirection: "row", gap: 12, marginBottom: 12 },
  fighter: { flex: 1, alignItems: "center", gap: 6 },
  hpTrack: { height: 8, width: "100%", backgroundColor: "#33415555", borderRadius: 8, overflow: "hidden" },
  hpFill: { height: 8, borderRadius: 8 },
  emoji: { fontSize: 40, marginTop: 4 },
  qCard: { borderRadius: 12, borderWidth: 1, padding: 16 },
  next: { marginTop: 12, minHeight: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  nextText: { color: "#fff", fontWeight: "700" },
});
