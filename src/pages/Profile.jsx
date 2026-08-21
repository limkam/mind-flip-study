import React, { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  BadgeCheck,
  CalendarDays,
  Clock3,
  Layers3,
  Palette,
  Save,
  Sparkles,
  Trophy,
  Check,
} from "lucide-react";
import client from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import UserAvatar from "@/components/account/UserAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { STUDY_THEMES } from "@/lib/studyTheme";
import { applyTheme } from "@/lib/appTheme";

function formatStudyTime(seconds = 0) {
  if (seconds < 60) return `${seconds}s`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-xl font-semibold text-foreground">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

export default function Profile() {
  const { user } = useOutletContext();
  const { refreshUser } = useAuth();
  const { toast } = useToast();
  const [displayName, setDisplayName] = useState(user?.full_name || "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || "");
  const [selectedTheme, setSelectedTheme] = useState(user?.preferences?.study_theme || "indigo");
  const [saving, setSaving] = useState(false);
  const [savingTheme, setSavingTheme] = useState(false);

  useEffect(() => {
    setDisplayName(user?.full_name || "");
    setAvatarUrl(user?.avatar_url || "");
    setSelectedTheme(user?.preferences?.study_theme || "indigo");
  }, [user?.id, user?.full_name, user?.avatar_url, user?.preferences?.study_theme]);

  const { data: stats = {} } = useQuery({
    queryKey: ["analytics-summary"],
    queryFn: async () => (await client.get("/analytics/summary")).data,
  });

  const saveProfile = async () => {
    const name = displayName.trim();
    if (!name) {
      toast({ title: "Enter a display name", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const body = { full_name: name };
      if (user?.auth_provider !== "google") body.avatar_url = avatarUrl.trim();
      await client.patch("/users/me", body);
      await refreshUser();
      toast({ title: "Profile updated" });
    } catch (error) {
      toast({
        title: "Could not update profile",
        description: error.response?.data?.detail || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const joined = user?.created_at
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(user.created_at))
    : "Not available";
  const provider = user?.auth_provider === "google" ? "Google" : user?.auth_provider === "apple" ? "Apple" : "Email";

  const changeTheme = async (themeId) => {
    const previous = selectedTheme;
    setSelectedTheme(themeId);
    applyTheme(themeId);
    setSavingTheme(true);
    try {
      await client.patch("/users/me", { preferences: { study_theme: themeId } });
      await refreshUser();
      toast({ title: "App theme updated" });
    } catch {
      setSelectedTheme(previous);
      applyTheme(previous);
      toast({ title: "Could not update theme", variant: "destructive" });
    } finally {
      setSavingTheme(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-10">
      <motion.header initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="font-heading text-3xl font-bold">Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your identity and study progress in one place.</p>
      </motion.header>

      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-lg border border-border bg-card p-5 sm:p-6"
      >
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <UserAvatar user={{ ...user, avatar_url: avatarUrl || user?.avatar_url }} className="h-20 w-20" fallbackClassName="text-xl" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-xl font-semibold">{user?.full_name || "Bilkeys user"}</h2>
            <p className="truncate text-sm text-muted-foreground">{user?.email}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-primary/10 px-2 py-1 font-medium text-primary">{provider}</span>
              <span className="rounded-full bg-muted px-2 py-1 text-muted-foreground capitalize">{user?.subscription_tier || "free"} plan</span>
            </div>
          </div>
          <div className="text-left text-xs text-muted-foreground sm:text-right">
            <p className="font-medium text-foreground">Member since</p>
            <p>{joined}</p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 border-t border-border pt-6 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="display-name">Display name</Label>
            <Input id="display-name" value={displayName} maxLength={255} onChange={(event) => setDisplayName(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-email">Email address</Label>
            <Input id="profile-email" value={user?.email || ""} disabled className="bg-muted/50" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="avatar-url">Profile picture</Label>
            {user?.auth_provider === "google" ? (
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                <BadgeCheck className="h-4 w-4 text-primary" />
                Synced from your Google account and refreshed when you sign in.
              </div>
            ) : (
              <>
                <Input
                  id="avatar-url"
                  type="url"
                  inputMode="url"
                  placeholder="https://example.com/your-photo.jpg"
                  value={avatarUrl}
                  onChange={(event) => setAvatarUrl(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">Use a public HTTPS image URL, or leave this blank to show your initials.</p>
              </>
            )}
          </div>
        </div>
        <div className="mt-5 flex justify-end">
          <Button onClick={saveProfile} disabled={saving} className="gap-2">
            <Save className="h-4 w-4" /> {saving ? "Saving..." : "Save profile"}
          </Button>
        </div>
      </motion.section>

      <section className="rounded-lg border border-border bg-card p-5 sm:p-6" aria-labelledby="app-theme-heading">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Palette className="h-4 w-4" />
          </div>
          <div>
            <h2 id="app-theme-heading" className="font-heading text-lg font-semibold">App theme</h2>
            <p className="text-sm text-muted-foreground">Choose the accent colors used across Bilkeys and your study cards.</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy={savingTheme}>
          {STUDY_THEMES.map((theme) => {
            const active = selectedTheme === theme.id;
            return (
              <button
                key={theme.id}
                type="button"
                onClick={() => changeTheme(theme.id)}
                disabled={savingTheme}
                aria-pressed={active}
                className={`relative overflow-hidden rounded-lg border-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                  active ? "border-primary shadow-sm" : "border-border hover:border-primary/40"
                }`}
              >
                <span className={`block h-9 bg-gradient-to-r ${theme.question}`} />
                <span className="block p-3">
                  <span className="block pr-6 text-sm font-semibold">{theme.label}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{theme.description}</span>
                </span>
                {active ? (
                  <span className="absolute right-2 top-11 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="h-3 w-3" />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="study-overview-heading">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 id="study-overview-heading" className="font-heading text-lg font-semibold">Study overview</h2>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Stat icon={CalendarDays} label="Current streak" value={`${stats.streak_days || 0} days`} />
          <Stat icon={Clock3} label="Total quiz time" value={formatStudyTime(stats.total_study_time_seconds)} />
          <Stat icon={Sparkles} label="Flashcards created" value={stats.flashcards_created || 0} />
          <Stat icon={Layers3} label="Decks created" value={stats.flashcard_sets_count || 0} />
          <Stat icon={Trophy} label="Quiz attempts" value={stats.quiz_count || 0} />
          <Stat icon={BadgeCheck} label="Badges earned" value={stats.badges_earned || 0} />
        </div>
      </section>
    </div>
  );
}
