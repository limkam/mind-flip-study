import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Library,
  GraduationCap,
  Users,
  ChevronLeft,
  ChevronRight,
  Trophy,
  X,
  Swords,
  BarChart2,
  Brain,
  Flame,
  Medal,
  CreditCard,
  Tags,
  Share2,
  MoreHorizontal,
  BookOpenCheck,
  HelpCircle,
} from "lucide-react";
import { MindFlipBrand } from "@/components/brand/MindFlipLogo";
import { fetchEntitlementsSnapshot } from "@/lib/billing";

const navItems = [
  { path: "/", icon: LayoutDashboard, label: "Dashboard" },
  { path: "/library", icon: Library, label: "Library" },
  { path: "/flashcard-sets", icon: GraduationCap, label: "My Flashcards" },
  { path: "/quiz-history", icon: Trophy, label: "Quiz Results" },
  { path: "/challenges", icon: Swords, label: "Challenges", feature: "challenges" },
  { path: "/challenge-leaderboard", icon: Medal, label: "Challenge Board", feature: "challenges" },
  { path: "/daily-review", icon: Brain, label: "Daily Review" },
  { path: "/analytics", icon: BarChart2, label: "Analytics" },
  { path: "/scorecards", icon: Share2, label: "Scorecards", rollout: "scorecards" },
  { path: "/leaderboard", icon: Flame, label: "Leaderboard" },
  { path: "/study-groups", icon: Users, label: "Study Groups" },
  { path: "/guide", icon: HelpCircle, label: "User Guide" },
  { path: "/pricing", icon: Tags, label: "Pricing" },
  { path: "/billing", icon: CreditCard, label: "Billing & Credits" },
];

const adminItems = [{ path: "/users", icon: Users, label: "User Management" }];

function NavLinks({ user, collapsed, onLinkClick, mobileSheet = false }) {
  const location = useLocation();
  const isAdmin = user?.role === "admin";
  const { data: entitlements } = useQuery({
    queryKey: ["billing-entitlements"],
    queryFn: fetchEntitlementsSnapshot,
  });
  const visibleNavItems = navItems.filter(
    (item) => (!item.feature || entitlements?.features?.[item.feature])
      && (item.rollout !== "scorecards" || import.meta.env.VITE_ENGAGEMENT_SCORECARDS_ENABLED !== "false"),
  );

  return (
    <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
      {visibleNavItems.map((item) => {
        const isActive = location.pathname === item.path;
        return (
          <Link
            key={item.path}
            to={item.path}
            onClick={onLinkClick}
            style={isActive ? { backgroundColor: "hsl(var(--theme-highlight))" } : undefined}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group
              ${
                isActive
                  ? "text-primary-foreground shadow-md"
                  : mobileSheet
                    ? "text-muted-foreground hover:bg-muted hover:text-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}
          >
            <item.icon
              className={`w-5 h-5 flex-shrink-0 ${!isActive ? "group-hover:scale-110 transition-transform" : ""}`}
            />
            {!collapsed && (
              <span className="text-sm font-medium">{item.label}</span>
            )}
          </Link>
        );
      })}

      {isAdmin && (
        <>
          <div className={`my-3 border-t ${mobileSheet ? "border-border" : "border-sidebar-border"}`} />
          {!collapsed && (
            <p className={`px-3 text-xs font-semibold uppercase tracking-wider mb-2 ${mobileSheet ? "text-muted-foreground" : "text-sidebar-foreground/40"}`}>
              Admin
            </p>
          )}
          {adminItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={onLinkClick}
                style={isActive ? { backgroundColor: "hsl(var(--theme-highlight))" } : undefined}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group
                  ${
                    isActive
                      ? "text-primary-foreground shadow-md"
                      : mobileSheet
                        ? "text-muted-foreground hover:bg-muted hover:text-foreground"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  }`}
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                {!collapsed && (
                  <span className="text-sm font-medium">{item.label}</span>
                )}
              </Link>
            );
          })}
        </>
      )}
    </nav>
  );
}

// UserSection removed — profile badge moved to header in AppLayout

export function DesktopSidebar({ user }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      className={`fixed left-0 top-0 h-screen bg-sidebar border-r border-sidebar-border flex flex-col transition-all duration-300 z-50 ${collapsed ? "w-[72px]" : "w-64"}`}
    >
      <div className="p-4 border-b border-sidebar-border">
        <MindFlipBrand collapsed={collapsed} />
      </div>

      <NavLinks user={user} collapsed={collapsed} onLinkClick={() => {}} />

      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-20 w-6 h-6 bg-card border border-border rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground shadow-sm transition-colors"
      >
        {collapsed ? (
          <ChevronRight className="w-3 h-3" />
        ) : (
          <ChevronLeft className="w-3 h-3" />
        )}
      </button>
    </div>
  );
}

export function MobileNav({ user, headerActions }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  const primaryItems = [
    { path: "/", icon: LayoutDashboard, label: "Home", exact: true },
    { path: "/library", icon: Library, label: "Library" },
    { path: "/daily-review", icon: BookOpenCheck, label: "Review", featured: true },
    { path: "/flashcard-sets", icon: GraduationCap, label: "Cards" },
  ];
  const isActive = (item) => item.exact
    ? location.pathname === item.path
    : location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
  const activeItem = [...navItems, ...adminItems]
    .filter((item) => item.path !== "/")
    .sort((a, b) => b.path.length - a.path.length)
    .find((item) => location.pathname === item.path || location.pathname.startsWith(`${item.path}/`));
  const pageTitle = location.pathname === "/" ? "Home" : (activeItem?.label || "MindFlip");
  const moreActive = !primaryItems.some(isActive) && location.pathname !== "/";

  return (
    <>
      <header className="mobile-topbar fixed left-0 right-0 top-0 z-50 flex h-[4.25rem] items-center gap-3 border-b border-border/60 bg-background/90 px-4 backdrop-blur-xl">
        <Link to="/" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 shadow-lg shadow-indigo-500/30 transition-transform active:scale-95 rotate-[30deg] my-1 ml-1" aria-label="MindFlip home">
          <span className="-rotate-[30deg] font-heading text-base font-black text-white">M</span>
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">MindFlip</p>
          <p className="truncate font-heading text-base font-semibold leading-tight text-foreground">{pageTitle}</p>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {headerActions}
        </div>
      </header>

      <nav className="mobile-bottom-nav fixed bottom-0 left-0 right-0 z-[60] border-t border-border/70 bg-card/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-10px_30px_-18px_rgba(31,24,55,0.35)] backdrop-blur-xl" aria-label="Main navigation">
        <div className="mx-auto grid max-w-lg grid-cols-5 items-end">
          {primaryItems.map((item) => {
            const active = isActive(item);
            return (
              <Link key={item.path} to={item.path} className={`group relative flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold ${active ? "text-primary" : "text-muted-foreground"}`}>
                {item.featured ? (
                  <span className={`-mt-7 flex h-12 w-12 items-center justify-center rounded-2xl border-4 border-background bg-gradient-to-br from-primary to-accent text-white shadow-lg shadow-primary/25 ${active ? "scale-105" : ""}`}>
                    <item.icon className="h-5 w-5" />
                  </span>
                ) : (
                  <span className={`flex h-7 w-10 items-center justify-center rounded-full transition-colors ${active ? "bg-primary/12" : ""}`}>
                    <item.icon className="h-[1.15rem] w-[1.15rem]" strokeWidth={active ? 2.5 : 2} />
                  </span>
                )}
                <span>{item.label}</span>
                {active && !item.featured ? <span className="absolute bottom-0 h-1 w-1 rounded-full bg-primary" /> : null}
              </Link>
            );
          })}
          <button type="button" onClick={() => setDrawerOpen(true)} className={`relative flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold ${drawerOpen || moreActive ? "text-primary" : "text-muted-foreground"}`} aria-label="More navigation options" aria-expanded={drawerOpen}>
            <span className={`flex h-7 w-10 items-center justify-center rounded-full ${drawerOpen || moreActive ? "bg-primary/12" : ""}`}><MoreHorizontal className="h-5 w-5" /></span>
            <span>More</span>
          </button>
        </div>
      </nav>

      {drawerOpen && (
        <div className="fixed inset-0 z-[70] flex items-end">
          <div
            className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="relative flex max-h-[82dvh] w-full flex-col overflow-hidden rounded-t-[2rem] bg-card shadow-2xl">
            <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-muted" />
            <div className="flex items-center justify-between border-b border-border/60 px-5 pb-4 pt-3">
              <div>
                <p className="font-heading text-lg font-bold">Explore MindFlip</p>
                <p className="text-xs text-muted-foreground">Everything you need to keep learning</p>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4">
              <NavLinks user={user} collapsed={false} mobileSheet onLinkClick={() => setDrawerOpen(false)} />
            </div>
          </div>
        </div>
      )}

    </>
  );
}

export default DesktopSidebar;
