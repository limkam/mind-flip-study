import { StyleSheet, Text, View } from "react-native";

import { useTheme } from "../../hooks/useTheme";
import { chapterSelectionSubtitle, parseStudySetDisplay, type StudySetDisplayInput } from "../../lib/studySetDisplay";
import { SelectedChaptersList } from "./SelectedChaptersList";

type Props = {
  setMeta: StudySetDisplayInput & { card_count?: number };
  cardCount?: number;
};

export function StudySetHeader({ setMeta, cardCount }: Props) {
  const { colors } = useTheme();
  const { title, chapters, chapterCount } = parseStudySetDisplay(setMeta);
  const subtitle = chapterSelectionSubtitle(chapterCount);
  const count = cardCount ?? setMeta.card_count ?? 0;

  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, { color: colors.text }]} numberOfLines={3}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={[styles.subtitle, { color: colors.primary }]}>{subtitle}</Text>
      ) : null}
      <Text style={[styles.meta, { color: colors.muted }]}>
        {count} card{count !== 1 ? "s" : ""}
      </Text>
      {chapters.length > 0 ? <SelectedChaptersList chapters={chapters} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingBottom: 12, paddingTop: 4 },
  title: { fontSize: 20, fontWeight: "800", lineHeight: 26 },
  subtitle: { fontSize: 13, fontWeight: "600", marginTop: 4 },
  meta: { fontSize: 13, marginTop: 4 },
});
