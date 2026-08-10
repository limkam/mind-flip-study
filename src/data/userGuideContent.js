import guideData from "@shared/guide/userGuideContent.json";

export const guideCategories = guideData.categories;

export const guideArticles = guideData.articles.map((art) => ({
  ...art,
  articleType: art.articleType || "reference",
  steps: art.steps || [],
  sections: art.sections || [],
  keywords: art.keywords || [],
}));

export function searchGuide(query = "") {
  const q = query.toLowerCase().trim();
  if (!q) return guideArticles;
  return guideArticles.filter((article) => {
    const inTitle = article.title.toLowerCase().includes(q);
    const inSummary = article.summary.toLowerCase().includes(q);
    const inKeywords = article.keywords.some((k) => k.toLowerCase().includes(q));
    const inSections = article.sections.some(
      (s) => s.heading.toLowerCase().includes(q) || s.body.toLowerCase().includes(q)
    );
    const inSteps = article.steps.some(
      (st) =>
        st.title.toLowerCase().includes(q) ||
        st.description.toLowerCase().includes(q) ||
        (st.platformText?.web && st.platformText.web.toLowerCase().includes(q)) ||
        (st.platformText?.mobile && st.platformText.mobile.toLowerCase().includes(q))
    );
    return inTitle || inSummary || inKeywords || inSections || inSteps;
  });
}

export function getArticlesByCategory(categoryId) {
  return guideArticles.filter((article) => article.categoryId === categoryId);
}

export function getArticleById(id) {
  return guideArticles.find((article) => article.id === id);
}
