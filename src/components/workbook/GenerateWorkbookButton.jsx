import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import client from "@/api/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, BookMarked, Sparkles } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

async function pollJob(jobId) {
  const start = Date.now();
  while (Date.now() - start < 120000) {
    const { data } = await client.get(`/jobs/${jobId}`);
    if (data.status === "complete") return data.result;
    if (data.status === "failed") throw new Error("Job failed");
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error("Timed out");
}

export default function GenerateWorkbookButton({ book, existingWorkbookId }) {
  const [open, setOpen] = useState(false);
  const [selectedChapters, setSelectedChapters] = useState([]);
  const [generating, setGenerating] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const toc = book?.table_of_contents || [];

  const toggleChapter = (title) => {
    setSelectedChapters(prev =>
      prev.includes(title) ? prev.filter(t => t !== title) : [...prev, title]
    );
  };

  const selectAll = () => {
    const all = toc.map(ch => ch.title);
    setSelectedChapters(prev => prev.length === all.length ? [] : all);
  };

  const generate = async () => {
    if (toc.length > 0 && selectedChapters.length === 0) {
      toast({ title: "Select at least one chapter", variant: "destructive" });
      return;
    }
    setGenerating(true);
    try {
      const chapterHint = toc.length === 0 ? null : selectedChapters.join(", ");
      const { data: job } = await client.post("/workbooks/generate", {
        book_id: book.id,
        title: `${book.title} — Workbook`,
        chapter_hint: chapterHint,
        selected_chapters: selectedChapters,
      });
      const result = await pollJob(job.job_id);
      toast({ title: "Workbook generated!" });
      setOpen(false);
      navigate(`/workbook/${result.workbook_id}`);
    } catch (e) {
      toast({
        title: "Workbook generation failed",
        description: e.response?.data?.detail || e.message,
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  if (existingWorkbookId) {
    return (
      <Button
        variant="outline"
        className="gap-2"
        onClick={() => navigate(`/workbook/${existingWorkbookId}`)}
      >
        <BookMarked className="w-4 h-4" /> Open Workbook
      </Button>
    );
  }

  return (
    <>
      <Button variant="outline" className="gap-2" onClick={() => setOpen(true)}>
        <BookMarked className="w-4 h-4" /> Generate Workbook
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="font-heading">Generate Workbook</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Select chapters to include — AI builds lessons from your uploaded PDF. If there is no table of contents yet, the full book is used.
          </p>

          <div className="flex items-center justify-between my-2">
            <span className="text-sm font-medium">{selectedChapters.length} selected</span>
            {toc.length > 0 && (
              <button type="button" className="text-xs text-primary hover:underline" onClick={selectAll}>
                {selectedChapters.length === toc.length ? "Deselect All" : "Select All"}
              </button>
            )}
          </div>

          <div className="overflow-y-auto flex-1 space-y-2 pr-1">
            {toc.map((ch, i) => (
              <label key={i} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors
                ${selectedChapters.includes(ch.title) ? "border-primary/40 bg-primary/5" : "border-border hover:bg-muted/40"}`}>
                <Checkbox
                  checked={selectedChapters.includes(ch.title)}
                  onCheckedChange={() => toggleChapter(ch.title)}
                />
                <span className="text-sm font-medium">{ch.title}</span>
              </label>
            ))}
            {toc.length === 0 && (
              <p className="text-center text-muted-foreground py-6 text-sm">No chapters listed — we will use the full PDF.</p>
            )}
          </div>

          <Button
            onClick={generate}
            disabled={generating || (toc.length > 0 && selectedChapters.length === 0)}
            className="w-full gap-2 mt-2"
          >
            {generating ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Generating Workbook...</>
            ) : (
              <><Sparkles className="w-4 h-4" /> Generate Workbook</>
            )}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
