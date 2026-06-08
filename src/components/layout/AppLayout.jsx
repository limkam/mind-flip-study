import React from "react";
import { Outlet } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { DesktopSidebar, MobileNav } from "./Sidebar";
import UpgradeBanner from "@/components/billing/UpgradeBanner";
import DarkModeToggle from "./DarkModeToggle";

export default function AppLayout() {
  const { user } = useAuth();

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
    </div>
  );
}
