import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { demoData } from "../../../shared/guide/demoData";

interface Props {
  stepId?: string;
}

export function MobileChallengeDemo({ stepId }: Props) {
  const [sent, setSent] = useState(false);
  const { opponentEmail, targetTopic, userScore, userTime, opponentScore, opponentTime } = demoData.challengeDemo;

  if (stepId === "compete_result") {
    return (
      <View style={[styles.card, { backgroundColor: "#0f172a", borderColor: "#334155" }]}>
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: "#c084fc" }]}>1v1 Scorecard Result</Text>
          <Text style={styles.completedBadge}>MATCH COMPLETED</Text>
        </View>

        <View style={styles.grid}>
          <View style={[styles.col, { backgroundColor: "#581c8744", borderColor: "#a855f7" }]}>
            <Text style={[styles.colLabel, { color: "#d8b4fe" }]}>YOU</Text>
            <Text style={styles.scoreText}>{userScore}</Text>
            <Text style={styles.timeText}>Time: {userTime}</Text>
          </View>
          <View style={[styles.col, { backgroundColor: "#1e293b", borderColor: "#334155" }]}>
            <Text style={[styles.colLabel, { color: "#94a3b8" }]}>CHALLENGER</Text>
            <Text style={[styles.scoreText, { color: "#cbd5e1" }]}>{opponentScore}</Text>
            <Text style={styles.timeText}>Time: {opponentTime}</Text>
          </View>
        </View>

        <View style={styles.victoryBanner}>
          <Text style={styles.victoryText}>🏆 Victory! You earned +20 XP and a match win badge.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: "#0f172a", borderColor: "#334155" }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: "#c084fc" }]}>Send 1v1 Quiz Challenge</Text>
        <Text style={{ fontSize: 10, color: "#94a3b8" }}>{targetTopic}</Text>
      </View>

      <View style={styles.body}>
        <Text style={styles.inputLabel}>Opponent Email or Peer:</Text>
        <View style={styles.inputRow}>
          <View style={styles.inputBox}>
            <Text style={styles.inputText}>{opponentEmail}</Text>
          </View>
          <Pressable onPress={() => setSent(!sent)} style={styles.sendBtn}>
            <Ionicons name={sent ? "checkmark-circle" : "send"} size={14} color="#fff" />
            <Text style={styles.sendBtnText}>{sent ? "Sent!" : "Send"}</Text>
          </Pressable>
        </View>

        {sent ? (
          <View style={styles.sentBanner}>
            <Text style={styles.sentBannerText}>Challenge invite sent to Haja! They will receive a notification.</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14, borderRadius: 16, borderWidth: 1, marginVertical: 8 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  headerTitle: { fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
  completedBadge: { fontSize: 9, fontWeight: "800", color: "#6ee7b7", backgroundColor: "#064e3b", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  grid: { flexDirection: "row", gap: 8, marginVertical: 6 },
  col: { flex: 1, padding: 12, borderRadius: 12, borderWidth: 1, alignItems: "center" },
  colLabel: { fontSize: 10, fontWeight: "800" },
  scoreText: { fontSize: 20, fontWeight: "900", color: "#ffffff", marginVertical: 2 },
  timeText: { fontSize: 9, color: "#94a3b8" },
  victoryBanner: { padding: 8, borderRadius: 8, backgroundColor: "#064e3b44", borderWidth: 1, borderColor: "#10b98144", marginTop: 6 },
  victoryText: { fontSize: 11, fontWeight: "700", color: "#6ee7b7", textAlign: "center" },
  body: { gap: 6 },
  inputLabel: { fontSize: 10, fontWeight: "700", color: "#94a3b8" },
  inputRow: { flexDirection: "row", gap: 6 },
  inputBox: { flex: 1, backgroundColor: "#1e293b", padding: 8, borderRadius: 8, justifyContent: "center" },
  inputText: { fontSize: 11, color: "#e2e8f0" },
  sendBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#9333ea", paddingHorizontal: 12, borderRadius: 8 },
  sendBtnText: { color: "#ffffff", fontSize: 11, fontWeight: "700" },
  sentBanner: { padding: 8, borderRadius: 8, backgroundColor: "#581c8744", marginTop: 4 },
  sentBannerText: { fontSize: 10, color: "#e9d5ff", textAlign: "center" },
});
