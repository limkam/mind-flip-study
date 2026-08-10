import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { demoData } from "../../../shared/guide/demoData";

export function MobileUploadDemo() {
  const [uploaded, setUploaded] = useState(true);
  const { fileName, fileSize, pages, supportedFormats } = demoData.uploadDemo;

  return (
    <View style={[styles.card, { backgroundColor: "#0f172a", borderColor: "#334155" }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: "#818cf8" }]}>Document Upload</Text>
        <Pressable
          onPress={() => setUploaded(!uploaded)}
          style={[styles.resetBtn, { backgroundColor: "#1e293b" }]}
        >
          <Text style={{ color: "#94a3b8", fontSize: 10, fontWeight: "700" }}>
            {uploaded ? "Reset" : "Simulate Select"}
          </Text>
        </Pressable>
      </View>

      <Pressable
        onPress={() => setUploaded(!uploaded)}
        style={[
          styles.dropzone,
          {
            borderColor: uploaded ? "#10b981" : "#6366f1",
            backgroundColor: uploaded ? "#064e3b33" : "#1e293b66",
          },
        ]}
      >
        {!uploaded ? (
          <View style={{ alignItems: "center" }}>
            <Ionicons name="cloud-upload-outline" size={32} color="#818cf8" />
            <Text style={[styles.dropTitle, { color: "#f8fafc" }]}>Import PDF or Lecture Document</Text>
            <Text style={[styles.dropSub, { color: "#94a3b8" }]}>{supportedFormats}</Text>
          </View>
        ) : (
          <View style={styles.fileRow}>
            <View style={styles.badge}>
              <Text style={{ color: "#f43f5e", fontWeight: "900", fontSize: 10 }}>PDF</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.fileName, { color: "#f8fafc" }]} numberOfLines={1}>
                {fileName}
              </Text>
              <Text style={[styles.fileSize, { color: "#94a3b8" }]}>{fileSize} · About {pages} pages</Text>
            </View>
            <Ionicons name="checkmark-circle" size={20} color="#10b981" />
          </View>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14, borderRadius: 16, borderWidth: 1, marginVertical: 8 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  headerTitle: { fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
  resetBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  dropzone: { borderWidth: 1.5, borderStyle: "dashed", padding: 16, borderRadius: 12, minHeight: 90, justifyContent: "center" },
  dropTitle: { fontSize: 13, fontWeight: "700", marginTop: 4 },
  dropSub: { fontSize: 11, marginTop: 2 },
  fileRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  badge: { width: 32, height: 32, borderRadius: 8, backgroundColor: "#f43f5e22", alignItems: "center", justifyContent: "center" },
  fileName: { fontSize: 12, fontWeight: "700" },
  fileSize: { fontSize: 10, marginTop: 2 },
});
