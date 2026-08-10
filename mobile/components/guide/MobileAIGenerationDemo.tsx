import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export function MobileAIGenerationDemo() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setProgress((prev) => (prev >= 100 ? 100 : prev + 25));
    }, 600);
    return () => clearInterval(timer);
  }, []);

  return (
    <View style={[styles.card, { backgroundColor: "#0f172a", borderColor: "#334155" }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: "#fbbf24" }]}>AI Generation Progress</Text>
        <Pressable onPress={() => setProgress(0)}>
          <Ionicons name="refresh" size={16} color="#94a3b8" />
        </Pressable>
      </View>

      <View style={styles.barContainer}>
        <View style={styles.barHeader}>
          <Text style={{ fontSize: 12, fontWeight: "600", color: "#f8fafc" }}>Building Cards & Quiz</Text>
          <Text style={{ fontSize: 12, fontWeight: "800", color: "#818cf8" }}>{progress}%</Text>
        </View>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${progress}%` }]} />
        </View>
      </View>

      <View style={styles.badgeRow}>
        {[
          { label: "Flashcards", done: progress >= 30 },
          { label: "Quiz", done: progress >= 60 },
          { label: "Summary", done: progress >= 90 },
        ].map((b, i) => (
          <View
            key={i}
            style={[
              styles.badge,
              {
                backgroundColor: b.done ? "#064e3b" : "#1e293b",
                borderColor: b.done ? "#10b981" : "#334155",
              },
            ]}
          >
            <Ionicons name={b.done ? "checkmark-circle" : "ellipse-outline"} size={12} color={b.done ? "#10b981" : "#64748b"} />
            <Text style={[styles.badgeText, { color: b.done ? "#6ee7b7" : "#64748b" }]}>{b.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14, borderRadius: 16, borderWidth: 1, marginVertical: 8 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  headerTitle: { fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
  barContainer: { marginVertical: 6 },
  barHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  track: { height: 8, borderRadius: 4, backgroundColor: "#1e293b", overflow: "hidden" },
  fill: { height: "100%", backgroundColor: "#6366f1" },
  badgeRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 10, gap: 6 },
  badge: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 6, borderRadius: 8, borderWidth: 1, gap: 4 },
  badgeText: { fontSize: 10, fontWeight: "700" },
});
