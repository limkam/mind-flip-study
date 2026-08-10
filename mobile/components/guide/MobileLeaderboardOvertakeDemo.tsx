import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { demoData } from "../../../shared/guide/demoData";

interface RankRow {
  rank: number;
  name: string;
  xp: number;
  isUser: boolean;
  moved?: "up" | "down";
}

export function MobileLeaderboardOvertakeDemo() {
  const [overtaken, setOvertaken] = useState(false);
  const { initialRows, overtakenRows, xpNeededToOvertake } = demoData.leaderboardDemo;
  const rows = overtaken ? (overtakenRows as RankRow[]) : (initialRows as RankRow[]);

  return (
    <View style={[styles.card, { backgroundColor: "#0f172a", borderColor: "#334155" }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: "#fbbf24" }]}>Strict Overtake Demo</Text>
        <Pressable
          onPress={() => setOvertaken(!overtaken)}
          style={[styles.btn, { backgroundColor: "#f59e0b22", borderColor: "#f59e0b44" }]}
        >
          <Text style={{ fontSize: 10, fontWeight: "800", color: "#fbbf24" }}>
            {overtaken ? "Reset" : `+${xpNeededToOvertake} XP Overtake`}
          </Text>
        </Pressable>
      </View>

      <View style={styles.list}>
        {rows.map((row) => (
          <View
            key={row.name}
            style={[
              styles.row,
              {
                backgroundColor: row.isUser ? "#78350f44" : "#1e293b44",
                borderColor: row.isUser ? "#f59e0b" : "#334155",
              },
            ]}
          >
            <View style={styles.left}>
              <View style={[styles.rankBox, { backgroundColor: row.isUser ? "#f59e0b" : "#334155" }]}>
                <Text style={{ fontSize: 11, fontWeight: "900", color: row.isUser ? "#0f172a" : "#ffffff" }}>
                  #{row.rank}
                </Text>
              </View>
              <Text style={[styles.name, { color: row.isUser ? "#fef3c7" : "#f8fafc" }]}>{row.name}</Text>
            </View>

            <View style={styles.right}>
              <Text style={{ fontSize: 12, fontWeight: "800", color: "#fbbf24" }}>{row.xp} XP</Text>
              {row.moved === "up" ? (
                <Text style={{ fontSize: 10, fontWeight: "800", color: "#10b981" }}>↑ +1</Text>
              ) : row.moved === "down" ? (
                <Text style={{ fontSize: 10, fontWeight: "800", color: "#f43f5e" }}>↓ -1</Text>
              ) : null}
            </View>
          </View>
        ))}
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          Score at least <Text style={{ color: "#fbbf24", fontWeight: "800" }}>551 XP (+31 XP)</Text> to strictly overtake competitor #25.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14, borderRadius: 16, borderWidth: 1, marginVertical: 8 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  headerTitle: { fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
  btn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  list: { gap: 6 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 10, borderRadius: 10, borderWidth: 1 },
  left: { flexDirection: "row", alignItems: "center", gap: 8 },
  rankBox: { width: 28, height: 28, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 12, fontWeight: "700" },
  right: { flexDirection: "row", alignItems: "center", gap: 6 },
  infoBox: { marginTop: 10, padding: 8, borderRadius: 8, backgroundColor: "#1e293b" },
  infoText: { fontSize: 11, color: "#94a3b8", lineHeight: 15 },
});
