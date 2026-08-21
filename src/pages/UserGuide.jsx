import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { guideCategories, guideArticles, searchGuide, getArticlesByCategory } from "@/data/userGuideContent";
import { motion } from "framer-motion";
import {
  Search,
  BookOpen,
  Rocket,
  Trophy,
  Users,
  BarChart,
  CreditCard,
  ChevronRight,
  ArrowLeft,
  HelpCircle,
  CheckCircle2,
  Sparkles,
  Swords,
  Zap,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { VisualWalkthrough } from "@/components/guide/VisualWalkthrough";
import { VisualExplanation } from "@/components/guide/VisualExplanation";

const ICON_MAP = {
  rocket: Rocket,
  "book-open": BookOpen,
  trophy: Trophy,
  users: Users,
  "bar-chart": BarChart,
  "credit-card": CreditCard,
};

export default function UserGuide() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedArticle, setSelectedArticle] = useState(null);

  const filteredArticles = searchGuide(searchQuery);

  const handleSelectCategory = (catId) => {
    setSelectedCategory(catId);
    setSelectedArticle(null);
  };

  const handleSelectArticle = (article) => {
    setSelectedArticle(article);
  };

  // Quick Start articles mapping
  const quickStartArticles = [
    {
      id: "how-to-create-flashcard-sets",
      title: "Create Study Material",
      subtitle: "Upload PDF or notes & AI builds set",
      icon: Rocket,
      type: "walkthrough",
    },
    {
      id: "sm2-spaced-repetition-and-daily-review",
      title: "Start Daily Review",
      subtitle: "Master spaced repetition & card recall",
      icon: BookOpen,
      type: "visual_explanation",
    },
    {
      id: "xp-system-and-scoring-rules",
      title: "Understand XP & Scoring",
      subtitle: "Learn points breakdown & rules",
      icon: Trophy,
      type: "reference",
    },
    {
      id: "study-groups-and-quiz-challenges",
      title: "Challenge a Friend",
      subtitle: "Send 1v1 quiz challenges",
      icon: Swords,
      type: "walkthrough",
    },
  ];

  const getBadgeType = (type) => {
    switch (type) {
      case "walkthrough":
        return { label: "▶ Guided Walkthrough", color: "text-indigo-500 bg-indigo-500/10 border-indigo-500/20" };
      case "visual_explanation":
        return { label: "◎ Visual Explanation", color: "text-amber-500 bg-amber-500/10 border-amber-500/20" };
      case "reference":
      default:
        return { label: "≡ Reference", color: "text-slate-400 bg-slate-500/10 border-slate-500/20" };
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-6">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold mb-2">
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Interactive Platform Guide</span>
          </div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">Bilkeys Knowledge Base</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Learn how to get the most from Bilkeys with visual walkthroughs, interactive diagrams, and reference guides.
          </p>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search guide topics..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSelectedArticle(null);
            }}
            className="pl-9 bg-card border-border/80"
          />
        </div>
      </div>

      {/* Navigation Breadcrumb / Back Button */}
      {(selectedCategory || selectedArticle || searchQuery) && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs px-2 text-primary hover:text-primary"
            onClick={() => {
              setSelectedCategory(null);
              setSelectedArticle(null);
              setSearchQuery("");
            }}
          >
            <ArrowLeft className="w-3.5 h-3.5 mr-1" /> All Topics
          </Button>
          {selectedCategory && <span>/</span>}
          {selectedCategory && (
            <span className="font-medium text-foreground">
              {guideCategories.find((c) => c.id === selectedCategory)?.title}
            </span>
          )}
        </div>
      )}

      {/* ARTICLE DETAIL VIEW */}
      {selectedArticle ? (
        <div className="space-y-6">
          {selectedArticle.articleType === "walkthrough" ? (
            <VisualWalkthrough article={selectedArticle} />
          ) : selectedArticle.articleType === "visual_explanation" ? (
            <VisualExplanation article={selectedArticle} />
          ) : (
            /* Reference Article View */
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <div className="bg-card border border-border/80 rounded-2xl p-6 sm:p-8 space-y-6 shadow-sm">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 border border-slate-500/20 px-2 py-0.5 rounded bg-slate-500/10 inline-block mb-2">
                    ≡ Reference Guide
                  </span>
                  <h2 className="font-heading text-2xl font-bold text-foreground">{selectedArticle.title}</h2>
                  <p className="text-muted-foreground text-sm mt-2 leading-relaxed">{selectedArticle.summary}</p>
                </div>

                <div className="space-y-6 pt-4 border-t border-border/60">
                  {selectedArticle.sections.map((sec, idx) => (
                    <div key={idx} className="space-y-2">
                      <h3 className="font-heading font-semibold text-base text-foreground flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-primary" />
                        {sec.heading}
                      </h3>
                      <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line pl-6">
                        {sec.body}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* Try This in Bilkeys Action CTA */}
          {selectedArticle.action && (
            <div className="pt-2">
              <Button
                type="button"
                onClick={() => navigate(selectedArticle.action.webRoute)}
                className="w-full h-12 text-sm font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-md rounded-xl flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                {selectedArticle.action.label || "Try This in Bilkeys"}
              </Button>
            </div>
          )}
        </div>
      ) : searchQuery ? (
        /* SEARCH RESULTS VIEW */
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Search Results ({filteredArticles.length})
          </h2>
          {filteredArticles.length === 0 ? (
            <div className="text-center py-12 bg-card rounded-2xl border border-border p-6">
              <p className="text-muted-foreground text-sm">No articles matched "{searchQuery}".</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredArticles.map((art) => {
                const badge = getBadgeType(art.articleType);
                return (
                  <button
                    key={art.id}
                    type="button"
                    onClick={() => handleSelectArticle(art)}
                    className="p-5 rounded-2xl bg-card border border-border/80 hover:border-primary/50 cursor-pointer transition-all space-y-2 text-left w-full focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${badge.color}`}>
                      {badge.label}
                    </span>
                    <h3 className="font-heading font-semibold text-base text-foreground mt-1">{art.title}</h3>
                    <p className="text-xs text-muted-foreground line-clamp-2">{art.summary}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* MAIN GUIDE HOME VIEW */
        <div className="space-y-10">
          {/* QUICK START SECTION */}
          {!selectedCategory && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Quick Start — Essential Workflows
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {quickStartArticles.map((qs) => {
                  const targetArt = guideArticles.find((a) => a.id === qs.id);
                  const Icon = qs.icon;
                  const badge = getBadgeType(qs.type);
                  return (
                    <motion.button
                      key={qs.id}
                      type="button"
                      whileHover={{ y: -3 }}
                      onClick={() => targetArt && handleSelectArticle(targetArt)}
                      className="p-5 rounded-2xl bg-card border border-border/80 hover:border-primary/50 cursor-pointer transition-all space-y-3 shadow-sm flex flex-col justify-between text-left w-full focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <div className="space-y-2">
                        <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                          <Icon className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="font-heading font-bold text-sm text-foreground">{qs.title}</h3>
                          <p className="text-[11px] text-muted-foreground mt-0.5">{qs.subtitle}</p>
                        </div>
                      </div>
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded border self-start ${badge.color}`}>
                        {badge.label}
                      </span>
                    </motion.button>
                  );
                })}
              </div>
            </div>
          )}

          {/* CATEGORIES GRID */}
          <div className="space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Categories</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {guideCategories.map((cat) => {
                const Icon = ICON_MAP[cat.icon] || BookOpen;
                const isSelected = selectedCategory === cat.id;
                return (
                  <motion.button
                    key={cat.id}
                    type="button"
                    whileHover={{ scale: 1.01 }}
                    onClick={() => handleSelectCategory(cat.id)}
                    className={`p-5 rounded-2xl border transition-all cursor-pointer space-y-3 text-left w-full focus:outline-none focus:ring-2 focus:ring-primary ${
                      isSelected
                        ? "bg-primary/10 border-primary shadow-sm"
                        : "bg-card border-border/80 hover:border-primary/40"
                    }`}
                  >
                    <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-heading font-semibold text-base text-foreground">{cat.title}</h3>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{cat.description}</p>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </div>

          {/* CATEGORY ARTICLES LIST */}
          <div className="space-y-4 pt-4 border-t border-border/60">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {selectedCategory
                ? guideCategories.find((c) => c.id === selectedCategory)?.title
                : "All Help Articles"}
            </h2>
            <div className="space-y-3">
              {(selectedCategory
                ? getArticlesByCategory(selectedCategory)
                : guideArticles
              ).map((art) => {
                const badge = getBadgeType(art.articleType);
                return (
                  <button
                    key={art.id}
                    type="button"
                    onClick={() => handleSelectArticle(art)}
                    className="p-4 rounded-xl bg-card border border-border/70 hover:border-primary/50 cursor-pointer transition-all flex items-center justify-between gap-4 text-left w-full focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${badge.color}`}>
                          {badge.label}
                        </span>
                      </div>
                      <h3 className="font-heading font-semibold text-sm text-foreground truncate">{art.title}</h3>
                      <p className="text-xs text-muted-foreground truncate">{art.summary}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
