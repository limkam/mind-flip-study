import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Award, CheckCircle2, Trophy, X } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { trackClientEvent } from "@/lib/analytics";
import { AudioManager } from "./audioManager.js";
import { aggregateCelebrations, mayUseConfetti, normaliseCelebration } from "./policy.js";
import { createSeenState } from "./seenState.js";

const Context = createContext(null);
const LEVEL_RANK = { subtle: 1, medium: 2, major: 3 };
const QUEUE_LIMIT = Math.max(1, Math.min(10, Number(import.meta.env.VITE_CELEBRATION_QUEUE_LIMIT) || 4));
const MAX_AGE = 30_000;
const visualsEnabled = import.meta.env.VITE_CELEBRATIONS_ENABLED !== "false";
const audioEnabled = import.meta.env.VITE_AUDIO_ENABLED !== "false";
const confettiEnabled = import.meta.env.VITE_CONFETTI_ENABLED !== "false";

function reducedMotionQuery() { return typeof window !== "undefined" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null; }

export function CelebrationProvider({ children }) {
  const { user } = useAuth(); const location = useLocation();
  const [active, setActive] = useState(null); const [queue, setQueue] = useState([]); const [announcement, setAnnouncement] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const activeRef = useRef(null); const queueRef = useRef([]); const confettiRef = useRef(null);
  const namespace = user?.id ? `user:${user.id}` : "anonymous";
  const seen = useMemo(() => createSeenState({ namespace, retentionDays: Number(import.meta.env.VITE_CELEBRATION_SEEN_RETENTION_DAYS) || 90 }), [namespace]);
  const settings = user?.preferences?.settings || {};
  const manager = useMemo(() => new AudioManager({ preferences: {
    globalMuted: !audioEnabled || settings.global_sound_muted === true,
    achievement: settings.achievement_sounds === true,
    streak: settings.streak_sounds === true,
  }, onOutcome: ({ outcome, soundKey }) => trackClientEvent(outcome === "played" ? "audio_played" : "audio_suppressed", { outcome, sound_key: soundKey }) }), []);

  useEffect(() => () => manager.destroy(), [manager]);
  useEffect(() => manager.setPreferences({ globalMuted: !audioEnabled || settings.global_sound_muted === true, achievement: settings.achievement_sounds === true, streak: settings.streak_sounds === true }), [manager, settings.global_sound_muted, settings.achievement_sounds, settings.streak_sounds]);
  useEffect(() => {
    const update = (event) => manager.setPreferences(event.detail || {});
    window.addEventListener("mindflip:audio-preferences", update); return () => window.removeEventListener("mindflip:audio-preferences", update);
  }, [manager]);
  useEffect(() => {
    const unlock = () => { void manager.unlock().then((ok) => { if (ok) { setUnlocked(true); ["pointerdown", "keydown", "touchstart"].forEach((name) => window.removeEventListener(name, unlock)); } }); };
    window.addEventListener("pointerdown", unlock, { passive: true }); window.addEventListener("touchstart", unlock, { passive: true }); window.addEventListener("keydown", unlock);
    return () => ["pointerdown", "keydown", "touchstart"].forEach((name) => window.removeEventListener(name, unlock));
  }, [manager]);

  const show = useCallback((event) => {
    activeRef.current = event; setActive(event); seen.presented(event);
    for (const id of event.relatedEventIds || []) seen.presented({ eventId: id, type: event.type });
    setAnnouncement(event.announcement || event.message || event.title || "Learning milestone completed.");
    trackClientEvent("celebration_presented", { celebration_type: event.type, celebration_level: event.level });
    if (event.soundKey) void manager.play(event.soundKey);
  }, [manager, seen]);
  const request = useCallback((input) => {
    if (!visualsEnabled) return { outcome: "disabled" };
    const event = normaliseCelebration(input); if (!event) return { outcome: "invalid" };
    const ids = event.relatedEventIds || [event.eventId]; if (ids.every((id) => seen.has(id))) return { outcome: "seen" };
    if (activeRef.current?.eventId === event.eventId || queueRef.current.some((x) => x.eventId === event.eventId)) return { outcome: "duplicate" };
    if (!activeRef.current) { show(event); return { outcome: "presented" }; }
    if (event.level === "major" && LEVEL_RANK[event.level] > LEVEL_RANK[activeRef.current.level]) {
      manager.stop("priority_replaced"); queueRef.current = [activeRef.current, ...queueRef.current].slice(0, QUEUE_LIMIT); setQueue(queueRef.current); show(event); return { outcome: "presented" };
    }
    let next = queueRef.current.filter((x) => Date.now() - Date.parse(x.occurredAt) <= MAX_AGE || x.level === "major");
    if (event.level === "subtle") next = next.filter((x) => x.level !== "subtle");
    next = [...next, event].sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level]).slice(0, QUEUE_LIMIT);
    queueRef.current = next; setQueue(next); return { outcome: "queued" };
  }, [manager, seen, show]);
  const requestMany = useCallback((events) => request(aggregateCelebrations(events)), [request]);
  const dismiss = useCallback((method = "close") => {
    const current = activeRef.current; if (!current) return;
    manager.stop("dismissed"); confettiRef.current?.reset?.(); confettiRef.current = null; seen.dismissed(current.eventId);
    trackClientEvent("celebration_dismissed", { celebration_type: current.type, dismissal_method: method });
    const next = queueRef.current.shift() || null; setQueue([...queueRef.current]); activeRef.current = null; setActive(null); setAnnouncement("");
    if (next) queueMicrotask(() => show(next));
  }, [manager, seen, show]);
  useEffect(() => {
    manager.stop("route_change"); confettiRef.current?.reset?.(); confettiRef.current = null;
    if (activeRef.current) { activeRef.current = null; setActive(null); setAnnouncement(""); }
    if (queueRef.current.length) { queueRef.current = []; setQueue([]); }
  }, [location.key, manager]);
  useEffect(() => {
    if (!active || !mayUseConfetti(active) || !confettiEnabled || reducedMotionQuery()?.matches || settings.celebration_animations === false) return;
    let cancelled = false; void import("canvas-confetti").then(({ default: confetti }) => { if (cancelled) return; confettiRef.current = confetti; void confetti({ particleCount: 90, spread: 70, origin: { y: 0.65 }, disableForReducedMotion: true }); });
    return () => { cancelled = true; confettiRef.current?.reset?.(); confettiRef.current = null; };
  }, [active, settings.celebration_animations]);
  useEffect(() => { const onKey = (e) => { if (e.key === "Escape" && activeRef.current) dismiss("escape"); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [dismiss]);

  const value = useMemo(() => ({ request, requestMany, dismiss, active, queueLength: queue.length, audioManager: manager, unlocked }), [request, requestMany, dismiss, active, queue.length, manager, unlocked]);
  return <Context.Provider value={value}>{children}<CelebrationHost active={active} dismiss={dismiss} /><span className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</span></Context.Provider>;
}

function CelebrationHost({ active, dismiss }) {
  if (!active) return null; const subtle = active.level === "subtle"; const Icon = active.level === "major" ? Trophy : active.level === "medium" ? Award : CheckCircle2;
  return <aside className={`celebration-host fixed z-50 ${subtle ? "bottom-5 left-1/2 -translate-x-1/2" : "bottom-5 right-5 max-w-sm"}`} aria-label="Learning celebration">
    <div className={`celebration-card rounded-2xl border bg-card p-4 shadow-xl ${active.level}`} data-level={active.level}>
      <div className="flex items-start gap-3"><span className="rounded-full bg-primary/10 p-2 text-primary" aria-hidden="true"><Icon className="h-5 w-5" /></span><div className="min-w-0 flex-1">
        <p className="font-heading font-semibold">{active.title || (subtle ? "Progress saved" : active.level === "major" ? "Amazing work!" : "Achievement unlocked")}</p>{active.message && <p className="mt-1 text-sm text-foreground">{active.message}</p>}
      </div><button type="button" onClick={() => dismiss("close_button")} className="rounded-md p-1 text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary" aria-label="Dismiss celebration"><X className="h-4 w-4" /></button></div>
    </div></aside>;
}

export function useCelebration() { const value = useContext(Context); if (!value) throw new Error("useCelebration must be used within CelebrationProvider"); return value; }
