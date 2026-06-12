import React, { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import client from "@/api/client";
import { motion } from "framer-motion";
import {
  Users, ArrowLeft, Hash, BookOpen, Activity, BarChart3, UserCircle, Library,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { fetchAllBooksPages } from "@/lib/fetchAllBooksPages";

const TABS = [
  { id: "activity", label: "Activity", icon: Activity },
  { id: "progress", label: "Progress", icon: BarChart3 },
  { id: "members", label: "Members", icon: UserCircle },
  { id: "materials", label: "Materials", icon: Library },
];

function StatCard({ label, value }) {
  return (
    <div className="rounded-xl bg-muted/50 border border-border p-4 text-center">
      <p className="text-2xl font-heading font-bold">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
    </div>
  );
}

export default function StudyGroupDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("activity");
  const [addBookId, setAddBookId] = useState("");

  const { data: group, isLoading, isError } = useQuery({
    queryKey: ["study-groups", id],
    queryFn: async () => {
      const { data } = await client.get(`/study-groups/${id}`);
      return data;
    },
    enabled: !!id,
    refetchInterval: 30_000,
  });

  const { data: books = [] } = useQuery({
    queryKey: ["books"],
    queryFn: () => fetchAllBooksPages(),
    enabled: tab === "materials",
  });

  const addBookMutation = useMutation({
    mutationFn: async (bookId) => {
      const { data } = await client.post(`/study-groups/${id}/materials`, { book_id: bookId });
      return data;
    },
    onSuccess: () => {
      toast({ title: "Book added to group" });
      setAddBookId("");
      queryClient.invalidateQueries({ queryKey: ["study-groups", id] });
    },
    onError: (err) => {
      toast({
        title: "Could not add book",
        description: err.response?.data?.detail || "Try again.",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return <p className="text-center text-muted-foreground py-16">Loading group…</p>;
  }

  if (isError || !group) {
    return (
      <div className="text-center py-16 space-y-4">
        <p className="text-muted-foreground">Could not load this group.</p>
        <Button variant="outline" onClick={() => navigate("/study-groups")}>Back to groups</Button>
      </div>
    );
  }

  const existingBookIds = new Set((group.materials || []).map((m) => m.book_id));
  const availableBooks = books.filter((b) => !existingBookIds.has(b.id));

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Button variant="ghost" size="sm" className="gap-2 -ml-2" onClick={() => navigate("/study-groups")}>
        <ArrowLeft className="w-4 h-4" /> Back to groups
      </Button>

      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-heading text-3xl font-bold">{group.name}</h1>
            <p className="text-muted-foreground mt-1">
              {group.member_count} member{group.member_count !== 1 ? "s" : ""}
              <span className="mx-2">·</span>
              Goal: {group.weekly_card_goal} cards/week
            </p>
            {group.description && (
              <p className="text-sm text-muted-foreground mt-2">{group.description}</p>
            )}
          </div>
          {group.code && (
            <div className="text-right flex-shrink-0">
              <p className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                <Hash className="w-3 h-3" /> Invite code
              </p>
              <p className="font-mono text-lg font-bold text-primary tracking-widest">{group.code}</p>
            </div>
          )}
        </div>
      </motion.div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Members" value={group.member_count} />
        <StatCard label="Weekly Goal" value={`${group.weekly_card_goal} cards`} />
        <StatCard label="Cards This Week" value={group.cards_this_week ?? 0} />
        <StatCard label="Total Activities" value={group.total_activities ?? "—"} />
      </div>

      <div className="flex gap-2 p-1 bg-muted/50 rounded-xl overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 flex-1 min-w-[100px] py-2 px-3 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              tab === t.id ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "activity" && (
        <section className="space-y-2">
          {(group.activity || []).length === 0 ? (
            <p className="text-center text-muted-foreground py-10">No activity yet — start studying to log progress.</p>
          ) : (
            group.activity.map((item) => (
              <div key={item.id} className="p-4 rounded-xl bg-muted/40 border border-border flex justify-between gap-4">
                <div>
                  <p className="font-medium text-sm">{item.user_name}</p>
                  <p className="text-xs text-muted-foreground">Reviewed a flashcard</p>
                </div>
                <p className="text-xs text-muted-foreground whitespace-nowrap">
                  {item.created_at ? new Date(item.created_at).toLocaleString() : ""}
                </p>
              </div>
            ))
          )}
        </section>
      )}

      {tab === "progress" && (
        <section className="space-y-4">
          <div className="p-5 rounded-2xl bg-card border border-border">
            <div className="flex justify-between text-sm mb-2">
              <span className="font-medium">Group weekly progress</span>
              <span className="text-muted-foreground">{group.progress_pct ?? 0}%</span>
            </div>
            <div className="h-3 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${Math.min(100, group.progress_pct ?? 0)}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {group.cards_this_week ?? 0} of {group.weekly_card_goal} cards reviewed this week
            </p>
          </div>
          <div className="space-y-2">
            {(group.members || []).map((m) => {
              const pct = Math.min(100, Math.round(((m.cards_this_week || 0) / group.weekly_card_goal) * 100));
              return (
                <div key={m.user_id} className="p-4 rounded-xl bg-muted/40 border border-border">
                  <div className="flex justify-between items-center mb-2">
                    <p className="font-medium text-sm">{m.full_name}</p>
                    <p className="text-xs text-muted-foreground">{m.cards_this_week || 0} cards</p>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-primary/80 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {tab === "members" && (
        <section className="space-y-2">
          {(group.members || []).map((m) => (
            <div key={m.user_id} className="p-4 rounded-xl bg-muted/40 border border-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
                  {(m.full_name || "?").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <p className="font-medium text-sm">{m.full_name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{m.role}</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">{m.cards_this_week || 0} cards this week</p>
            </div>
          ))}
        </section>
      )}

      {tab === "materials" && (
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <Select value={addBookId} onValueChange={setAddBookId}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Add a book from your library…" />
              </SelectTrigger>
              <SelectContent>
                {availableBooks.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.title} — {b.author}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={() => addBookMutation.mutate(addBookId)}
              disabled={!addBookId || addBookMutation.isPending}
            >
              Add book
            </Button>
            <Button variant="outline" asChild>
              <Link to="/library">Upload book</Link>
            </Button>
          </div>

          {(group.materials || []).length === 0 ? (
            <div className="text-center py-10 space-y-3">
              <BookOpen className="w-10 h-10 text-muted-foreground mx-auto opacity-50" />
              <p className="text-muted-foreground">No study materials yet. Add a book from your library.</p>
            </div>
          ) : (
            group.materials.map((mat) => (
              <Link
                key={mat.id}
                to={`/book/${mat.book_id}`}
                className="block p-4 rounded-xl bg-muted/40 border border-border hover:border-primary/30 hover:bg-primary/5 transition-colors"
              >
                <p className="font-medium">{mat.title}</p>
                <p className="text-sm text-muted-foreground">{mat.author}</p>
                <p className="text-xs text-muted-foreground mt-1">Added by {mat.added_by_name}</p>
              </Link>
            ))
          )}
        </section>
      )}
    </div>
  );
}
