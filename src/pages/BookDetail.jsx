import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import client from "@/api/client";
import GenerateProgressBar from "@/components/dashboard/GenerateProgressBar";
import SelectedChaptersList from "@/components/study/SelectedChaptersList";
import { generationPhaseLabel } from "@/lib/generationPhases";
import {
  buildFlashcardSetTitle,
  chapterSelectionSubtitle,
  cardsGeneratedLabel,
  displayChapterHeading,
} from "@/lib/studySetDisplay";
import {
  useBookGenerationJob,
  useGenerationJobs,
} from "@/lib/GenerationJobContext";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import {
  BookOpen,
  User,
  Sparkles,
  Loader2,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
  FileText,
  Tag,
  Trash2,
  Check,
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
import TocEditor from "@/components/library/TocEditor";
// Summary detail options removed to limit generation cost; default is `standard`.
import {
  tocPhaseLabel,
  getTocJobIdFromBook,
  getTocErrorFromBook,
  isTocExtractionInProgress,
} from "@/lib/bookUpload";
import { fetchEntitlementsSnapshot, isUpgradeRequiredError } from "@/lib/billing";
import { useJobPoll } from "@/hooks/useJobPoll";

export default function BookDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [selectedChapter, setSelectedChapter] = useState("");
  const [cardCount, setCardCount] = useState("5");
  const [expandedChapters, setExpandedChapters] = useState({});
  const [generating, setGenerating] = useState(false);
  const [editingTags, setEditingTags] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [summaryDetailLevel, setSummaryDetailLevel] = useState("standard");
  const [editingToc, setEditingToc] = useState(false);
  const [tocJobId, setTocJobId] = useState(null);
  const [tocPhase, setTocPhase] = useState(null);
  const [tocError, setTocError] = useState(null);
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
      return isTocExtractionInProgress(b) || tocJobId ? 2000 : false;
    },
  });

  const { data: entitlements, isLoading: entitlementsLoading } = useQuery({
    queryKey: ["billing-entitlements"],
    queryFn: fetchEntitlementsSnapshot,
  });

  const planCardCount = String(entitlements?.raw_plan_features?.max_cards_per_set || 5);

  useEffect(() => {
    setCardCount(planCardCount);
  }, [planCardCount]);

  useEffect(() => {
    setTocJobId(null);
    setTocPhase(null);
    setTocError(null);
  }, [id]);

  useEffect(() => {
    if (!book) return;
    const err = getTocErrorFromBook(book);
    if (err && !isTocExtractionInProgress(book)) {
      setTocError(err);
    }
    const jobId = getTocJobIdFromBook(book);
    if (isTocExtractionInProgress(book) && jobId) {
      setTocJobId((current) => current || jobId);
      setTocPhase(book.processing_phase || "extracting_contents");
      setTocError(null);
    }
  }, [book]);

  useJobPoll(tocJobId, {
    intervalMs: 1500,
    onProgress: (data) => {
      setTocPhase(data?.phase || null);
    },
    onTerminal: async (data) => {
      if (data.status === "complete") {
        try {
          const { data: fresh } = await client.get(`/books/${id}`);
          queryClient.setQueryData(["book", id], fresh);
          const chapters = fresh?.table_of_contents || [];
          setTocJobId(null);
          setTocPhase(null);
          if (chapters.length > 0) {
            setTocError(null);
            toast({
              title: "Table of contents ready",
              description: `${chapters.length} chapter${chapters.length === 1 ? "" : "s"} listed below.`,
            });
          } else {
            const message =
              "No chapters could be extracted from this PDF. Try again or add chapters manually.";
            setTocError(message);
            toast({
              title: "TOC extraction finished",
              description: message,
              variant: "destructive",
            });
          }
        } catch {
          setTocJobId(null);
          setTocPhase(null);
          await queryClient.invalidateQueries({ queryKey: ["book", id] });
        }
      } else {
        const message =
          data?.result?.error || data?.error || "Please try again.";
        setTocJobId(null);
        setTocPhase(null);
        setTocError(message);
        await queryClient.invalidateQueries({ queryKey: ["book", id] });
        toast({
          title: "TOC extraction failed",
          description: message,
          variant: "destructive",
        });
      }
    },
  });

  const extractToc = async () => {
    try {
      setTocError(null);
      setTocPhase("extracting_contents");
      const { data: job } = await client.post(`/books/${id}/extract-toc`);
      setTocJobId(job.job_id);
    } catch (e) {
      setTocPhase(null);
      const msg = e.response?.data?.detail;
      const description = typeof msg === "string" ? msg : e.message;
      setTocError(description);
      toast({
        title: "Could not start TOC extraction",
        description,
        variant: "destructive",
      });
    }
  };

  const toggleExpand = (idx) => {
    setExpandedChapters((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const generateFlashcards = async () => {
    if (!selectedChapter) {
      toast({ title: "Please select a chapter", variant: "destructive" });
      return;
    }

    setGenerating(true);
    try {
      const selectedChapters = selectedChapter ? [selectedChapter] : [];
      const title = buildFlashcardSetTitle(book.title, selectedChapters);

      const { data: job } = await client.post("/flashcard-sets/generate", {
        operation_id: globalThis.crypto.randomUUID(),
        book_id: id,
        title: title,
        num_cards: cardCount,
        selected_chapters: selectedChapters,
        summary_detail_level: summaryDetailLevel,
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
        description:
          "Creating summary, flashcards, and scenarios in the background. You can keep browsing MindFlip.",
        dedupeKey: "generation-started",
      });
    } catch (e) {
      setGenerating(false);
      if (isUpgradeRequiredError(e)) return;
      const msg = e.response?.data?.detail;
      const description =
        typeof msg === "object" ? msg.message : msg || e.message;

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
      await queryClient.invalidateQueries({ queryKey: ["books"] });
      await queryClient.invalidateQueries({ queryKey: ["flashcard-sets"] });
      toast({ title: "Book deleted", dedupeKey: "book-deleted" });
      navigate("/library");
    } catch (e) {
      setIsDeleting(false);
      const msg = e.response?.data?.detail;
      const description =
        typeof msg === "object" ? msg.message : msg || e.message;

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
  const chapterCardCounts = book.chapter_card_counts || {};

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <Button
          variant="ghost"
          className="gap-2 text-muted-foreground"
          onClick={() => navigate("/library")}
        >
          <ArrowLeft className="w-4 h-4" /> Back to Library
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-2"
            >
              {isDeleting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              Delete Book
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this book?</AlertDialogTitle>
              <AlertDialogDescription>
                Deleting "{book.title}" will remove it and its generated flashcards from your account,
                but it will not restore the upload allowance used to add it. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
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
              <img
                src={book.cover_url}
                alt={book.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <BookOpen className="w-16 h-16 text-primary/30" />
            )}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              {book.subject && (
                <Badge variant="secondary" className="capitalize">
                  {book.subject.replace(/_/g, " ")}
                </Badge>
              )}
            </div>
            <h1 className="font-heading text-2xl lg:text-3xl font-bold mb-2">
              {book.title}
            </h1>
            <div className="flex items-center gap-2 text-muted-foreground mb-4">
              <User className="w-4 h-4" />
              <span>{book.author}</span>
            </div>
            {book.description && (
              <p className="text-muted-foreground leading-relaxed">
                {book.description}
              </p>
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
                  <button
                    className="text-xs text-muted-foreground mt-1 hover:text-foreground"
                    onClick={() => setEditingTags(false)}
                  >
                    Done
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-1.5">
                  {(book.tags || []).map((tag) => (
                    <span
                      key={tag}
                      className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded-md"
                    >
                      #{tag}
                    </span>
                  ))}
                  <button
                    onClick={() => setEditingTags(true)}
                    className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
                  >
                    <Tag className="w-3 h-3" />{" "}
                    {book.tags?.length ? "edit tags" : "add tags"}
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
            <h2 className="font-heading text-xl font-semibold">
              Table of Contents
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {toc.length > 0
                ? editingToc
                  ? "Edit chapters — rename, merge, split, reorder, add, or delete"
                  : "Select one chapter to generate flashcards from"
                : "Extract the table of contents to select a chapter"}
            </p>
          </div>
          {toc.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditingToc((v) => !v)}
            >
              {editingToc ? "Done Editing" : "Edit TOC"}
            </Button>
          )}
        </div>

        {toc.length === 0 ? (
          <div className="text-center py-10">
            <FileText className="w-12 h-12 mx-auto text-muted-foreground/20 mb-3" />
            {isTocExtractionInProgress(book) || tocJobId || tocPhase ? (
              <>
                <Loader2 className="w-6 h-6 mx-auto animate-spin text-primary mb-3" />
                <p className="text-muted-foreground font-medium">
                  {tocPhaseLabel(
                    tocPhase || book.processing_phase || "extracting_contents",
                  )}
                </p>
                <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                  Extracting the table of contents from your document. This may take
                  a minute.
                </p>
              </>
            ) : tocError ? (
              <>
                <p className="text-destructive font-medium mb-1">
                  TOC extraction failed
                </p>
                <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
                  {tocError}
                </p>
                <Button onClick={extractToc} className="gap-2">
                  <FileText className="w-4 h-4" />
                  Retry TOC Extraction
                </Button>
              </>
            ) : (
              <>
                <p className="text-muted-foreground mb-1">
                  No table of contents yet
                </p>
                <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
                  Start extraction to browse chapters and generate targeted
                  flashcards.
                </p>
                <Button onClick={extractToc} className="gap-2">
                  <FileText className="w-4 h-4" />
                  Extract Table of Contents
                </Button>
              </>
            )}
          </div>
        ) : editingToc ? (
          <TocEditor
            bookId={book.id}
            chapters={toc}
            onSaved={() =>
              queryClient.invalidateQueries({ queryKey: ["book", id] })
            }
          />
        ) : (
          <RadioGroup
            value={selectedChapter}
            onValueChange={setSelectedChapter}
            className="space-y-2"
          >
            {toc.map((chapter, idx) => {
              const chapterNumber = idx + 1;
              const isSelected = selectedChapter === chapter.title;
              const isExpanded = expandedChapters[idx];
              const cardCount = chapterCardCounts[chapter.title] ?? 0;
              const hasCards = cardCount > 0;
              const cardsLabel = cardsGeneratedLabel(cardCount);
              return (
                <div
                  key={idx}
                  className={`rounded-xl border transition-colors ${
                    hasCards
                      ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30"
                      : isSelected
                        ? "border-primary/30 bg-primary/5"
                        : "border-border"
                  } ${isSelected ? "ring-2 ring-primary/20" : ""}`}
                >
                  <div className="flex items-center gap-3 p-4">
                    <RadioGroupItem
                      value={chapter.title}
                      id={`chapter-${idx}`}
                      className="flex-shrink-0"
                    />
                    <Label
                      htmlFor={`chapter-${idx}`}
                      className="flex-1 cursor-pointer font-normal"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">
                          {displayChapterHeading(chapter.title, chapterNumber)}
                        </span>
                        {hasCards ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                            <Check
                              className="w-3.5 h-3.5 shrink-0"
                              strokeWidth={2.5}
                            />
                            {cardsLabel}
                          </span>
                        ) : null}
                      </div>
                    </Label>
                    {chapter.subtopics?.length > 0 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => toggleExpand(idx)}
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </Button>
                    )}
                  </div>
                  {isExpanded && chapter.subtopics?.length > 0 && (
                    <div className="px-4 pb-4 pl-12 space-y-1">
                      {chapter.subtopics.map((sub, si) => (
                        <p key={si} className="text-sm text-muted-foreground">
                          • {sub}
                        </p>
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
        <h2 className="font-heading text-xl font-semibold mb-2">
          Generate Flashcards
        </h2>
        {selectedChapter ? (
          <>
            <p className="text-sm font-medium text-primary mb-2">
              {chapterSelectionSubtitle(1)}
            </p>
            <SelectedChaptersList
              chapters={[selectedChapter]}
              className="mb-6"
            />
          </>
        ) : (
          <p className="text-sm text-muted-foreground mb-6">
            Select one chapter above to generate flashcards
          </p>
        )}

        <div className="mb-6">
          <Label className="text-sm font-medium mb-3 block">
            Number of Flashcards
          </Label>
          {entitlementsLoading ? (
            <div className="h-11 w-40 animate-pulse rounded-lg bg-muted" />
          ) : (
            <div className="inline-flex items-center gap-2 rounded-lg border-2 border-primary bg-primary/5 px-4 py-2.5">
              <span className="font-heading text-lg font-semibold text-primary">{cardCount}</span>
              <span className="text-sm text-muted-foreground">cards per set</span>
            </div>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            This is the flashcard-set size included with your current plan.
          </p>
        </div>

        {activeJobId ? (
          <div className="mb-6 rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2">
            <p className="text-sm font-medium">Generating flashcards…</p>
            <p className="text-xs text-muted-foreground">
              This may take a few moments. You may continue using MindFlip while
              generation completes.
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
          disabled={
            isGenerating ||
            entitlementsLoading ||
            !selectedChapter
          }
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
