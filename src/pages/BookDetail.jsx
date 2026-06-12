import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import client from "@/api/client";
import GenerateProgressBar from "@/components/dashboard/GenerateProgressBar";
import SelectedChaptersList from "@/components/study/SelectedChaptersList";
import { generationPhaseLabel } from "@/lib/generationPhases";
import { buildFlashcardSetTitle, chapterSelectionSubtitle } from "@/lib/studySetDisplay";
import { useBookGenerationJob, useGenerationJobs } from "@/lib/GenerationJobContext";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import {
  BookOpen, User, Sparkles, Loader2, ChevronDown, ChevronRight,
  ArrowLeft, FileText, Tag, Trash2
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import TagInput from "@/components/common/TagInput";
import { tocPhaseLabel } from "@/lib/bookUpload";
import { FLASHCARD_COUNT_OPTIONS, DEFAULT_FLASHCARD_COUNT } from "@/lib/flashcardOptions";
import { useJobPoll } from "@/hooks/useJobPoll";

export default function BookDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [selectedChapter, setSelectedChapter] = useState("");
  const [cardCount, setCardCount] = useState(String(DEFAULT_FLASHCARD_COUNT));
  const [expandedChapters, setExpandedChapters] = useState({});
  const [generating, setGenerating] = useState(false);
  const [editingTags, setEditingTags] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [forceRegenerate, setForceRegenerate] = useState(false);
  const [tocJobId, setTocJobId] = useState(null);
  const [tocPhase, setTocPhase] = useState(null);
  const { startJob } = useGenerationJobs();
  const activeBookJob = useBookGenerationJob(id);
  const activeJobId = activeBookJob?.jobId || null;
  const isGenerating = !!activeJobId || generating;

  const { data: book, isLoading } = useQuery({
    queryKey: ["book", id],
    queryFn: async () => {
      const { data } = await client.get(`/books/${id}`);
      return data;
    },
    refetchInterval: (query) => {
      const b = query.state.data;
      return b?.is_analyzing || tocJobId ? 2000 : false;
    },
  });

  useJobPoll(tocJobId, {
    enabled: !!tocJobId,
    intervalMs: 1500,
    onProgress: (data) => {
      setTocPhase(data?.phase || null);
    },
    onTerminal: async (data) => {
      setTocJobId(null);
      setTocPhase(null);
      if (data.status === "complete") {
        await queryClient.invalidateQueries({ queryKey: ["book", id] });
        toast({ title: "Table of contents ready", description: "Chapters are listed below." });
      } else {
        toast({
          title: "TOC extraction failed",
          description: data?.result?.error || "Please try again.",
          variant: "destructive",
        });
      }
    },
  });

  const extractToc = async () => {
    try {
      setTocPhase("extracting_contents");
      const { data: job } = await client.post(`/books/${id}/extract-toc`);
      setTocJobId(job.job_id);
    } catch (e) {
      setTocPhase(null);
      const msg = e.response?.data?.detail;
      toast({
        title: "Could not start TOC extraction",
        description: typeof msg === "string" ? msg : e.message,
        variant: "destructive",
      });
    }
  };


  const toggleExpand = (idx) => {
    setExpandedChapters(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  const generateFlashcards = async () => {
    const toc = book.table_of_contents || [];
    if (toc.length > 0 && !selectedChapter) {
      toast({ title: "Please select a chapter", variant: "destructive" });
      return;
    }

    setGenerating(true);
    try {
      const selectedChapters = selectedChapter ? [selectedChapter] : [];
      const title = buildFlashcardSetTitle(book.title, selectedChapters);

      const { data: job } = await client.post("/flashcard-sets/generate", {
        book_id: id,
        title: title,
        num_cards: cardCount,
        selected_chapters: selectedChapters,
        force_regenerate: forceRegenerate,
      });

      if (job.reused && job.set_id) {
        setGenerating(false);
        toast({
          title: "Flashcards ready",
          description: "Using your existing flashcard set for these chapters.",
        });
        navigate(`/study/${job.set_id}`);
        return;
      }

      startJob({ jobId: job.job_id, bookId: id, bookTitle: book.title });
      setGenerating(false);
      toast({
        title: "Generation started",
        description: "Creating summary, flashcards, and scenarios in the background. You can keep browsing MindFlip.",
        dedupeKey: "generation-started",
      });
    } catch (e) {
      setGenerating(false);
      const msg = e.response?.data?.detail;
      const description = typeof msg === "object" ? msg.message : msg || e.message;
      
      toast({
        title: "Generation failed",
        description,
        variant: "destructive",
      });
    }
  };
  
  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await client.delete(`/books/${id}`);
      toast({ title: "Book deleted", dedupeKey: "book-deleted" });
      navigate("/library");
    } catch (e) {
      setIsDeleting(false);
      const msg = e.response?.data?.detail;
      const description = typeof msg === "object" ? msg.message : msg || e.message;
      
      toast({
        title: "Delete failed",
        description,
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!book) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Book not found</p>
      </div>
    );
  }

  const toc = book.table_of_contents || [];

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <Button variant="ghost" className="gap-2 text-muted-foreground" onClick={() => navigate("/library")}>
          <ArrowLeft className="w-4 h-4" /> Back to Library
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-2">
              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Delete Book
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete "{book.title}" and all generated flashcards associated with it. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete Book
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Book header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card rounded-2xl border border-border p-6 lg:p-8 mb-8"
      >
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="w-full lg:w-48 aspect-[3/4] bg-gradient-to-br from-primary/10 to-accent/10 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden">
            {book.cover_url ? (
              <img src={book.cover_url} alt={book.title} className="w-full h-full object-cover" />
            ) : (
              <BookOpen className="w-16 h-16 text-primary/30" />
            )}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              {book.subject && (
                <Badge variant="secondary" className="capitalize">
                  {book.subject.replace(/_/g, ' ')}
                </Badge>
              )}
            </div>
            <h1 className="font-heading text-2xl lg:text-3xl font-bold mb-2">{book.title}</h1>
            <div className="flex items-center gap-2 text-muted-foreground mb-4">
              <User className="w-4 h-4" />
              <span>{book.author}</span>
            </div>
            {book.description && (
              <p className="text-muted-foreground leading-relaxed">{book.description}</p>
            )}
            <div className="flex items-center gap-4 mt-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <FileText className="w-4 h-4" /> {toc.length} chapters
              </span>
            </div>
            <div className="mt-4">
              {editingTags ? (
                <div>
                  <TagInput
                    tags={book.tags || []}
                    onChange={async (tags) => {
                      const ex = book.extras || {};
                      await client.patch(`/books/${book.id}`, {
                        extras: { ...ex, tags },
                      });
                      queryClient.invalidateQueries({ queryKey: ["book", id] });
                    }}
                    placeholder="Add tags (press Enter)..."
                  />
                  <button className="text-xs text-muted-foreground mt-1 hover:text-foreground" onClick={() => setEditingTags(false)}>Done</button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-1.5">
                  {(book.tags || []).map(tag => (
                    <span key={tag} className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded-md">#{tag}</span>
                  ))}
                  <button onClick={() => setEditingTags(true)} className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors">
                    <Tag className="w-3 h-3" /> {book.tags?.length ? "edit tags" : "add tags"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* TOC Selection */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-card rounded-2xl border border-border p-6 lg:p-8 mb-6"
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="font-heading text-xl font-semibold">Table of Contents</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {toc.length > 0
                ? "Select one chapter to generate flashcards from"
                : "Extract the table of contents to select a chapter"}
            </p>
          </div>
        </div>

        {book.toc_extraction_method && book.toc_extraction_method !== "ai" && toc.length > 0 && (
          <p className="text-sm text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-3 mb-4">
            Chapter list may be incomplete — AI did not run on the server (method: {book.toc_extraction_method}).
            Ensure <code className="text-xs">ANTHROPIC_API_KEY</code> is set on both API and worker in production, then extract TOC again.
          </p>
        )}

        {toc.length === 0 ? (
          <div className="text-center py-10">
            <FileText className="w-12 h-12 mx-auto text-muted-foreground/20 mb-3" />
            {tocJobId || book.is_analyzing || tocPhase ? (
              <>
                <Loader2 className="w-6 h-6 mx-auto animate-spin text-primary mb-3" />
                <p className="text-muted-foreground font-medium">
                  {tocPhaseLabel(tocPhase || book.processing_phase || "extracting_contents")}
                </p>
                <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                  Reading your PDF and building a structured chapter list. This may take a minute.
                </p>
              </>
            ) : (
              <>
                <p className="text-muted-foreground mb-1">No table of contents yet</p>
                <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
                  Extract the TOC to browse chapters and generate targeted flashcards.
                </p>
                <Button onClick={extractToc} className="gap-2">
                  <FileText className="w-4 h-4" />
                  Extract Table of Contents (TOC)
                </Button>
              </>
            )}
          </div>
        ) : (
          <RadioGroup value={selectedChapter} onValueChange={setSelectedChapter} className="space-y-2">
            {toc.map((chapter, idx) => {
              const isSelected = selectedChapter === chapter.title;
              const isExpanded = expandedChapters[idx];
              return (
                <div key={idx} className={`rounded-xl border transition-colors ${isSelected ? "border-primary/30 bg-primary/5" : "border-border"}`}>
                  <div className="flex items-center gap-3 p-4">
                    <RadioGroupItem value={chapter.title} id={`chapter-${idx}`} className="flex-shrink-0" />
                    <Label htmlFor={`chapter-${idx}`} className="flex-1 cursor-pointer font-normal">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded">
                          Ch. {chapter.chapter_number || idx + 1}
                        </span>
                        <span className="font-medium text-sm">{chapter.title}</span>
                      </div>
                    </Label>
                    {chapter.subtopics?.length > 0 && (
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleExpand(idx)}>
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </Button>
                    )}
                  </div>
                  {isExpanded && chapter.subtopics?.length > 0 && (
                    <div className="px-4 pb-4 pl-12 space-y-1">
                      {chapter.subtopics.map((sub, si) => (
                        <p key={si} className="text-sm text-muted-foreground">• {sub}</p>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </RadioGroup>
        )}
      </motion.div>

      {/* Generate Options */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-card rounded-2xl border border-border p-6 lg:p-8"
      >
        <h2 className="font-heading text-xl font-semibold mb-2">Generate Flashcards</h2>
        {selectedChapter ? (
          <>
            <p className="text-sm font-medium text-primary mb-2">
              {chapterSelectionSubtitle(1)}
            </p>
            <SelectedChaptersList chapters={[selectedChapter]} className="mb-6" />
          </>
        ) : (
          <p className="text-sm text-muted-foreground mb-6">
            Select one chapter above to generate flashcards
          </p>
        )}

        <div className="mb-6">
          <Label className="text-sm font-medium mb-3 block">Number of Flashcards</Label>
          <RadioGroup value={cardCount} onValueChange={setCardCount} className="flex flex-wrap gap-2">
            {FLASHCARD_COUNT_OPTIONS.map(n => (
              <Label
                key={n}
                htmlFor={`count-${n}`}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 cursor-pointer transition-all
                  ${cardCount === String(n) ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}
              >
                <RadioGroupItem value={String(n)} id={`count-${n}`} />
                <span className="font-heading font-semibold text-base">{n}</span>
                <span className="text-xs text-muted-foreground">cards</span>
              </Label>
            ))}
          </RadioGroup>
        </div>

        <label className="flex items-center gap-2 mb-4 text-sm text-muted-foreground cursor-pointer">
          <Checkbox checked={forceRegenerate} onCheckedChange={setForceRegenerate} />
          Regenerate even if flashcards already exist for these chapters
        </label>

        {activeJobId ? (
          <div className="mb-6 rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2">
            <p className="text-sm font-medium">Generating flashcards…</p>
            <p className="text-xs text-muted-foreground">
              This may take a few moments. You may continue using MindFlip while generation completes.
            </p>
            <GenerateProgressBar
              phase={activeBookJob?.phase}
              label={generationPhaseLabel(activeBookJob?.phase)}
              chaptersTotal={activeBookJob?.chaptersTotal}
              chaptersDone={activeBookJob?.chaptersDone}
              percentComplete={activeBookJob?.percentComplete}
              currentChapter={activeBookJob?.currentChapter}
            />
          </div>
        ) : null}

        <Button
          onClick={generateFlashcards}
          disabled={isGenerating || ((book.table_of_contents || []).length > 0 && !selectedChapter)}
          size="lg"
          className="w-full gap-2 h-14 text-base font-semibold"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              {activeJobId ? "Almost there…" : "Starting…"}
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5" />
              Generate {cardCount} Flashcards
            </>
          )}
        </Button>
      </motion.div>
    </div>
  );
}