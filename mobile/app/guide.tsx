import { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { PageHeader } from "../components/PageHeader";
import { Screen } from "../components/Screen";
import { useScreenHeader } from "../hooks/useScreenHeader";
import { useTheme } from "../hooks/useTheme";
import guideData from "@shared/guide/userGuideContent.json";

import { MobileVisualWalkthrough } from "../components/guide/MobileVisualWalkthrough";
import { MobileVisualExplanation } from "../components/guide/MobileVisualExplanation";

interface Step {
  id: string;
  title: string;
  description: string;
  visualType?: string;
  platformText?: { web: string; mobile: string };
  tip?: string;
}

interface Section {
  heading: string;
  body: string;
}

interface Action {
  type: string;
  webRoute: string;
  mobileRoute: string;
  marketingAction: string;
  label: string;
}

interface Article {
  id: string;
  categoryId: string;
  title: string;
  summary: string;
  articleType?: string;
  visualType?: string;
  keywords: string[];
  action?: Action;
  steps?: Step[];
  sections: Section[];
}

interface Category {
  id: string;
  title: string;
  icon: string;
  description: string;
}

const categories: Category[] = guideData.categories;
const articles: Article[] = guideData.articles;

export default function MobileUserGuideScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const header = useScreenHeader("User Guide");

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);

  const filteredArticles = articles.filter((art) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    const inTitle = art.title.toLowerCase().includes(q);
    const inSummary = art.summary.toLowerCase().includes(q);
    const inKeywords = art.keywords.some((k) => k.toLowerCase().includes(q));
    const inSteps = art.steps?.some(
      (st) => st.title.toLowerCase().includes(q) || st.description.toLowerCase().includes(q)
    );
    return inTitle || inSummary || inKeywords || Boolean(inSteps);
  });

  const categoryArticles = selectedCatId
    ? articles.filter((art) => art.categoryId === selectedCatId)
    : filteredArticles;

  const quickStartList = [
    { id: "how-to-create-flashcard-sets", label: "Create Cards", icon: "rocket-outline" },
    { id: "sm2-spaced-repetition-and-daily-review", label: "Daily Review", icon: "bulb-outline" },
    { id: "xp-system-and-scoring-rules", label: "XP Rules", icon: "trophy-outline" },
    { id: "study-groups-and-quiz-challenges", label: "1v1 Challenge", icon: "flash-outline" },
  ];

  const getBadgeInfo = (type?: string) => {
    switch (type) {
      case "walkthrough":
        return { label: "▶ Guided Walkthrough", color: "#818cf8", bg: "#312e8144" };
      case "visual_explanation":
        return { label: "◎ Visual Explanation", color: "#fbbf24", bg: "#78350f44" };
      case "reference":
      default:
        return { label: "≡ Reference", color: "#94a3b8", bg: "#1e293b44" };
    }
  };

  return (
    <Screen>
      {header}
      <PageHeader
        title="User Guide"
        subtitle="Learn how to study, earn XP, track progress, and manage your account"
      />

      <View style={styles.container}>
        {/* Search Bar */}
        <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search guide topics..."
            placeholderTextColor={colors.muted}
            value={searchQuery}
            onChangeText={(text) => {
              setSearchQuery(text);
              setSelectedArticle(null);
            }}
          />
          {searchQuery ? (
            <Pressable onPress={() => setSearchQuery("")}>
              <Ionicons name="close-circle" size={18} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>

        {/* Back / Navigation Indicator */}
        {selectedArticle || selectedCatId || searchQuery ? (
          <Pressable
            onPress={() => {
              setSelectedArticle(null);
              setSelectedCatId(null);
              setSearchQuery("");
            }}
            style={styles.backBtn}
          >
            <Ionicons name="arrow-back" size={16} color={colors.primary} />
            <Text style={[styles.backText, { color: colors.primary }]}>All Topics</Text>
          </Pressable>
        ) : null}

        {/* Detailed Article View */}
        {selectedArticle ? (
          <ScrollView contentContainerStyle={styles.articleDetail} showsVerticalScrollIndicator={false}>
            {selectedArticle.articleType === "walkthrough" ? (
              <MobileVisualWalkthrough article={selectedArticle} />
            ) : selectedArticle.articleType === "visual_explanation" ? (
              <MobileVisualExplanation article={selectedArticle} />
            ) : (
              /* Reference Article View */
              <View style={[styles.refCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.refBadge}>
                  <Text style={{ fontSize: 10, fontWeight: "800", color: colors.muted }}>≡ Reference Guide</Text>
                </View>
                <Text style={[styles.articleCat, { color: colors.primary }]}>
                  {categories.find((c) => c.id === selectedArticle.categoryId)?.title}
                </Text>
                <Text style={[styles.articleTitle, { color: colors.text }]}>{selectedArticle.title}</Text>
                <Text style={[styles.articleSummary, { color: colors.muted }]}>{selectedArticle.summary}</Text>

                <View style={[styles.divider, { backgroundColor: colors.border }]} />

                {selectedArticle.sections.map((sec, idx) => (
                  <View key={idx} style={styles.sectionBlock}>
                    <Text style={[styles.sectionHeading, { color: colors.text }]}>✓ {sec.heading}</Text>
                    <Text style={[styles.sectionBody, { color: colors.muted }]}>{sec.body}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Try This in Bilkeys Action CTA */}
            {selectedArticle.action ? (
              <Pressable
                onPress={() => router.push(selectedArticle.action!.mobileRoute as any)}
                style={[styles.ctaBtn, { backgroundColor: colors.primary }]}
              >
                <Ionicons name="sparkles" size={16} color="#ffffff" />
                <Text style={styles.ctaBtnText}>
                  {selectedArticle.action.label || "Try This in Bilkeys"}
                </Text>
              </Pressable>
            ) : null}
          </ScrollView>
        ) : (
          <ScrollView contentContainerStyle={styles.scrollList} showsVerticalScrollIndicator={false}>
            {/* Quick Start Horizontal Cards */}
            {!searchQuery && !selectedCatId ? (
              <View style={styles.quickStartSection}>
                <Text style={[styles.sectionTitle, { color: colors.muted }]}>⚡ Quick Start — Key Workflows</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.qsRow}>
                  {quickStartList.map((qs) => {
                    const target = articles.find((a) => a.id === qs.id);
                    return (
                      <Pressable
                        key={qs.id}
                        onPress={() => target && setSelectedArticle(target)}
                        style={[styles.qsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                      >
                        <View style={[styles.qsIcon, { backgroundColor: colors.primary + "22" }]}>
                          <Ionicons name={qs.icon as any} size={18} color={colors.primary} />
                        </View>
                        <Text style={[styles.qsLabel, { color: colors.text }]}>{qs.label}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}

            {/* Categories Pills */}
            {!searchQuery ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catRow}>
                <Pressable
                  onPress={() => setSelectedCatId(null)}
                  style={[
                    styles.catPill,
                    {
                      backgroundColor: selectedCatId === null ? colors.primary : colors.surface,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.catPillText,
                      { color: selectedCatId === null ? "#ffffff" : colors.text },
                    ]}
                  >
                    All Categories
                  </Text>
                </Pressable>
                {categories.map((cat) => (
                  <Pressable
                    key={cat.id}
                    onPress={() => setSelectedCatId(cat.id)}
                    style={[
                      styles.catPill,
                      {
                        backgroundColor: selectedCatId === cat.id ? colors.primary : colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.catPillText,
                        { color: selectedCatId === cat.id ? "#ffffff" : colors.text },
                      ]}
                    >
                      {cat.title}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}

            {/* Articles List */}
            <Text style={[styles.listHeader, { color: colors.muted }]}>
              {selectedCatId
                ? categories.find((c) => c.id === selectedCatId)?.title
                : searchQuery
                ? `Results (${filteredArticles.length})`
                : "Help Articles"}
            </Text>

            {categoryArticles.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.muted }]}>
                No help articles found.
              </Text>
            ) : (
              categoryArticles.map((art) => {
                const badge = getBadgeInfo(art.articleType);
                return (
                  <Pressable
                    key={art.id}
                    onPress={() => setSelectedArticle(art)}
                    style={[styles.articleCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  >
                    <View style={{ flex: 1 }}>
                      <View style={[styles.badgeTag, { backgroundColor: badge.bg }]}>
                        <Text style={[styles.badgeTagText, { color: badge.color }]}>{badge.label}</Text>
                      </View>
                      <Text style={[styles.cardTitle, { color: colors.text }]}>{art.title}</Text>
                      <Text style={[styles.cardSummary, { color: colors.muted }]} numberOfLines={2}>
                        {art.summary}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    marginBottom: 12,
  },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 },
  backText: { fontSize: 13, fontWeight: "700" },
  quickStartSection: { marginBottom: 16 },
  sectionTitle: { fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  qsRow: { flexDirection: "row" },
  qsCard: { padding: 12, borderRadius: 14, borderWidth: 1, marginRight: 8, alignItems: "center", width: 100, gap: 6 },
  qsIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  qsLabel: { fontSize: 11, fontWeight: "700", textAlign: "center" },
  catRow: { flexDirection: "row", marginBottom: 16 },
  catPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, marginRight: 8 },
  catPillText: { fontSize: 12, fontWeight: "600" },
  scrollList: { paddingBottom: 40 },
  listHeader: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 },
  articleCard: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 10, gap: 10 },
  badgeTag: { alignSelf: "flex-start", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginBottom: 4 },
  badgeTagText: { fontSize: 9, fontWeight: "800" },
  cardTitle: { fontSize: 15, fontWeight: "700", marginBottom: 4 },
  cardSummary: { fontSize: 12, lineHeight: 16 },
  emptyText: { textAlign: "center", marginVertical: 32, fontSize: 14 },
  articleDetail: { paddingBottom: 40 },
  refCard: { padding: 16, borderRadius: 20, borderWidth: 1 },
  refBadge: { alignSelf: "flex-start", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: "#1e293b", marginBottom: 8 },
  articleCat: { fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  articleTitle: { fontSize: 22, fontWeight: "800", marginBottom: 8 },
  articleSummary: { fontSize: 14, lineHeight: 20 },
  divider: { height: 1, marginVertical: 16 },
  sectionBlock: { marginBottom: 16 },
  sectionHeading: { fontSize: 16, fontWeight: "700", marginBottom: 6 },
  sectionBody: { fontSize: 13, lineHeight: 19 },
  ctaBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 16,
  },
  ctaBtnText: { color: "#ffffff", fontSize: 14, fontWeight: "800" },
});
