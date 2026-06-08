import { StyleSheet, View } from "react-native";

import { SkeletonBox } from "./SkeletonBox";

export function StudySkeleton() {
  return (
    <View style={styles.wrap}>
      <SkeletonBox width="40%" height={14} />
      <SkeletonBox height={6} borderRadius={4} style={{ marginTop: 12 }} />
      <SkeletonBox height={260} borderRadius={16} style={{ marginTop: 20 }} />
      <View style={styles.row}>
        <SkeletonBox width="22%" height={44} borderRadius={10} />
        <SkeletonBox width="22%" height={44} borderRadius={10} />
        <SkeletonBox width="22%" height={44} borderRadius={10} />
        <SkeletonBox width="22%" height={44} borderRadius={10} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 20, flex: 1 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 20,
    gap: 8,
  },
});
