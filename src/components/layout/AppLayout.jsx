import React, { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import client from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { fetchAllBooksPages } from "@/lib/fetchAllBooksPages";
import { fetchEntitlementsSnapshot } from "@/lib/billing";
import { DesktopSidebar, MobileNav } from "./Sidebar";
import UpgradeBanner from "@/components/billing/UpgradeBanner";
import { initTheme } from "@/lib/appTheme";
import { applyColorScheme, readColorScheme } from "@/lib/colorScheme";
import AccountMenu from "@/components/account/AccountMenu";
import GenerationStatusBanner from "@/components/generation/GenerationStatusBanner";
import NotificationCenter from "@/components/engagement/NotificationCenter";

export default function AppLayout() {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const notificationsEnabled = import.meta.env.VITE_ENGAGEMENT_NOTIFICATIONS_ENABLED !== "false";

  const handleLogout = async () => {
    document.documentElement.classList.remove("dark");
    initTheme("indigo");
    await logout();
  };

  useEffect(() => {
    if (!user) return;
    void queryClient.prefetchQuery({
      queryKey: ["books"],
      queryFn: () => fetchAllBooksPages(),
    });
    void queryClient.prefetchQuery({
      queryKey: ["flashcard-sets"],
      queryFn: async () => {
        const { data } = await client.get("/flashcard-sets/", {
          params: { include_cards: false },
        });
        return data;
      },
    });
    void queryClient.prefetchQuery({
      queryKey: ["analytics-summary"],
      queryFn: async () => {
        const { data } = await client.get("/analytics/summary");
        return data;
      },
    });
    void queryClient.prefetchQuery({
      queryKey: ["billing-entitlements"],
      queryFn: fetchEntitlementsSnapshot,
    });
    void queryClient.prefetchQuery({
      queryKey: ["quiz-results", "dashboard-recent"],
      queryFn: async () => {
        const { data } = await client.get("/quiz-results/", {
          params: { page: 1, size: 2 },
        });
        return data;
      },
    });
  }, [user, queryClient]);

  useEffect(() => {
    initTheme(user?.preferences?.study_theme || "indigo");
    applyColorScheme(readColorScheme(user));
  }, [user?.id, user?.preferences?.study_theme, user?.preferences?.color_scheme]);

  return (
    <div className="min-h-screen bg-background">
      <div className="hidden lg:block">
        <DesktopSidebar user={user} />
      </div>

      <div className="lg:hidden">
        <MobileNav
          user={user}
          headerActions={
            <>
              {notificationsEnabled ? <NotificationCenter /> : null}
              <UpgradeBanner />
              <AccountMenu onSignOut={handleLogout} />
            </>
          }
        />
      </div>

      <main className="mobile-app-main mt-[4.25rem] px-4 pb-28 pt-4 lg:ml-64 lg:mt-0 lg:px-8 lg:py-8 lg:pt-8">
        <div className="fixed right-4 top-3 z-40 hidden items-center gap-2 lg:flex">
          {notificationsEnabled ? <NotificationCenter /> : null}
          <UpgradeBanner />
          <AccountMenu onSignOut={handleLogout} />
        </div>
        <Outlet context={{ user }} />
      </main>
      <GenerationStatusBanner />
    </div>
  );
}
