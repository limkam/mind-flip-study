import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "../../hooks/useTheme";

const DEFAULT_VISIBLE = 5;

type Props = {
  chapters?: string[];
  title?: string;
  initialVisible?: number;
};

export function SelectedChaptersList({
  chapters = [],
  title = "Selected Chapters",
  initialVisible = DEFAULT_VISIBLE,
}: Props) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);

  if (!chapters.length) return null;

  const count = chapters.length;
  const heading = `${title} (${count})`;
  const hasMore = count > initialVisible;
  const visible = expanded || !hasMore ? chapters : chapters.slice(0, initialVisible);
  const hiddenCount = Math.max(0, count - initialVisible);

  return (
    <View style={[styles.wrap, { backgroundColor: `${colors.muted}18`, borderColor: colors.border }]}>
      <Text style={[styles.heading, { color: colors.text }]}>{heading}</Text>
      {visible.map((chapter) => (
        <Text key={chapter} style={[styles.item, { color: colors.muted }]}>
          • {chapter}
        </Text>
      ))}
      {hasMore && !expanded ? (
        <Text style={[styles.more, { color: colors.muted }]}>
          +{hiddenCount} more chapter{hiddenCount !== 1 ? "s" : ""}
        </Text>
      ) : null}
      {hasMore ? (
        <Pressable onPress={() => setExpanded((v) => !v)} hitSlop={8}>
          <Text style={[styles.toggle, { color: colors.primary }]}>
            {expanded ? "Show less" : "Show all"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginTop: 8,
    marginBottom: 8,
  },
  heading: { fontSize: 14, fontWeight: "700", marginBottom: 8 },
  item: { fontSize: 13, lineHeight: 20, marginBottom: 4 },
  more: { fontSize: 13, fontWeight: "600", marginTop: 4 },
  toggle: { fontSize: 13, fontWeight: "700", marginTop: 8 },
});
