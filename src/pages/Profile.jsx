import React, { useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import client from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { motion } from "framer-motion";
import { User, Palette, Bell, Save, CheckCircle2, CreditCard } from "lucide-react";
import UpgradeSection from "@/components/billing/UpgradeSection";
import { subscriptionLabel, subscriptionsEnabled } from "@/lib/billing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/components/ui/use-toast";

const STUDY_THEMES = [
  {
    id: "indigo",
    label: "Indigo Classic",
    description: "The default rich indigo & violet palette",
    question: "from-indigo-600 to-violet-600",
    answer: "from-emerald-500 to-teal-500",
  },
  {
    id: "ocean",
    label: "Ocean Blue",
    description: "Cool blues and cyans for calm focus",
    question: "from-blue-600 to-cyan-600",
    answer: "from-teal-500 to-emerald-400",
  },
  {
    id: "sunset",
    label: "Sunset",
    description: "Warm oranges and pinks for energy",
    question: "from-orange-500 to-rose-500",
    answer: "from-amber-400 to-yellow-400",
  },
  {
    id: "forest",
    label: "Forest",
    description: "Earthy greens and browns for grounding",
    question: "from-green-700 to-emerald-600",
    answer: "from-lime-500 to-green-400",
  },
  {
    id: "midnight",
    label: "Midnight",
    description: "Deep purples and blues for night study",
    question: "from-purple-800 to-indigo-800",
    answer: "from-violet-500 to-purple-500",
  },
  {
    id: "rose",
    label: "Rose",
    description: "Soft pinks for a gentle learning mood",
    question: "from-rose-500 to-pink-500",
    answer: "from-fuchsia-400 to-pink-400",
  },
];

const DAILY_GOAL_OPTIONS = [10, 20, 30, 50, 100];

export default function Profile() {
  const { user } = useOutletContext();
  const { refreshUser } = useAuth();
  const { toast } = useToast();

  const prefs = user?.preferences || {};
  const [selectedTheme, setSelectedTheme] = useState(prefs.study_theme || "indigo");
  const [dailyGoal, setDailyGoal] = useState(prefs.daily_goal || 20);
  const [notifications, setNotifications] = useState(prefs.notifications !== false);
  const [saving, setSaving] = useState(false);

  const getInitials = (name) => {
    if (!name) return "U";
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const handleSave = async () => {
    setSaving(true);
    await client.patch("/users/me", {
      preferences: {
        study_theme: selectedTheme,
        daily_goal: dailyGoal,
        notifications,
      },
    });
    await refreshUser();
    setSaving(false);
    toast({ title: "Preferences saved!" });
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="font-heading text-3xl font-bold">My Profile</h1>
        <p className="text-muted-foreground mt-1">Manage your account and study preferences</p>
      </motion.div>

      {/* Account Info */}
      <motion.div
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        className="bg-card rounded-2xl border border-border p-6"
      >
        <div className="flex items-center gap-3 mb-5">
          <User className="w-5 h-5 text-primary" />
          <h2 className="font-heading font-semibold text-lg">Account</h2>
        </div>
        <div className="flex items-center gap-4 mb-5">
          <Avatar className="w-16 h-16">
            <AvatarFallback className="bg-primary/10 text-primary text-xl font-bold">
              {getInitials(user?.full_name)}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-semibold text-lg">{user?.full_name || "User"}</p>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
            <motion.div className="mt-1 flex flex-wrap gap-2">
              <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary capitalize">
                {user?.role || "student"}
              </span>
              {subscriptionsEnabled() && (
                <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                  {subscriptionLabel(user?.subscription_tier)} plan
                </span>
              )}
            </motion.div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Full Name</Label>
            <Input value={user?.full_name || ""} disabled className="bg-muted/50" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Email</Label>
            <Input value={user?.email || ""} disabled className="bg-muted/50" />
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-3">Name and email are managed by your account provider.</p>
        {(user?.date_of_birth || user?.country || user?.occupation || user?.job_title) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5 pt-5 border-t border-border">
            {user?.date_of_birth && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Date of birth</Label>
                <Input value={user.date_of_birth} disabled className="bg-muted/50" />
              </div>
            )}
            {user?.age != null && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Age</Label>
                <Input value={String(user.age)} disabled className="bg-muted/50" />
              </div>
            )}
            {user?.country && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Country</Label>
                <Input value={user.country} disabled className="bg-muted/50" />
              </div>
            )}
            {user?.custom_country && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Custom Country</Label>
                <Input value={user.custom_country} disabled className="bg-muted/50" />
              </div>
            )}
            {user?.continent && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Continent</Label>
                <Input value={user.continent} disabled className="bg-muted/50" />
              </div>
            )}
            {user?.occupation && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Occupation</Label>
                <Input value={user.occupation} disabled className="bg-muted/50" />
              </div>
            )}
            {user?.job_title && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Job Title</Label>
                <Input value={user.job_title} disabled className="bg-muted/50" />
              </div>
            )}
          </div>
        )}
      </motion.div>

      {subscriptionsEnabled() && (
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
          className="bg-card rounded-2xl border border-border p-6"
        >
          <div className="flex items-center gap-3 mb-5">
            <CreditCard className="w-5 h-5 text-primary" />
            <h2 className="font-heading font-semibold text-lg">Subscription</h2>
          </div>
          <UpgradeSection subscriptionTier={user?.subscription_tier} />
        </motion.div>
      )}

      {/* Study Theme */}
      <motion.div
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="bg-card rounded-2xl border border-border p-6"
      >
        <div className="flex items-center gap-3 mb-5">
          <Palette className="w-5 h-5 text-primary" />
          <h2 className="font-heading font-semibold text-lg">Study Theme</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">Choose the color theme for your flashcards.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {STUDY_THEMES.map(theme => (
            <button
              key={theme.id}
              onClick={() => setSelectedTheme(theme.id)}
              className={`relative text-left rounded-xl border-2 overflow-hidden transition-all
                ${selectedTheme === theme.id ? "border-primary shadow-md" : "border-border hover:border-primary/40"}`}
            >
              {/* Mini flashcard preview */}
              <div className="flex h-14">
                <div className={`flex-1 bg-gradient-to-r ${theme.question} flex items-center justify-center`}>
                  <span className="text-white text-[10px] font-semibold opacity-80 uppercase tracking-wider">Q</span>
                </div>
                <div className={`flex-1 bg-gradient-to-r ${theme.answer} flex items-center justify-center`}>
                  <span className="text-white text-[10px] font-semibold opacity-80 uppercase tracking-wider">A</span>
                </div>
              </div>
              <div className="p-3">
                <p className="font-medium text-sm">{theme.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{theme.description}</p>
              </div>
              {selectedTheme === theme.id && (
                <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                  <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                </div>
              )}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Study Preferences */}
      <motion.div
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
        className="bg-card rounded-2xl border border-border p-6"
      >
        <div className="flex items-center gap-3 mb-5">
          <Bell className="w-5 h-5 text-primary" />
          <h2 className="font-heading font-semibold text-lg">Study Preferences</h2>
        </div>

        <div className="space-y-5">
          <div>
            <Label className="text-sm font-medium mb-3 block">Daily Card Goal</Label>
            <div className="flex flex-wrap gap-2">
              {DAILY_GOAL_OPTIONS.map(n => (
                <button
                  key={n}
                  onClick={() => setDailyGoal(n)}
                  className={`px-4 py-2 rounded-lg border-2 text-sm font-semibold transition-all
                    ${dailyGoal === n ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/40"}`}
                >
                  {n} cards/day
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between py-3 border-t border-border">
            <div>
              <p className="text-sm font-medium">Study Reminders</p>
              <p className="text-xs text-muted-foreground">Get reminded to keep your streak alive</p>
            </div>
            <button
              onClick={() => setNotifications(!notifications)}
              className={`relative w-11 h-6 rounded-full transition-colors ${notifications ? "bg-primary" : "bg-muted"}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${notifications ? "left-5" : "left-0.5"}`} />
            </button>
          </div>
        </div>
      </motion.div>

      {/* Save */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
        <Button onClick={handleSave} disabled={saving} size="lg" className="w-full gap-2 h-12 font-semibold">
          {saving ? "Saving..." : <><Save className="w-4 h-4" /> Save Preferences</>}
        </Button>
      </motion.div>
    </div>
  );
}