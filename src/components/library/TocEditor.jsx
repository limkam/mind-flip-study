import React, { useState } from "react";
import client from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  GripVertical, Trash2, Merge, SplitSquareHorizontal,
  Pencil, Check, X, Loader2, Save, CheckCircle2,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { displayChapterHeading } from "@/lib/studySetDisplay";

function normalizeChapters(raw) {
  return (raw || []).map((ch, i) => {
    const chapter = {
      chapter_number: ch.chapter_number ?? i + 1,
      title: ch.title || "",
      subtopics: ch.subtopics || [],
    };
    if (typeof ch.start_offset === "number" && typeof ch.end_offset === "number") {
      chapter.start_offset = ch.start_offset;
      chapter.end_offset = ch.end_offset;
    }
    return chapter;
  });
}

function hasCoverage(chapters) {
  return (
    chapters.length > 0 &&
    chapters.every((ch) => typeof ch.start_offset === "number" && typeof ch.end_offset === "number")
  );
}

/**
 * Recompute contiguous start/end offsets from each chapter's existing span
 * (end - start), in the current array order. Every edit (reorder, merge,
 * split, delete) preserves the sum of spans, so this keeps the chapters
 * covering the whole book with no gaps after any edit.
 */
function reflow(chapters) {
  if (!hasCoverage(chapters)) return chapters;
  let cursor = 0;
  return chapters.map((ch) => {
    const span = Math.max(0, ch.end_offset - ch.start_offset);
    const start_offset = cursor;
    const end_offset = cursor + span;
    cursor = end_offset;
    return { ...ch, start_offset, end_offset };
  });
}

function coverageLabel(ch, totalLength) {
  if (!totalLength || typeof ch.start_offset !== "number") return null;
  const from = Math.round((ch.start_offset / totalLength) * 100);
  const to = Math.round((ch.end_offset / totalLength) * 100);
  return `${from}%–${to}%`;
}

export default function TocEditor({ bookId, chapters: initial, totalLength, onSaved, readOnly = false }) {
  const [chapters, setChapters] = useState(() => normalizeChapters(initial));
  const [editingIdx, setEditingIdx] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const { toast } = useToast();

  const update = (next) => {
    const renumbered = next.map((ch, i) => ({ ...ch, chapter_number: i + 1 }));
    setChapters(reflow(renumbered));
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
    const next = [...chapters];
    const removed = next[idx];
    // A deleted chapter's span must be absorbed by a neighbor, or the book
    // would no longer be fully covered by the remaining chapters.
    if (typeof removed.start_offset === "number") {
      const span = removed.end_offset - removed.start_offset;
      const neighborIdx = idx < next.length - 1 ? idx + 1 : idx - 1;
      const neighbor = next[neighborIdx];
      if (neighbor) {
        next[neighborIdx] =
          neighborIdx === idx + 1
            ? { ...neighbor, start_offset: neighbor.start_offset - span }
            : { ...neighbor, end_offset: neighbor.end_offset + span };
      }
    }
    next.splice(idx, 1);
    update(next);
  };

  const mergeWithNext = (idx) => {
    if (idx >= chapters.length - 1) return;
    const a = chapters[idx];
    const b = chapters[idx + 1];
    const merged = { ...a, title: `${a.title} / ${b.title}` };
    if (typeof a.start_offset === "number" && typeof b.end_offset === "number") {
      merged.start_offset = a.start_offset;
      merged.end_offset = b.end_offset;
    }
    const next = [...chapters];
    next[idx] = merged;
    next.splice(idx + 1, 1);
    update(next);
  };

  const splitChapter = (idx) => {
    const ch = chapters[idx];
    const title = ch.title;
    const parts = title.split(/\s*\/\s*|\s+and\s+/i).filter(Boolean);
    if (parts.length < 2) {
      const half = Math.ceil(title.length / 2);
      parts[0] = title.slice(0, half).trim() || "Part 1";
      parts[1] = title.slice(half).trim() || "Part 2";
    }
    const hasSpan = typeof ch.start_offset === "number" && typeof ch.end_offset === "number";
    const totalChars = parts.reduce((sum, p) => sum + p.length, 0) || 1;
    let cursor = hasSpan ? ch.start_offset : null;
    const pieces = parts.map((t, i) => {
      const piece = { chapter_number: 0, title: t.trim(), subtopics: [] };
      if (hasSpan) {
        const remaining = ch.end_offset - cursor;
        const weight =
          i === parts.length - 1 ? remaining : Math.round((t.length / totalChars) * (ch.end_offset - ch.start_offset));
        piece.start_offset = cursor;
        piece.end_offset = cursor + Math.min(weight, remaining);
        cursor = piece.end_offset;
      }
      return piece;
    });
    const next = [...chapters];
    next.splice(idx, 1, ...pieces);
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
          ...(typeof ch.start_offset === "number"
            ? { start_offset: ch.start_offset, end_offset: ch.end_offset }
            : {}),
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

  const covered = hasCoverage(chapters);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {covered ? (
          <>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            These chapters cover the entire book, with no gaps.
          </>
        ) : (
          "Chapter boundaries aren't tracked for this book yet — re-extract the table of contents to enable coverage tracking."
        )}
      </div>
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
              <span className="flex-1 min-w-0 text-sm font-medium truncate">
                {displayChapterHeading(ch.title, idx + 1)}
                {covered && totalLength > 0 && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {coverageLabel(ch, totalLength)}
                  </span>
                )}
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

      {!readOnly && dirty && (
        <div className="flex gap-2">
          <Button size="sm" onClick={save} disabled={saving} className="gap-1.5 ml-auto">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save TOC
          </Button>
        </div>
      )}
    </div>
  );
}
