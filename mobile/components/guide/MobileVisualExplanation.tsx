import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { RenderMobileVisualDemo } from "./MobileVisualRegistry";
import { useTheme } from "../../hooks/useTheme";

interface Section {
  heading: string;
  body: string;
}

interface Article {
  id: string;
  title: string;
  summary: string;
  visualType?: string;
  sections?: Section[];
}

export function MobileVisualExplanation({ article }: { article: Article }) {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.tag, { color: "#f59e0b" }]}>◎ Visual Explanation</Text>
      <Text style={[styles.title, { color: colors.text }]}>{article.title}</Text>
      <Text style={[styles.summary, { color: colors.muted }]}>{article.summary}</Text>

      {article.visualType ? (
        <RenderMobileVisualDemo visualType={article.visualType} />
      ) : null}

      {article.sections && article.sections.length > 0 ? (
        <View style={[styles.sectionsBlock, { borderTopColor: colors.border }]}>
          <Text style={[styles.sectionHeader, { color: colors.muted }]}>Detailed Explanation</Text>
          {article.sections.map((sec, idx) => (
            <View key={idx} style={styles.secItem}>
              <Text style={[styles.secHeading, { color: colors.text }]}>✓ {sec.heading}</Text>
              <Text style={[styles.secBody, { color: colors.muted }]}>{sec.body}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, borderRadius: 20, borderWidth: 1, marginVertical: 8 },
  tag: { fontSize: 10, fontWeight: "800", textTransform: "uppercase", marginBottom: 2 },
  title: { fontSize: 20, fontWeight: "800", marginBottom: 4 },
  summary: { fontSize: 13, lineHeight: 18, marginBottom: 10 },
  sectionsBlock: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, gap: 10 },
  sectionHeader: { fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
  secItem: { gap: 3 },
  secHeading: { fontSize: 14, fontWeight: "700" },
  secBody: { fontSize: 12, lineHeight: 17 },
});
