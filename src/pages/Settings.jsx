import React, { useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import client from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { motion } from "framer-motion";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  Bell, Brain, BookOpen, Moon, Sun, Globe, Shield,
  Zap, Target, Clock, Save, RotateCcw, Bug,
} from "lucide-react";
import * as Sentry from "@sentry/react";

const Section = ({ icon: Icon, title, description, children }) => (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    className="bg-card rounded-2xl border border-border p-6"
  >
    <div className="flex items-start gap-3 mb-5">
      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4.5 h-4.5 text-primary" />
      </div>
      <div>
        <h2 className="font-heading font-semibold text-base">{title}</h2>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
    </div>
    <div className="space-y-4">{children}</div>
  </motion.div>
);

const ToggleRow = ({ label, description, checked, onChange }) => (
  <div className="flex items-center justify-between gap-4">
    <div className="flex-1">
      <p className="text-sm font-medium">{label}</p>
      {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
    </div>
    <Switch checked={checked} onCheckedChange={onChange} />
  </div>
);

const DEFAULTS = {
  learning_pace: "medium",
  daily_goal_minutes: 20,
  notify_quiz_results: true,
  notify_streak_reminder: true,
  notify_challenges: true,
  auto_advance_cards: false,
  show_difficulty_badges: true,
  dark_mode: false,
  language: "en",
  quiz_time_limit: true,
  spaced_repetition_enabled: true,
  card_font_size: "medium",
  accessibility_high_contrast: false,
};

export default function Settings() {
  const { user } = useOutletContext();
  const { refreshUser } = useAuth();
  const { toast } = useToast();
  const [prefs, setPrefs] = useState(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const s = user?.preferences?.settings;
    if (s) {
      setPrefs({ ...DEFAULTS, ...s });
    }
  }, [user]);

  const set = (key, value) => {
    setPrefs(p => ({ ...p, [key]: value }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    await client.patch("/users/me", { preferences: { settings: prefs } });
    await refreshUser();
    setSaving(false);
    setDirty(false);
    toast({ title: "Settings saved!" });
  };

  const reset = () => {
    setPrefs(DEFAULTS);
    setDirty(true);
  };

  return (
    <div className="max-w-2xl mx-auto pb-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-heading text-3xl font-bold">Settings</h1>
          <p className="text-muted-foreground mt-1 text-sm">Customize your MindFlip experience</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={reset} className="gap-1.5">
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </Button>
          <Button size="sm" onClick={save} disabled={saving || !dirty} className="gap-1.5">
            <Save className="w-3.5 h-3.5" /> {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      <div className="space-y-4">

        {/* Learning Pace */}
        <Section icon={Brain} title="Learning Preferences" description="Control how you study and progress">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Learning Pace</Label>
            <Select value={prefs.learning_pace} onValueChange={v => set("learning_pace", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="relaxed">🐢 Relaxed — take it easy, no pressure</SelectItem>
                <SelectItem value="medium">🚶 Balanced — steady daily progress</SelectItem>
                <SelectItem value="intensive">🚀 Intensive — push hard, learn fast</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {prefs.learning_pace === "relaxed" && "Short sessions, gentle reminders, flexible schedule."}
              {prefs.learning_pace === "medium" && "Consistent daily sessions with manageable goals."}
              {prefs.learning_pace === "intensive" && "Longer sessions, harder challenges, more reviews."}
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Daily Study Goal</Label>
              <span className="text-sm font-semibold text-primary">{prefs.daily_goal_minutes} min</span>
            </div>
            <Slider
              min={5} max={120} step={5}
              value={[prefs.daily_goal_minutes]}
              onValueChange={([v]) => set("daily_goal_minutes", v)}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>5 min</span><span>2 hours</span>
            </div>
          </div>

          <ToggleRow
            label="Spaced Repetition"
            description="Smart card scheduling based on your recall performance"
            checked={prefs.spaced_repetition_enabled}
            onChange={v => set("spaced_repetition_enabled", v)}
          />
          <ToggleRow
            label="Auto-Advance Cards"
            description="Automatically move to the next card after a short delay"
            checked={prefs.auto_advance_cards}
            onChange={v => set("auto_advance_cards", v)}
          />
          <ToggleRow
            label="Quiz Time Limits"
            description="Enable countdown timers during quiz games"
            checked={prefs.quiz_time_limit}
            onChange={v => set("quiz_time_limit", v)}
          />
        </Section>

        {/* Notifications */}
        <Section icon={Bell} title="Notifications" description="Choose what you want to be notified about">
          <ToggleRow
            label="Quiz Results"
            description="Receive a summary after completing a quiz"
            checked={prefs.notify_quiz_results}
            onChange={v => set("notify_quiz_results", v)}
          />
          <ToggleRow
            label="Streak Reminder"
            description="Daily nudge to keep your study streak alive"
            checked={prefs.notify_streak_reminder}
            onChange={v => set("notify_streak_reminder", v)}
          />
          <ToggleRow
            label="Quiz Challenges"
            description="Alerts when someone challenges you to a quiz"
            checked={prefs.notify_challenges}
            onChange={v => set("notify_challenges", v)}
          />
        </Section>

        {/* Display */}
        <Section icon={Sun} title="Display & Appearance" description="Adjust how the app looks and feels">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Card Font Size</Label>
            <Select value={prefs.card_font_size} onValueChange={v => set("card_font_size", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="small">Small</SelectItem>
                <SelectItem value="medium">Medium (default)</SelectItem>
                <SelectItem value="large">Large</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <ToggleRow
            label="Show Difficulty Badges"
            description="Display easy / medium / hard labels on flashcards"
            checked={prefs.show_difficulty_badges}
            onChange={v => set("show_difficulty_badges", v)}
          />
          <ToggleRow
            label="High Contrast Mode"
            description="Increase contrast for better readability"
            checked={prefs.accessibility_high_contrast}
            onChange={v => set("accessibility_high_contrast", v)}
          />
        </Section>

        {/* Language */}
        <Section icon={Globe} title="Language & Region" description="Set your preferred content language">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Interface Language</Label>
            <Select value={prefs.language} onValueChange={v => set("language", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="en">🇺🇸 English</SelectItem>
                <SelectItem value="es">🇪🇸 Spanish</SelectItem>
                <SelectItem value="fr">🇫🇷 French</SelectItem>
                <SelectItem value="de">🇩🇪 German</SelectItem>
                <SelectItem value="ar">🇸🇦 Arabic</SelectItem>
                <SelectItem value="zh">🇨🇳 Chinese</SelectItem>
                <SelectItem value="pt">🇧🇷 Portuguese</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </Section>

        {/* Account */}
        <Section icon={Shield} title="Account & Privacy" description="Manage your account details">
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-xl">
            <div>
              <p className="text-sm font-medium">{user?.full_name}</p>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
            </div>
            <span className="text-xs font-semibold bg-primary/10 text-primary px-2 py-1 rounded-md capitalize">{user?.role}</span>
          </div>
          <ToggleRow
            label="Performance Analytics"
            description="Allow MindFlip to track your study patterns for personalized tips"
            checked={true}
            onChange={() => {}}
          />
        </Section>

        {import.meta.env.VITE_SENTRY_DSN ? (
          <Section
            icon={Bug}
            title="Error reporting (Sentry)"
            description="Send a single test issue to your browser Sentry project to confirm the SDK."
          >
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => {
                Sentry.captureException(new Error("MindFlip Sentry connectivity verify (web)"));
                toast({
                  title: "Test event sent",
                  description: 'Check Sentry (Issues) for "MindFlip Sentry connectivity verify (web)".',
                });
              }}
            >
              Send browser test event
            </Button>
          </Section>
        ) : null}

      </div>

      {dirty && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed bottom-6 right-6 z-50"
        >
          <Button onClick={save} disabled={saving} size="lg" className="gap-2 shadow-xl">
            <Save className="w-4 h-4" /> {saving ? "Saving..." : "Save Changes"}
          </Button>
        </motion.div>
      )}
    </div>
  );
}