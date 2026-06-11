import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Library, GraduationCap,
  Users, ChevronLeft, ChevronRight,
  LogOut, Trophy, X, Menu, UserCircle, Swords, Settings, FolderOpen,
  BarChart2, Brain, Flame, MessageSquare
} from "lucide-react";
import { MindFlipBrand } from "@/components/brand/MindFlipLogo";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const navItems = [
  { path: "/", icon: LayoutDashboard, label: "Dashboard" },
  { path: "/library", icon: Library, label: "Library" },
  { path: "/flashcard-sets", icon: GraduationCap, label: "My Flashcards" },
  { path: "/quiz-history", icon: Trophy, label: "Quiz Results" },
  { path: "/challenges", icon: Swords, label: "Challenges" },
  { path: "/daily-review", icon: Brain, label: "Daily Review" },
  { path: "/analytics", icon: BarChart2, label: "Analytics" },
  { path: "/leaderboard", icon: Flame, label: "Leaderboard" },
  { path: "/folders", icon: FolderOpen, label: "Collections" },
  { path: "/profile", icon: UserCircle, label: "My Profile" },
  { path: "/settings", icon: Settings, label: "Settings" },
  { path: "/feedback", icon: MessageSquare, label: "Feedback" },
];

const adminItems = [
  { path: "/users", icon: Users, label: "User Management" },
];

function NavLinks({ user, collapsed, onLinkClick }) {
  const location = useLocation();
  const isAdmin = user?.role === "admin";

  return (
    <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
      {navItems.map(item => {
        const isActive = location.pathname === item.path;
        return (
          <Link
            key={item.path}
            to={item.path}
            onClick={onLinkClick}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group
              ${isActive
                ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-md shadow-sidebar-primary/20"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"}`}
          >
            <item.icon className={`w-5 h-5 flex-shrink-0 ${!isActive ? "group-hover:scale-110 transition-transform" : ""}`} />
            {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
          </Link>
        );
      })}

      {isAdmin && (
        <>
          <div className="my-3 border-t border-sidebar-border" />
          {!collapsed && <p className="px-3 text-xs font-semibold text-sidebar-foreground/40 uppercase tracking-wider mb-2">Admin</p>}
          {adminItems.map(item => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={onLinkClick}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group
                  ${isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-md"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"}`}
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
              </Link>
            );
          })}
        </>
      )}
    </nav>
  );
}

function UserSection({ user, collapsed }) {
  const { logout } = useAuth();
  const getInitials = (name) => {
    if (!name) return "U";
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  return (
    <div className="p-3 border-t border-sidebar-border">
      <div className={`flex items-center gap-3 ${collapsed ? "justify-center" : ""}`}>
        <Avatar className="w-9 h-9 flex-shrink-0">
          <AvatarFallback className="bg-sidebar-primary/20 text-sidebar-primary text-sm font-semibold">
            {getInitials(user?.full_name)}
          </AvatarFallback>
        </Avatar>
        {!collapsed && (
          <div className="flex-1 overflow-hidden">
            <p className="text-sm font-medium text-sidebar-foreground truncate">{user?.full_name || "User"}</p>
            <p className="text-xs text-sidebar-foreground/50 capitalize">{user?.role || "student"}</p>
          </div>
        )}
        {!collapsed && (
          <Button
            variant="ghost"
            size="icon"
            className="text-sidebar-foreground/50 hover:text-sidebar-foreground h-8 w-8"
            onClick={() => logout()}
          >
            <LogOut className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

export function DesktopSidebar({ user }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className={`fixed left-0 top-0 h-screen bg-sidebar border-r border-sidebar-border flex flex-col transition-all duration-300 z-50 ${collapsed ? "w-[72px]" : "w-64"}`}>
      <div className="p-4 border-b border-sidebar-border">
        <MindFlipBrand collapsed={collapsed} />
      </div>

      <NavLinks user={user} collapsed={collapsed} onLinkClick={() => {}} />
      <UserSection user={user} collapsed={collapsed} />

      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-20 w-6 h-6 bg-card border border-border rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground shadow-sm transition-colors"
      >
        {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
      </button>
    </div>
  );
}

export function MobileNav({ user }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  return (
    <>
      <div className="fixed top-0 left-0 right-0 h-14 bg-sidebar border-b border-sidebar-border flex items-center justify-between px-4 z-50">
        <div className="flex-1 min-w-0 pr-3">
          <MindFlipBrand showTagline={false} size="sm" />
        </div>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="w-9 h-9 rounded-lg bg-sidebar-accent flex items-center justify-center text-sidebar-foreground"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawerOpen(false)} />
          <div className="relative w-72 h-full bg-sidebar flex flex-col shadow-2xl">
            <div className="p-4 flex items-center justify-between border-b border-sidebar-border">
              <MindFlipBrand />
              <button type="button" onClick={() => setDrawerOpen(false)} className="text-sidebar-foreground/60 hover:text-sidebar-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <NavLinks user={user} collapsed={false} onLinkClick={() => setDrawerOpen(false)} />
            <UserSection user={user} collapsed={false} />
          </div>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 h-16 bg-sidebar border-t border-sidebar-border flex items-center justify-around px-2 z-40">
        {navItems.map(item => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all
                ${isActive ? "text-sidebar-primary" : "text-sidebar-foreground/50"}`}
            >
              <item.icon className={`w-5 h-5 ${isActive ? "scale-110" : ""} transition-transform`} />
              <span className="text-[10px] font-medium leading-tight">{item.label.split(" ")[0]}</span>
            </Link>
          );
        })}
      </div>
    </>
  );
}

export default DesktopSidebar;
