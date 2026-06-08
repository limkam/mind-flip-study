import { StyleSheet, View } from "react-native";

import { SkeletonBox } from "./SkeletonBox";

export function DashboardSkeleton() {
  return (
    <View style={styles.wrap}>
      <SkeletonBox width="60%" height={28} />
      <SkeletonBox width="40%" height={14} style={{ marginTop: 8 }} />
      <View style={styles.statsRow}>
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonBox key={i} height={72} borderRadius={14} style={styles.stat} />
        ))}
      </View>
      <SkeletonBox height={120} borderRadius={14} style={{ marginTop: 16 }} />
      <SkeletonBox height={160} borderRadius={14} style={{ marginTop: 12 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, flex: 1 },
  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 20,
  },
  stat: { flexGrow: 1, minWidth: "22%" },
});
