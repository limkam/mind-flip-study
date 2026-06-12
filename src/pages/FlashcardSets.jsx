import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import client from "@/api/client";
import { motion } from "framer-motion";
import { GraduationCap, BookOpen, Gamepad2, Tag, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import TagInput from "@/components/common/TagInput";
import { useToast } from "@/components/ui/use-toast";
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

export default function FlashcardSets() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editingTagsId, setEditingTagsId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const { data: sets = [], isLoading } = useQuery({
    queryKey: ["flashcard-sets"],
    queryFn: async () => {
      const { data } = await client.get("/flashcard-sets/", { params: { include_cards: false } });
      return data;
    },
  });

  const handleTagsChange = async (setId, tags) => {
    await client.put(`/flashcard-sets/${setId}`, { tags });
    queryClient.invalidateQueries({ queryKey: ["flashcard-sets"] });
  };

  const deleteSet = async (setId, title) => {
    setDeletingId(setId);
    try {
      await client.delete(`/flashcard-sets/${setId}`);
      queryClient.invalidateQueries({ queryKey: ["flashcard-sets"] });
      toast({ title: "Flashcard set deleted", description: `"${title}" was removed.` });
    } catch (e) {
      toast({
        title: "Could not delete set",
        description: e.response?.data?.detail || e.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-heading text-3xl font-bold">My Flashcard Sets</h1>
          <p className="text-muted-foreground mt-1">{sets.length} sets created</p>
        </div>
        <Link to="/library">
          <Button variant="outline" className="gap-2">
            <BookOpen className="w-4 h-4" /> Browse Library
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array(4).fill(0).map((_, i) => (
            <div key={i} className="bg-card rounded-2xl border border-border p-6 animate-pulse">
              <div className="h-5 bg-muted rounded w-1/3 mb-2" />
              <div className="h-4 bg-muted rounded w-1/4" />
            </div>
          ))}
        </div>
      ) : sets.length === 0 ? (
        <div className="text-center py-20">
          <GraduationCap className="w-16 h-16 mx-auto text-muted-foreground/20 mb-4" />
          <h3 className="font-heading text-xl font-semibold text-muted-foreground mb-2">No flashcard sets yet</h3>
          <p className="text-muted-foreground mb-6">Generate flashcards from books in your library</p>
          <Link to="/library">
            <Button className="gap-2"><BookOpen className="w-4 h-4" /> Go to Library</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {sets.map((set, i) => (
            <motion.div
              key={set.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
            >
              <div className="bg-card rounded-2xl border border-border p-5 hover:shadow-md hover:border-primary/20 transition-all group">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <GraduationCap className="w-6 h-6 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-heading font-semibold group-hover:text-primary transition-colors truncate">{set.title}</h3>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <Badge variant="secondary" className="text-xs">{set.card_count} cards</Badge>
                      {set.book_title && (
                        <span className="text-xs text-muted-foreground truncate">{set.book_title}</span>
                      )}
                    </div>
                    {editingTagsId === set.id ? (
                      <div className="mt-2" onClick={e => e.stopPropagation()}>
                        <TagInput
                          tags={set.tags || []}
                          onChange={tags => handleTagsChange(set.id, tags)}
                          placeholder="Add tags..."
                        />
                        <button className="text-xs text-muted-foreground mt-1 hover:text-foreground" onClick={() => setEditingTagsId(null)}>Done</button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-1 mt-2">
                        {(set.tags || []).map(tag => (
                          <span key={tag} className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">#{tag}</span>
                        ))}
                        <button
                          onClick={e => { e.preventDefault(); setEditingTagsId(set.id); }}
                          className="text-xs text-muted-foreground hover:text-primary flex items-center gap-0.5 transition-colors ml-1"
                        >
                          <Tag className="w-3 h-3" /> {set.tags?.length ? "edit tags" : "add tags"}
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Link to={`/study/${set.id}`}>
                      <Button variant="outline" size="sm" className="gap-1.5">
                        <GraduationCap className="w-3.5 h-3.5" /> Study
                      </Button>
                    </Link>
                    <Link to={`/study/${set.id}`}>
                      <Button size="sm" className="gap-1.5">
                        <Gamepad2 className="w-3.5 h-3.5" /> Quiz
                      </Button>
                    </Link>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-destructive"
                          disabled={deletingId === set.id}
                          aria-label={`Delete ${set.title}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete flashcard set?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This permanently deletes &quot;{set.title}&quot; and all {set.card_count} flashcards.
                            This cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => deleteSet(set.id, set.title)}
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}