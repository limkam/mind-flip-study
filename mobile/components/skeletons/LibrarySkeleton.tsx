import { StyleSheet, View } from "react-native";

import { SkeletonBox } from "./SkeletonBox";

export function LibrarySkeleton() {
  return (
    <View style={styles.wrap}>
      <SkeletonBox width="50%" height={28} />
      <SkeletonBox width="30%" height={14} style={{ marginTop: 8 }} />
      <View style={styles.grid}>
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonBox key={i} height={88} borderRadius={12} style={styles.card} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, flex: 1 },
  grid: { marginTop: 20, gap: 10 },
  card: { width: "100%" },
});
