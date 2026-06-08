import type { Href } from "expo-router";

export type AppNavItem = {
  label: string;
  icon: string;
  href: Href;
  /** Shown in bottom tab bar (max ~5). */
  tab?: boolean;
};

/** Mirrors web `Sidebar.jsx` nav order and labels. */
export const APP_NAV_ITEMS: AppNavItem[] = [
  { label: "Dashboard", icon: "home-outline", href: "/(tabs)", tab: true },
  { label: "Library", icon: "library-outline", href: "/(tabs)/library", tab: true },
  { label: "My Flashcards", icon: "school-outline", href: "/(tabs)/flashcards", tab: true },
  { label: "Quiz Results", icon: "trophy-outline", href: "/quiz-history" },
  { label: "Challenges", icon: "flash-outline", href: "/(tabs)/challenges", tab: true },
  { label: "Daily Review", icon: "bulb-outline", href: "/daily-review" },
  { label: "Analytics", icon: "bar-chart-outline", href: "/analytics" },
  { label: "Leaderboard", icon: "flame-outline", href: "/leaderboard" },
  { label: "Collections", icon: "folder-open-outline", href: "/folders" },
  { label: "My Profile", icon: "person-circle-outline", href: "/profile" },
  { label: "Settings", icon: "settings-outline", href: "/settings" },
  { label: "Feedback", icon: "chatbubble-outline", href: "/feedback" },
];

export const TAB_NAV_ITEMS = APP_NAV_ITEMS.filter((item) => item.tab);

export const MORE_NAV_ITEMS = APP_NAV_ITEMS.filter((item) => !item.tab);
