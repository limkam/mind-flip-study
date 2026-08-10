import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { demoData } from "../../../shared/guide/demoData";

export function MobileChapterSelectionDemo() {
  const chaptersList = demoData.chapterDemo.chapters;
  const [selected, setSelected] = useState<Record<string, boolean>>(() =>
    chaptersList.reduce((acc, ch) => ({ ...acc, [ch.key]: ch.defaultSelected }), {})
  );

  const toggle = (key: string) => {
    setSelected((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <View style={[styles.card, { backgroundColor: "#0f172a", borderColor: "#334155" }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: "#94a3b8" }]}>Target Chapters</Text>
        <Text style={[styles.countBadge, { color: "#818cf8" }]}>
          {Object.values(selected).filter(Boolean).length} Selected
        </Text>
      </View>

      <View style={styles.list}>
        {chaptersList.map((ch) => {
          const isChecked = selected[ch.key];
          return (
            <Pressable
              key={ch.key}
              onPress={() => toggle(ch.key)}
              style={[
                styles.itemRow,
                {
                  backgroundColor: isChecked ? "#312e8144" : "#1e293b44",
                  borderColor: isChecked ? "#6366f1" : "#1e293b",
                },
              ]}
            >
              <View style={[styles.checkbox, { backgroundColor: isChecked ? "#4f46e5" : "transparent" }]}>
                {isChecked ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
              </View>
              <Text style={[styles.itemText, { color: isChecked ? "#ffffff" : "#94a3b8" }]}>
                {ch.title}
              </Text>
              <Text style={styles.itemCount}>{ch.cards}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14, borderRadius: 16, borderWidth: 1, marginVertical: 8 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  headerTitle: { fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
  countBadge: { fontSize: 11, fontWeight: "800" },
  list: { gap: 8 },
  itemRow: { flexDirection: "row", alignItems: "center", padding: 10, borderRadius: 10, borderWidth: 1, gap: 10 },
  checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1, borderColor: "#6366f1", alignItems: "center", justifyContent: "center" },
  itemText: { flex: 1, fontSize: 12, fontWeight: "600" },
  itemCount: { fontSize: 10, color: "#64748b" },
});
