import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import client from "@/api/client";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, BookOpen, Loader2, ChevronDown, ChevronRight, Lightbulb, PenLine, CheckCircle2, Eye, EyeOff, Save } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export default function WorkbookView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [expandedChapter, setExpandedChapter] = useState(0);
  const [revealedAnswers, setRevealedAnswers] = useState({});
  const [userAnswers, setUserAnswers] = useState({});
  const [userNotes, setUserNotes] = useState({});
  const [savingNotes, setSavingNotes] = useState({});

  const { data: workbook, isLoading } = useQuery({
    queryKey: ["workbook", id],
    queryFn: async () => {
      const { data: wb } = await client.get(`/workbooks/${id}`);
      const mapped = { ...wb, chapters: wb.content?.chapters || [] };
      if (mapped.chapters?.length) {
        const notes = {};
        mapped.chapters.forEach((ch, i) => { notes[i] = ch.user_notes || ""; });
        setUserNotes(notes);
      }
      return mapped;
    },
  });

  const toggleAnswer = (chIdx, exIdx) => {
    const key = `${chIdx}-${exIdx}`;
    setRevealedAnswers(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const saveNotes = async (chapterIndex) => {
    setSavingNotes(prev => ({ ...prev, [chapterIndex]: true }));
    const updatedChapters = workbook.chapters.map((ch, i) =>
      i === chapterIndex ? { ...ch, user_notes: userNotes[chapterIndex] || "" } : ch
    );
    await client.patch(`/workbooks/${workbook.id}`, {
      content: { ...(workbook.content || {}), chapters: updatedChapters },
    });
    queryClient.invalidateQueries({ queryKey: ["workbook", id] });
    setSavingNotes(prev => ({ ...prev, [chapterIndex]: false }));
    toast({ title: "Notes saved!" });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!workbook) {
    return <div className="text-center py-20 text-muted-foreground">Workbook not found</div>;
  }

  const chapters = workbook.chapters || [];
  const exerciseTypeColors = {
    short_answer: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    reflection: "bg-violet-500/10 text-violet-600 border-violet-500/20",
    apply: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  };
  const exerciseTypeLabels = { short_answer: "Short Answer", reflection: "Reflection", apply: "Apply" };

  return (
    <div className="max-w-4xl mx-auto">
      <Button variant="ghost" className="gap-2 mb-6 text-muted-foreground" onClick={() => navigate(-1)}>
        <ArrowLeft className="w-4 h-4" /> Back
      </Button>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <BookOpen className="w-5 h-5 text-primary" />
          <span className="text-sm text-muted-foreground font-medium">{workbook.book_title}</span>
        </div>
        <h1 className="font-heading text-3xl font-bold">{workbook.title}</h1>
        <p className="text-muted-foreground mt-1">{chapters.length} chapters</p>
      </motion.div>

      {/* Chapter list */}
      <div className="space-y-4">
        {chapters.map((chapter, chIdx) => {
          const isOpen = expandedChapter === chIdx;
          return (
            <motion.div
              key={chIdx}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: chIdx * 0.04 }}
              className="bg-card rounded-2xl border border-border overflow-hidden"
            >
              {/* Chapter header */}
              <button
                onClick={() => setExpandedChapter(isOpen ? null : chIdx)}
                className="w-full flex items-center gap-4 p-5 text-left hover:bg-muted/40 transition-colors"
              >
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-primary">{chIdx + 1}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{chapter.chapter_title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {(chapter.key_concepts || []).length} concepts • {(chapter.exercises || []).length} exercises
                  </p>
                </div>
                {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
              </button>

              <AnimatePresence>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="overflow-hidden"
                  >
                    <div className="px-5 pb-6 space-y-6 border-t border-border pt-5">

                      {/* Lesson */}
                      {chapter.lesson && (
                        <div>
                          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Lesson</h3>
                          <p className="text-sm leading-relaxed text-foreground">{chapter.lesson}</p>
                        </div>
                      )}

                      {/* Key Concepts */}
                      {chapter.key_concepts?.length > 0 && (
                        <div>
                          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                            <Lightbulb className="w-3.5 h-3.5" /> Key Concepts
                          </h3>
                          <div className="flex flex-wrap gap-2">
                            {chapter.key_concepts.map((kc, i) => (
                              <Badge key={i} variant="secondary" className="text-xs font-medium">
                                {kc}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Exercises */}
                      {chapter.exercises?.length > 0 && (
                        <div>
                          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Exercises</h3>
                          <div className="space-y-4">
                            {chapter.exercises.map((ex, exIdx) => {
                              const key = `${chIdx}-${exIdx}`;
                              const revealed = revealedAnswers[key];
                              return (
                                <div key={exIdx} className="rounded-xl border border-border p-4 space-y-3">
                                  <div className="flex items-start gap-3">
                                    <span className="text-xs font-bold text-muted-foreground mt-0.5 min-w-[20px]">Q{exIdx + 1}</span>
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                                        {ex.type && (
                                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${exerciseTypeColors[ex.type] || ""}`}>
                                            {exerciseTypeLabels[ex.type] || ex.type}
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-sm font-medium">{ex.question}</p>
                                    </div>
                                  </div>

                                  {/* User answer input */}
                                  <Textarea
                                    placeholder="Write your answer here..."
                                    value={userAnswers[key] || ""}
                                    onChange={e => setUserAnswers(prev => ({ ...prev, [key]: e.target.value }))}
                                    rows={2}
                                    className="text-sm resize-none"
                                  />

                                  {/* Reveal answer */}
                                  <div className="flex items-center gap-2">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                                      onClick={() => toggleAnswer(chIdx, exIdx)}
                                    >
                                      {revealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                      {revealed ? "Hide Answer" : "Show Answer"}
                                    </Button>
                                  </div>

                                  <AnimatePresence>
                                    {revealed && ex.answer && (
                                      <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: "auto" }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="overflow-hidden"
                                      >
                                        <div className="rounded-lg bg-emerald-500/8 border border-emerald-500/20 p-3 flex gap-2">
                                          <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                                          <p className="text-sm text-foreground">{ex.answer}</p>
                                        </div>
                                      </motion.div>
                                    )}
                                  </AnimatePresence>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* My Notes */}
                      <div>
                        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                          <PenLine className="w-3.5 h-3.5" /> My Notes
                        </h3>
                        <Textarea
                          placeholder="Add your personal notes for this chapter..."
                          value={userNotes[chIdx] || ""}
                          onChange={e => setUserNotes(prev => ({ ...prev, [chIdx]: e.target.value }))}
                          rows={4}
                          className="text-sm resize-none mb-2"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          onClick={() => saveNotes(chIdx)}
                          disabled={savingNotes[chIdx]}
                        >
                          {savingNotes[chIdx] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                          Save Notes
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}