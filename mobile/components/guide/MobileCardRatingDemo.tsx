import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { demoData } from "../../../shared/guide/demoData";

export function MobileCardRatingDemo() {
  const [isFlipped, setIsFlipped] = useState(false);
  const [lastRating, setLastRating] = useState<number | null>(null);

  const { question, answer, ratings } = demoData.cardRatingDemo;
  const currentSchedule = ratings.find((r) => r.score === lastRating);

  return (
    <View style={[styles.card, { backgroundColor: "#0f172a", borderColor: "#334155" }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: "#818cf8" }]}>Flashcard & Spaced Repetition</Text>
        <Text style={{ fontSize: 10, color: "#64748b" }}>Tap card to flip</Text>
      </View>

      <Pressable onPress={() => setIsFlipped(!isFlipped)} style={styles.flashcard}>
        <View style={styles.cardTag}>
          <Text style={{ fontSize: 10, fontWeight: "700", color: "#818cf8" }}>
            {!isFlipped ? "FRONT (Question)" : "BACK (Answer)"}
          </Text>
          <Ionicons name="swap-horizontal" size={14} color="#818cf8" />
        </View>

        <Text style={styles.cardBody}>
          {!isFlipped ? question : answer}
        </Text>
      </Pressable>

      <Text style={styles.rateLabel}>Rate Your Recall Confidence (1 to 5):</Text>

      <View style={styles.btnRow}>
        {ratings.map((r) => (
          <Pressable
            key={r.score}
            onPress={() => {
              setLastRating(r.score);
              if (!isFlipped) setIsFlipped(true);
            }}
            style={[
              styles.rateBtn,
              {
                backgroundColor: lastRating === r.score ? "#4f46e5" : "#1e293b",
                borderColor: lastRating === r.score ? "#818cf8" : "#334155",
              },
            ]}
          >
            <Text style={[styles.rateBtnText, { color: lastRating === r.score ? "#ffffff" : "#94a3b8" }]}>
              {r.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {currentSchedule ? (
        <View style={styles.feedbackBox}>
          <Ionicons name="calendar-outline" size={14} color="#a5b4fc" />
          <Text style={styles.feedbackText}>{currentSchedule.schedule}</Text>
        </View>
      ) : null}

      <View style={styles.timeline}>
        <Text style={styles.timelineTitle}>Illustrative Memory Timeline:</Text>
        <View style={styles.timelineRow}>
          {[
            { label: "Today", active: true },
            { label: "Sooner", active: lastRating === 1 },
            { label: "Moderate", active: lastRating === 2 || lastRating === 3 },
            { label: "Later", active: lastRating === 4 || lastRating === 5 },
          ].map((item, idx) => (
            <View key={idx} style={styles.timePoint}>
              <View style={[styles.dot, { backgroundColor: item.active ? "#10b981" : "#334155" }]} />
              <Text style={[styles.timeLabel, { color: item.active ? "#6ee7b7" : "#64748b" }]}>{item.label}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14, borderRadius: 16, borderWidth: 1, marginVertical: 8 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  headerTitle: { fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
  flashcard: { backgroundColor: "#1e293b", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#334155", minHeight: 90, justifyContent: "space-between" },
  cardTag: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardBody: { fontSize: 13, fontWeight: "700", color: "#f8fafc", marginVertical: 6 },
  rateLabel: { fontSize: 11, fontWeight: "700", color: "#94a3b8", marginTop: 10, marginBottom: 6 },
  btnRow: { flexDirection: "row", gap: 4 },
  rateBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, alignItems: "center" },
  rateBtnText: { fontSize: 10, fontWeight: "800" },
  feedbackBox: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#312e8144", padding: 8, borderRadius: 8, marginTop: 8 },
  feedbackText: { fontSize: 11, fontWeight: "700", color: "#a5b4fc" },
  timeline: { marginTop: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#1e293b" },
  timelineTitle: { fontSize: 10, fontWeight: "700", color: "#64748b", marginBottom: 6 },
  timelineRow: { flexDirection: "row", justifyContent: "space-between" },
  timePoint: { alignItems: "center" },
  dot: { width: 8, height: 8, borderRadius: 4, marginBottom: 4 },
  timeLabel: { fontSize: 9, fontWeight: "700" },
});
