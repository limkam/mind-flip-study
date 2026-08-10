import React, { useState } from "react";
import client from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  GripVertical, Plus, Trash2, Merge, SplitSquareHorizontal,
  Pencil, Check, X, Loader2, Save,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { displayChapterHeading } from "@/lib/studySetDisplay";

function normalizeChapters(raw) {
  return (raw || []).map((ch, i) => ({
    chapter_number: ch.chapter_number ?? i + 1,
    title: ch.title || "",
    subtopics: ch.subtopics || [],
  }));
}

export default function TocEditor({ bookId, chapters: initial, onSaved, readOnly = false }) {
  const [chapters, setChapters] = useState(() => normalizeChapters(initial));
  const [editingIdx, setEditingIdx] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const { toast } = useToast();

  const update = (next) => {
    setChapters(next.map((ch, i) => ({ ...ch, chapter_number: i + 1 })));
    setDirty(true);
  };

  const startEdit = (idx) => {
    setEditingIdx(idx);
    setEditTitle(chapters[idx].title);
  };

  const commitEdit = () => {
    if (editingIdx == null) return;
    const title = editTitle.trim();
    if (!title) return;
    const next = [...chapters];
    next[editingIdx] = { ...next[editingIdx], title };
    update(next);
    setEditingIdx(null);
  };

  const deleteChapter = (idx) => {
    if (chapters.length <= 1) {
      toast({ title: "Cannot delete", description: "At least one chapter is required.", variant: "destructive" });
      return;
    }
    update(chapters.filter((_, i) => i !== idx));
  };

  const addChapter = () => {
    update([...chapters, { chapter_number: chapters.length + 1, title: "New Chapter", subtopics: [] }]);
    setEditingIdx(chapters.length);
    setEditTitle("New Chapter");
  };

  const mergeWithNext = (idx) => {
    if (idx >= chapters.length - 1) return;
    const merged = `${chapters[idx].title} / ${chapters[idx + 1].title}`;
    const next = [...chapters];
    next[idx] = { ...next[idx], title: merged };
    next.splice(idx + 1, 1);
    update(next);
  };

  const splitChapter = (idx) => {
    const title = chapters[idx].title;
    const parts = title.split(/\s*\/\s*|\s+and\s+/i).filter(Boolean);
    if (parts.length < 2) {
      const half = Math.ceil(title.length / 2);
      parts[0] = title.slice(0, half).trim() || "Part 1";
      parts[1] = title.slice(half).trim() || "Part 2";
    }
    const next = [...chapters];
    next.splice(idx, 1, ...parts.map((t) => ({ chapter_number: 0, title: t.trim(), subtopics: [] })));
    update(next);
  };

  const moveChapter = (from, to) => {
    if (to < 0 || to >= chapters.length) return;
    const next = [...chapters];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    update(next);
  };

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await client.patch(`/books/${bookId}/toc`, {
        chapters: chapters.map((ch) => ({
          chapter_number: ch.chapter_number,
          title: ch.title.trim(),
          subtopics: ch.subtopics || [],
        })),
      });
      setDirty(false);
      onSaved?.(data);
      toast({ title: "Table of contents saved" });
    } catch (e) {
      toast({
        title: "Could not save TOC",
        description: e.response?.data?.detail || e.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (!chapters.length && readOnly) {
    return <p className="text-sm text-muted-foreground">No chapters yet.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {chapters.map((ch, idx) => (
          <div
            key={`${idx}-${ch.title}`}
            className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2"
          >
            {!readOnly && (
              <div className="flex flex-col gap-0.5">
                <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => moveChapter(idx, idx - 1)} disabled={idx === 0}>
                  <GripVertical className="w-4 h-4" />
                </button>
              </div>
            )}
            {editingIdx === idx ? (
              <div className="flex-1 flex gap-2">
                <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="h-8" autoFocus />
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={commitEdit}><Check className="w-4 h-4" /></Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingIdx(null)}><X className="w-4 h-4" /></Button>
              </div>
            ) : (
              <span className="flex-1 text-sm font-medium truncate">
                {displayChapterHeading(ch.title, idx + 1)}
              </span>
            )}
            {!readOnly && editingIdx !== idx && (
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => startEdit(idx)} title="Rename"><Pencil className="w-3.5 h-3.5" /></Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => mergeWithNext(idx)} disabled={idx >= chapters.length - 1} title="Merge with next"><Merge className="w-3.5 h-3.5" /></Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => splitChapter(idx)} title="Split"><SplitSquareHorizontal className="w-3.5 h-3.5" /></Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => deleteChapter(idx)} title="Delete"><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            )}
          </div>
        ))}
      </div>

      {!readOnly && (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={addChapter} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Add Chapter
          </Button>
          {dirty && (
            <Button size="sm" onClick={save} disabled={saving} className="gap-1.5 ml-auto">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save TOC
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
