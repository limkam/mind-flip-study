import { Ionicons } from "@expo/vector-icons";
import type { Href } from "expo-router";

export type NavigationFeature = "challenges" | "scorecards";

export type TabNavItem = {
  name: "index" | "library" | "flashcards" | "more";
  label: string;
  accessibilityLabel: string;
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon: keyof typeof Ionicons.glyphMap;
};

export type AppNavItem = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  href: Href;
  feature?: NavigationFeature;
};

export type MoreNavSection = {
  title: string;
  items: AppNavItem[];
};

/** Permanent destinations represent stable, high-frequency mobile jobs. */
export const TAB_NAV_ITEMS: TabNavItem[] = [
  {
    name: "index",
    label: "Home",
    accessibilityLabel: "Home",
    icon: "home-outline",
    activeIcon: "home",
  },
  {
    name: "library",
    label: "Library",
    accessibilityLabel: "Learning library",
    icon: "library-outline",
    activeIcon: "library",
  },
  {
    name: "flashcards",
    label: "Study",
    accessibilityLabel: "Study flashcard sets",
    icon: "school-outline",
    activeIcon: "school",
  },
  {
    name: "more",
    label: "More",
    accessibilityLabel: "More Bilkeys destinations",
    icon: "menu-outline",
    activeIcon: "menu",
  },
];

/** Secondary destinations grouped by user intent; tab roots are intentionally excluded. */
export const MORE_NAV_SECTIONS: MoreNavSection[] = [
  {
    title: "Learning",
    items: [
      { label: "Daily Review", icon: "refresh-circle-outline", href: "/daily-review" },
      { label: "Collections", icon: "folder-open-outline", href: "/folders" },
    ],
  },
  {
    title: "Progress",
    items: [
      { label: "Achievements", icon: "medal-outline", href: "/achievements" },
      { label: "Scorecards", icon: "stats-chart-outline", href: "/scorecards", feature: "scorecards" },
      { label: "Quiz Results", icon: "trophy-outline", href: "/quiz-history" },
      { label: "Analytics", icon: "bar-chart-outline", href: "/analytics" },
    ],
  },
  {
    title: "Community",
    items: [
      { label: "Challenges", icon: "flash-outline", href: "/(tabs)/challenges", feature: "challenges" },
      { label: "Study Groups", icon: "people-outline", href: "/study-groups" },
      { label: "Challenge Board", icon: "ribbon-outline", href: "/challenge-leaderboard", feature: "challenges" },
      { label: "Leaderboard", icon: "flame-outline", href: "/leaderboard" },
    ],
  },
  {
    title: "Account",
    items: [
      { label: "Profile", icon: "person-circle-outline", href: "/profile" },
      { label: "Settings", icon: "settings-outline", href: "/settings" },
    ],
  },
  {
    title: "Support",
    items: [
      { label: "Feedback", icon: "chatbubble-outline", href: "/feedback" },
      { label: "User Guide", icon: "help-circle-outline", href: "/guide" },
    ],
  },
];

/** Flattened compatibility export for non-shell consumers. */
export const APP_NAV_ITEMS = MORE_NAV_SECTIONS.flatMap((section) => section.items);
export const MORE_NAV_ITEMS = APP_NAV_ITEMS;
