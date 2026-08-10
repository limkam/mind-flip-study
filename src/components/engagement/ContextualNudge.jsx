import React, { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Sparkles, X } from "lucide-react";
import { useNavigate } from "react-router-dom";

import client from "@/api/client";
import { Button } from "@/components/ui/button";

const enabled = String(import.meta.env.VITE_ENGAGEMENT_NUDGES_ENABLED ?? "true") !== "false";
const newKey = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export default function ContextualNudge({ placement }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [hidden, setHidden] = useState(false);
  const impressionKey = useRef(newKey());
  const { data: nudge } = useQuery({
    queryKey: ["engagement-nudge", placement],
    queryFn: async () => (await client.get("/engagement/nudges/current", { params: { placement } })).data,
    enabled,
    staleTime: 60_000,
    retry: 1,
  });

  useEffect(() => {
    if (!nudge?.id || hidden) return;
    void client.post(`/engagement/nudges/${nudge.id}/impression`, { idempotency_key: impressionKey.current }).catch(() => {});
  }, [nudge?.id, hidden]);

  if (!enabled || !nudge || hidden) return null;

  const record = async (action) => {
    await client.post(`/engagement/nudges/${nudge.id}/${action}`, { idempotency_key: newKey() });
  };
  const dismiss = async () => {
    setHidden(true);
    try {
      await record("dismissal");
    } catch {
      // The optimistic dismissal remains local during a transient API failure.
    } finally {
      void queryClient.invalidateQueries({ queryKey: ["engagement-nudge", placement] });
    }
  };
  const follow = async () => {
    try { await record("click"); } catch { /* Navigation remains available during transient telemetry failures. */ }
    if (nudge.action_url.startsWith("/")) navigate(nudge.action_url);
  };

  return (
    <aside className="mb-6 flex items-start gap-3 rounded-2xl border border-primary/25 bg-gradient-to-r from-primary/10 to-accent/5 p-4 shadow-sm" aria-label="Learning suggestion">
      <span className="rounded-xl bg-primary/15 p-2 text-primary"><Sparkles className="h-5 w-5" /></span>
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold text-foreground">{nudge.title}</h2>
        <p className="mt-1 text-sm leading-5 text-muted-foreground">{nudge.body}</p>
        <Button type="button" variant="link" className="mt-1 h-auto p-0 text-sm" onClick={follow}>
          {nudge.action_label}<ArrowRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={dismiss} aria-label={`Dismiss ${nudge.title}`}>
        <X className="h-4 w-4" />
      </Button>
    </aside>
  );
}
