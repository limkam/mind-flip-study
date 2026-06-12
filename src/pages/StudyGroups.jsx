import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import client from "@/api/client";
import { motion } from "framer-motion";
import { Users, Plus, Search, Hash, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { fetchAllBooksPages } from "@/lib/fetchAllBooksPages";

export default function StudyGroups() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [joinCode, setJoinCode] = useState("");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    privacy: "public",
    weekly_card_goal: 20,
    book_id: "",
  });

  const { data: myGroups = [], isLoading: loadingMine } = useQuery({
    queryKey: ["study-groups", "mine"],
    queryFn: async () => {
      const { data } = await client.get("/study-groups/mine");
      return data;
    },
  });

  const { data: books = [] } = useQuery({
    queryKey: ["books"],
    queryFn: () => fetchAllBooksPages(),
    enabled: showCreate,
  });

  const { data: searchResults = [], isLoading: loadingSearch } = useQuery({
    queryKey: ["study-groups", "search", search],
    queryFn: async () => {
      const { data } = await client.get("/study-groups/search", { params: { q: search } });
      return data;
    },
    enabled: search.trim().length >= 2,
  });

  const joinMutation = useMutation({
    mutationFn: async (code) => {
      const { data } = await client.post("/study-groups/join", { code });
      return data;
    },
    onSuccess: (data) => {
      toast({ title: "Joined group", description: `Welcome to ${data.name}` });
      setJoinCode("");
      queryClient.invalidateQueries({ queryKey: ["study-groups"] });
    },
    onError: (err) => {
      toast({
        title: "Could not join",
        description: err.response?.data?.detail || "Check the code and try again.",
        variant: "destructive",
      });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (body) => {
      const payload = {
        ...body,
        weekly_card_goal: Number(body.weekly_card_goal) || 20,
        book_id: body.book_id || null,
      };
      const { data } = await client.post("/study-groups/", payload);
      return data;
    },
    onSuccess: (data) => {
      toast({ title: "Group created", description: `Invite code: ${data.code}` });
      setShowCreate(false);
      setForm({ name: "", description: "", privacy: "public", weekly_card_goal: 20, book_id: "" });
      queryClient.invalidateQueries({ queryKey: ["study-groups"] });
      navigate(`/study-groups/${data.id}`);
    },
    onError: (err) => {
      toast({
        title: "Could not create group",
        description: err.response?.data?.detail || "Please try again.",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-center">
        <Users className="w-10 h-10 text-primary mx-auto mb-3" />
        <h1 className="font-heading text-3xl font-bold">Study Groups</h1>
        <p className="text-muted-foreground mt-1">Learn together, stay accountable</p>
      </motion.div>

      <section className="bg-card border border-border rounded-2xl p-6 space-y-4">
        <h2 className="font-heading font-semibold flex items-center gap-2">
          <Hash className="w-4 h-4" /> Join via Code
        </h2>
        <div className="flex gap-2">
          <Input
            placeholder="Enter group code"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            className="uppercase tracking-wider"
          />
          <Button
            onClick={() => joinMutation.mutate(joinCode.trim())}
            disabled={!joinCode.trim() || joinMutation.isPending}
          >
            Join
          </Button>
        </div>
      </section>

      <section className="bg-card border border-border rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-heading font-semibold flex items-center gap-2">
            <Plus className="w-4 h-4" /> New Group
          </h2>
          <Button variant="outline" size="sm" onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? "Cancel" : "Create"}
          </Button>
        </div>
        {showCreate && (
          <div className="space-y-3 pt-2">
            <div>
              <Label htmlFor="group-name">Group name</Label>
              <Input
                id="group-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Biology"
              />
            </div>
            <div>
              <Label htmlFor="group-desc">Description (optional)</Label>
              <Textarea
                id="group-desc"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="What will you study together?"
                rows={2}
              />
            </div>
            <div>
              <Label htmlFor="weekly-goal">Weekly card goal</Label>
              <Input
                id="weekly-goal"
                type="number"
                min={1}
                max={500}
                value={form.weekly_card_goal}
                onChange={(e) => setForm((f) => ({ ...f, weekly_card_goal: e.target.value }))}
                placeholder="20"
              />
              <p className="text-xs text-muted-foreground mt-1">How many cards each member should review per week</p>
            </div>
            <div>
              <Label>Study book</Label>
              <Select value={form.book_id} onValueChange={(v) => setForm((f) => ({ ...f, book_id: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a book from your library" />
                </SelectTrigger>
                <SelectContent>
                  {books.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.title} — {b.author}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {books.length === 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  No books yet — <Link to="/library" className="text-primary underline">upload one</Link> first.
                </p>
              )}
            </div>
            <div className="flex gap-2">
              {["public", "private"].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, privacy: p }))}
                  className={`px-3 py-1.5 rounded-lg text-sm capitalize ${
                    form.privacy === p ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            <Button
              onClick={() => createMutation.mutate(form)}
              disabled={form.name.trim().length < 2 || createMutation.isPending}
            >
              Create group
            </Button>
          </div>
        )}
      </section>

      <section className="bg-card border border-border rounded-2xl p-6 space-y-4">
        <h2 className="font-heading font-semibold flex items-center gap-2">
          <Search className="w-4 h-4" /> Search groups
        </h2>
        <Input placeholder="Search groups..." value={search} onChange={(e) => setSearch(e.target.value)} />
        {search.trim().length >= 2 && (
          <div className="space-y-2">
            {loadingSearch && <p className="text-sm text-muted-foreground">Searching…</p>}
            {!loadingSearch && searchResults.length === 0 && (
              <p className="text-sm text-muted-foreground">No public groups match your search.</p>
            )}
            {searchResults.map((g) => (
              <GroupCard key={g.id} group={g} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-heading font-semibold text-lg">My Groups</h2>
        {loadingMine && <p className="text-muted-foreground text-sm">Loading…</p>}
        {!loadingMine && myGroups.length === 0 && (
          <p className="text-muted-foreground text-sm">You haven&apos;t joined any groups yet.</p>
        )}
        {myGroups.map((g) => (
          <GroupCard key={g.id} group={g} clickable />
        ))}
      </section>
    </div>
  );
}

function GroupCard({ group, clickable }) {
  const statusColor = group.activity_status === "active" ? "text-green-600" : "text-muted-foreground";
  const inner = (
    <>
      <div className="min-w-0 flex-1">
        <p className="font-medium truncate">{group.name}</p>
        {group.description && (
          <p className="text-xs text-muted-foreground truncate">{group.description}</p>
        )}
        <p className="text-xs text-muted-foreground mt-1">
          {group.member_count} member{group.member_count !== 1 ? "s" : ""}
          <span className="mx-1">·</span>
          Goal: {group.weekly_card_goal ?? 20} cards/week
          <span className={`ml-2 capitalize ${statusColor}`}>· {group.activity_status}</span>
        </p>
      </div>
      {clickable && <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />}
    </>
  );

  if (clickable) {
    return (
      <Link
        to={`/study-groups/${group.id}`}
        className="p-4 rounded-xl bg-muted/40 border border-border flex items-center justify-between gap-4 hover:border-primary/30 hover:bg-primary/5 transition-colors"
      >
        {inner}
      </Link>
    );
  }

  return (
    <div className="p-4 rounded-xl bg-muted/40 border border-border flex items-center justify-between gap-4">
      {inner}
    </div>
  );
}
