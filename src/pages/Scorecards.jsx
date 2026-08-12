import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Link2Off, Share2 } from "lucide-react";
import { useOutletContext } from "react-router-dom";
import html2canvas from "html2canvas";

import client from "@/api/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

const LABELS = { weekly: "Weekly", monthly: "Monthly", course: "Course" };
function formatHours(minutes) {
  const hours = Number(minutes || 0) / 60;
  return `${hours < 10 ? hours.toFixed(1) : Math.round(hours)}h`;
}

function ScorecardView({ card, displayName = "MindFlip Learner" }) {
  if (!card) return null;
  const m = card.metrics || {};
  const periodLabel = LABELS[card.period_type] || "Learning";
  const title = card.period_type === "course" ? m.course_title || "Course" : displayName;
  const mastery = m.average_assessment_score == null ? card.score : Math.round(m.average_assessment_score);
  const stats = [
    [m.cards_reviewed ?? 0, "Cards reviewed"],
    [m.current_streak ?? 0, <>Day streak <span aria-hidden="true">🔥</span></>],
    [formatHours(m.learning_minutes), "Time studied"],
    [`${mastery}%`, "Mastery"],
  ];
  const improvedLabels = { accuracy: "Accuracy", consistency: "Consistency", activity: "Assessment activity", healthy_time: "Healthy learning time" };
  const improved = m.comparison?.most_improved_skill ? improvedLabels[m.comparison.most_improved_skill] : null;
  return <section className="relative aspect-[4/4.5] w-full overflow-hidden bg-[linear-gradient(145deg,#4f46e5_0%,#7c3aed_54%,#c026d3_100%)] p-[7%] font-body text-white shadow-2xl" aria-label={`${periodLabel} scorecard`}>
    <div className="pointer-events-none absolute -left-[18%] top-[15%] h-[46%] w-[65%] rounded-full bg-blue-500/20 blur-3xl" />
    <div className="pointer-events-none absolute -right-[20%] bottom-[4%] h-[45%] w-[65%] rounded-full bg-fuchsia-500/25 blur-3xl" />
    <div className="relative flex h-full flex-col">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-3 text-[clamp(.75rem,2.4vw,1.35rem)] font-black tracking-[.16em]"><span aria-hidden="true">🎓</span><span>MINDFLIP</span></p>
        <span className="rounded-full bg-white/15 px-[4%] py-[1.5%] text-[clamp(.7rem,2vw,1.1rem)] font-bold shadow-sm backdrop-blur-sm">My Scorecard</span>
      </div>
      <div className="mt-[9%]">
        <h2 className="break-words font-heading text-[clamp(1.55rem,5vw,3.4rem)] font-black leading-[1.05] tracking-tight">{title}</h2>
        <p className="mt-[1.5%] text-[clamp(.8rem,2.6vw,1.35rem)] font-medium text-white/85">{m.assessments_completed ?? 0} assessments · {m.cards_reviewed ?? 0} cards reviewed</p>
        <p className="mt-2 font-bold">{m.data_state === "empty" ? "No study activity yet" : m.data_state === "partial" ? `Partial score: ${card.score}` : `Overall score: ${card.score}`} · Formula {card.formula_version}</p>
      </div>
      <div className="mt-[5%] grid grid-cols-2 gap-[3%]">
        {stats.map(([value, label]) => <div key={String(label)} className="flex aspect-[1.85/1] flex-col items-center justify-center rounded-[1.8rem] bg-white/[.13] px-3 text-center shadow-[inset_0_1px_0_rgba(255,255,255,.06)] backdrop-blur-sm"><p className="text-[clamp(2rem,6vw,3.4rem)] font-black leading-none">{value}</p><p className="mt-[5%] text-[clamp(.72rem,2.1vw,1.15rem)] font-bold text-white/90">{label}</p></div>)}
      </div>
      {(improved || m.personal_best) && <p className="mt-3 text-sm font-bold">{improved && `Most improved skill: ${improved}`}{improved && m.personal_best ? " · " : ""}{m.personal_best && "Personal best"}</p>}
      <div className="mt-auto border-t border-white/25 pt-[5%] text-center text-[clamp(.72rem,2.15vw,1.15rem)] font-bold">Think you can beat my streak? Join me on MindFlip <span aria-hidden="true">🚀</span></div>
    </div>
  </section>;
}

export default function Scorecards() {
  const { user } = /** @type {{ user: any }} */ (useOutletContext()); const { toast } = useToast(); const [period, setPeriod] = useState("weekly"); const [selectedId, setSelectedId] = useState(null); const [shareState, setShareState] = useState(null); const [shareBusy, setShareBusy] = useState(false); const [showName, setShowName] = useState(false); const [publicName, setPublicName] = useState(""); const [expiresIn, setExpiresIn] = useState(30); const previewRef = useRef(null);
  // Scorecards are refreshed transactionally when study and quiz events are
  // recorded. Opening this page should only read the persisted snapshots.
  const { data: cards = [], isLoading, isError } = useQuery({ queryKey: ["scorecards"], queryFn: async () => (await client.get("/scorecards/")).data, staleTime: 5 * 60_000, refetchOnWindowFocus: false });
  const filtered = useMemo(() => cards.filter((item) => item.period_type === period), [cards, period]); const card = filtered.find((item) => item.id === selectedId) || filtered[0] || null;
  useEffect(() => { setSelectedId(null); }, [period]);
  useEffect(() => { setShareState(null); setShowName(false); setPublicName(""); }, [card?.id]);
  const createShare = async () => { if (!card) return null; setShareBusy(true); try { const { data } = await client.post(`/scorecards/${card.id}/share`, { expires_in_days: Number(expiresIn), show_display_name: showName, public_display_name: showName ? publicName : null }); setShareState(data); return data.share_url; } catch (error) { const detail = error?.response?.data?.detail; toast({ title: "Share link could not be created", description: typeof detail === "string" ? detail : "The sharing service is unavailable. Refresh and try again.", variant: "destructive" }); return null; } finally { setShareBusy(false); } };
  const copyShare = async () => { const url = shareState?.share_url || await createShare(); if (!url) return; await navigator.clipboard.writeText(url); toast({ title: "Share link copied" }); };
  const revokeShare = async () => { if (!card || !shareState) return; setShareBusy(true); try { await client.delete(`/scorecards/${card.id}/share/${shareState.id}`); setShareState(null); toast({ title: "Share link revoked" }); } catch { toast({ title: "Share link could not be revoked", variant: "destructive" }); } finally { setShareBusy(false); } };
  const scorecardImage = async () => { if (!card || !previewRef.current) return null; const canvas = await html2canvas(previewRef.current, { backgroundColor: null, scale: 2, useCORS: true }); const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png")); return blob ? new File([blob], `mindflip-${card.period_type}-scorecard.png`, { type: "image/png" }) : null; };
  const download = async () => { const file = await scorecardImage(); if (!file) return; const link = document.createElement("a"); link.download = file.name; link.href = URL.createObjectURL(file); link.click(); URL.revokeObjectURL(link.href); };
  return <div className="mx-auto max-w-4xl space-y-6 pb-12"><header><h1 className="font-heading text-3xl font-bold">Performance scorecards</h1><p className="mt-1 text-sm text-muted-foreground">Automatically refreshed summaries of meaningful learning activity.</p></header>
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Scorecard period">{Object.entries(LABELS).map(([key, label]) => <Button key={key} role="tab" aria-selected={period === key} variant={period === key ? "default" : "outline"} onClick={() => setPeriod(key)}>{label}</Button>)}</div>
    {isLoading && !cards.length && <p className="text-muted-foreground">Loading your latest scorecards…</p>}{isError && <p className="text-destructive">Scorecards could not be refreshed. Your latest cached scorecard will remain available when possible.</p>}
    {!isLoading && !card && period === "course" && <div className="rounded-2xl border p-8 text-center"><h2 className="font-semibold">No course scorecard yet</h2><p className="mt-1 text-sm text-muted-foreground">A course scorecard appears automatically after your first activity in a course.</p></div>}
    {filtered.length > 1 && <label className="block text-sm">Available {LABELS[period].toLowerCase()} scorecards<select className="ml-2 rounded-md border bg-background p-2" value={card?.id || ""} onChange={(event) => setSelectedId(event.target.value)}>{filtered.map((item) => <option key={item.id} value={item.id}>{item.period_start} – {item.period_end}{item.metrics?.course_title ? ` · ${item.metrics.course_title}` : ""}</option>)}</select></label>}
    <div ref={previewRef} className="mx-auto w-full max-w-[800px]"><ScorecardView card={card} displayName={user?.full_name || "MindFlip Learner"} /></div>
    {card && <section id="scorecard-share-controls" className="space-y-3 rounded-2xl border p-4" aria-labelledby="share-heading"><h2 id="share-heading" className="font-semibold">Public share link</h2><p className="text-sm text-muted-foreground">Anyone with the link can view this scorecard until it expires or you revoke it.</p>{!shareState && <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Expires after<select value={expiresIn} onChange={(event) => setExpiresIn(Number(event.target.value))} className="mt-1 block w-full rounded-md border bg-background p-2"><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option></select></label><div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showName} onChange={(event) => setShowName(event.target.checked)} />Share a public display name</label>{showName && <input aria-label="Public display name" maxLength={80} value={publicName} onChange={(event) => setPublicName(event.target.value)} placeholder="Public name or alias" className="mt-2 w-full rounded-md border bg-background p-2" />}</div></div>}{shareState && <div className="space-y-2"><label className="block text-sm">Share URL<input readOnly value={shareState.share_url} className="mt-1 w-full rounded-md border bg-muted p-2" /></label><p className="text-sm text-muted-foreground">Expires {new Date(shareState.expires_at).toLocaleString()} · Display name {shareState.show_display_name ? "shared" : "hidden"}</p></div>}<div className="flex flex-wrap gap-2">{shareState ? <><Button onClick={copyShare} disabled={shareBusy}><Share2 className="mr-2 h-4 w-4" />Copy link</Button><Button variant="destructive" onClick={revokeShare} disabled={shareBusy}><Link2Off className="mr-2 h-4 w-4" />Revoke</Button><Button variant="outline" onClick={async () => { await revokeShare(); await createShare(); }} disabled={shareBusy}>Regenerate</Button></> : <Button onClick={copyShare} disabled={shareBusy || (showName && !publicName.trim())}><Share2 className="mr-2 h-4 w-4" />Create and copy link</Button>}<Button variant="outline" onClick={download}><Download className="mr-2 h-4 w-4" />Download image</Button></div></section>}
  </div>;
}

export { ScorecardView };
