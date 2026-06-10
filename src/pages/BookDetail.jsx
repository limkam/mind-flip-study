import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import client from "@/api/client";
import { useJobPoll } from "@/hooks/useJobPoll";
import GenerateProgressBar from "@/components/dashboard/GenerateProgressBar";
import { extractJobError, extractSetIdFromJob, generationPhaseLabel } from "@/lib/generationPhases";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import {
  BookOpen, User, Sparkles, Loader2, ChevronDown, ChevronRight,
  GraduationCap, ArrowLeft, FileText, Tag, Trash2
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
import GenerateWorkbookButton from "@/components/workbook/GenerateWorkbookButton";

export default function BookDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [selectedChapters, setSelectedChapters] = useState([]);
  const [cardCount, setCardCount] = useState("20");
  const [expandedChapters, setExpandedChapters] = useState({});
  const [generating, setGenerating] = useState(false);
  const [editingTags, setEditingTags] = useState(false);
  const [activeJobId, setActiveJobId] = useState(null);
  const [generationPhase, setGenerationPhase] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useJobPoll(activeJobId, {
    intervalMs: 1500,
    onProgress: (data) => {
      if (data?.phase) setGenerationPhase(data.phase);
    },
    onTerminal: async (data) => {
      const setId = extractSetIdFromJob(data);
      if (data.status === "complete" && setId) {
        setActiveJobId(null);
        setGenerating(false);
        setGenerationPhase(null);
        queryClient.invalidateQueries({ queryKey: ["flashcard-sets"] });
        toast({
          title: data?.result?.recovered ? "Flashcards ready" : "Study content generated!",
          description: "Summary, flashcards, and scenarios are ready.",
        });
        navigate(`/study/${setId}`);
        return;
      }

      if (data.status === "failed" && id) {
        try {
          const { data: sets } = await client.get("/flashcard-sets/", { params: { include_cards: false } });
          const bookSets = (sets || []).filter((s) => s.book_id === id);
          const recent = bookSets[0];
          if (recent?.id) {
            setActiveJobId(null);
            setGenerating(false);
            setGenerationPhase(null);
            queryClient.invalidateQueries({ queryKey: ["flashcard-sets"] });
            toast({
              title: "Flashcards ready",
              description: "Generation finished — your study set was saved.",
            });
            navigate(`/study/${recent.id}`);
            return;
          }
        } catch {
          /* fall through to error toast */
        }
      }

      setActiveJobId(null);
      setGenerating(false);
      setGenerationPhase(null);
      const err = extractJobError(data) || "Generation failed";
      toast({ title: "Generation failed", description: err, variant: "destructive" });
    },
  });

  const { data: book, isLoading } = useQuery({
    queryKey: ["book", id],
    queryFn: async () => {
      const { data } = await client.get(`/books/${id}`);
      return data;
    },
  });

  const { data: existingWorkbooks = [] } = useQuery({
    queryKey: ["workbooks", id],
    queryFn: async () => {
      const { data } = await client.get(`/workbooks/`, { params: { book_id: id } });
      return data;
    },
    enabled: !!id,
  });

  const toggleChapter = (title) => {
    setSelectedChapters(prev =>
      prev.includes(title) ? prev.filter(t => t !== title) : [...prev, title]
    );
  };

  const selectAll = () => {
    if (!book?.table_of_contents) return;
    const all = book.table_of_contents.map(ch => ch.title);
    setSelectedChapters(prev => prev.length === all.length ? [] : all);
  };

  const toggleExpand = (idx) => {
    setExpandedChapters(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  const generateFlashcards = async () => {
    const toc = book.table_of_contents || [];
    if (toc.length > 0 && selectedChapters.length === 0) {
      toast({ title: "Please select at least one chapter", variant: "destructive" });
      return;
    }

    setGenerating(true);
    setGenerationPhase("starting");
    try {
      const count = parseInt(cardCount, 10);
      const title =
        toc.length === 0
          ? `${book.title} — Study set`
          : `${book.title} — ${selectedChapters.join(", ")}`;

      const { data: job } = await client.post("/flashcard-sets/generate", {
        book_id: id,
        title: title,
        num_cards: cardCount,
        selected_chapters: selectedChapters,
      });
      setActiveJobId(job.job_id);
      toast({ title: "Generation started", description: "Creating summary, flashcards, and scenarios…" });
    } catch (e) {
      setGenerating(false);
      setGenerationPhase(null);
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
      toast({ title: "Book deleted" });
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
                This will permanently delete "{book.title}" and all generated flashcards and workbooks associated with it. This action cannot be undone.
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
            <div className="mt-5">
              <GenerateWorkbookButton
                book={book}
                existingWorkbookId={existingWorkbooks[0]?.id}
              />
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
            <p className="text-sm text-muted-foreground mt-1">Select chapters to generate flashcards from</p>
          </div>
          <Button variant="outline" size="sm" onClick={selectAll}>
            {selectedChapters.length === toc.length ? "Deselect All" : "Select All"}
          </Button>
        </div>

        {toc.length === 0 ? (
          <div className="text-center py-10">
            <FileText className="w-12 h-12 mx-auto text-muted-foreground/20 mb-3" />
            <p className="text-muted-foreground">No table of contents extracted yet.</p>
            <p className="text-sm text-muted-foreground mt-1">Try re-uploading the book with a PDF file.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {toc.map((chapter, idx) => {
              const isSelected = selectedChapters.includes(chapter.title);
              const isExpanded = expandedChapters[idx];
              return (
                <div key={idx} className={`rounded-xl border transition-colors ${isSelected ? "border-primary/30 bg-primary/5" : "border-border"}`}>
                  <div className="flex items-center gap-3 p-4">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleChapter(chapter.title)}
                      className="flex-shrink-0"
                    />
                    <div className="flex-1 cursor-pointer" onClick={() => toggleChapter(chapter.title)}>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded">
                          Ch. {chapter.chapter_number || idx + 1}
                        </span>
                        <span className="font-medium text-sm">{chapter.title}</span>
                      </div>
                    </div>
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
          </div>
        )}
      </motion.div>

      {/* Generate Options */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-card rounded-2xl border border-border p-6 lg:p-8"
      >
        <h2 className="font-heading text-xl font-semibold mb-4">Generate Flashcards</h2>
        <p className="text-sm text-muted-foreground mb-6">
          {selectedChapters.length} chapter{selectedChapters.length !== 1 ? 's' : ''} selected
        </p>

        <div className="mb-6">
          <Label className="text-sm font-medium mb-3 block">Number of Flashcards</Label>
          <RadioGroup value={cardCount} onValueChange={setCardCount} className="flex gap-4">
            {["20", "50", "100"].map(n => (
              <Label
                key={n}
                htmlFor={`count-${n}`}
                className={`flex items-center gap-3 px-5 py-3 rounded-xl border-2 cursor-pointer transition-all
                  ${cardCount === n ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}
              >
                <RadioGroupItem value={n} id={`count-${n}`} />
                <span className="font-heading font-semibold text-lg">{n}</span>
                <span className="text-xs text-muted-foreground">cards</span>
              </Label>
            ))}
          </RadioGroup>
        </div>

        {activeJobId ? (
          <GenerateProgressBar phase={generationPhase} label={generationPhaseLabel(generationPhase)} />
        ) : null}

        <Button
          onClick={generateFlashcards}
          disabled={generating || ((book.table_of_contents || []).length > 0 && selectedChapters.length === 0)}
          size="lg"
          className="w-full gap-2 h-14 text-base font-semibold"
        >
          {generating ? (
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