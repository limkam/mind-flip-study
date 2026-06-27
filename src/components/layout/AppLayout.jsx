import React, { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import client from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { fetchAllBooksPages } from "@/lib/fetchAllBooksPages";
import { DesktopSidebar, MobileNav } from "./Sidebar";
import UpgradeBanner from "@/components/billing/UpgradeBanner";
import DarkModeToggle from "./DarkModeToggle";
import GenerationStatusBanner from "@/components/generation/GenerationStatusBanner";

export default function AppLayout() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user) return;
    void queryClient.prefetchQuery({
      queryKey: ["books"],
      queryFn: () => fetchAllBooksPages(),
    });
    void queryClient.prefetchQuery({
      queryKey: ["flashcard-sets"],
      queryFn: async () => {
        const { data } = await client.get("/flashcard-sets/", { params: { include_cards: false } });
        return data;
      },
    });
  }, [user, queryClient]);

  return (
    <div className="min-h-screen bg-background">
      <div className="hidden lg:block">
        <DesktopSidebar user={user} />
      </div>

      <div className="lg:hidden">
        <MobileNav user={user} />
      </div>

      <main className="lg:ml-64 pt-4 pb-6 px-4 lg:px-8 lg:py-8 lg:pt-8 mt-14 lg:mt-0 mb-16 lg:mb-0">
        <div className="fixed top-16 right-4 z-50 flex items-center gap-2 lg:top-3 lg:z-40">
          <UpgradeBanner subscriptionTier={user?.subscription_tier} />
          <DarkModeToggle />
        </div>
        <Outlet context={{ user }} />
      </main>
      <GenerationStatusBanner />
    </div>
  );
}
