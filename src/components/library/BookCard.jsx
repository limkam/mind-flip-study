import React, { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { BookOpen, User, ChevronRight, Trash2, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import client from "@/api/client";
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

export default function BookCard({ book, index = 0, onDelete }) {
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();

  const handleDelete = async (e) => {
    // These are crucial to stop the browser from following the Link if still nested
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    setIsDeleting(true);
    try {
      await client.delete(`/books/${book.id}`);
      toast({ title: "Book deleted" });
      if (onDelete) onDelete();
    } catch (error) {
      console.error("Delete error:", error);
      const msg = error.response?.data?.detail;
      const description = typeof msg === "object" ? msg.message : msg || error.message;

      toast({
        title: "Failed to delete book",
        description,
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const subjectColors = {
    mathematics: "bg-blue-500/10 text-blue-500",
    science: "bg-green-500/10 text-green-500",
    history: "bg-yellow-500/10 text-yellow-500",
    literature: "bg-purple-500/10 text-purple-500",
    technology: "bg-cyan-500/10 text-cyan-500",
    business: "bg-orange-500/10 text-orange-500",
    arts: "bg-pink-500/10 text-pink-500",
    languages: "bg-indigo-500/10 text-indigo-500",
    philosophy: "bg-amber-500/10 text-amber-500",
    other: "bg-gray-500/10 text-gray-500",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="relative"
    >
      {/* Delete Button - Placed ABOVE the link in the DOM and using absolute positioning */}
          <div className="absolute top-3 right-3 z-30">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              className="w-8 h-8 rounded-full bg-destructive/90 text-destructive-foreground flex items-center justify-center shadow-lg hover:bg-destructive transition-colors disabled:opacity-50"
              disabled={isDeleting}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              {isDeleting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete "{book.title}" and all its flashcards.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <Link
        to={`/book/${book.id}`}
        className="group block bg-card rounded-2xl border border-border overflow-hidden hover:shadow-lg hover:border-primary/20 transition-all duration-300 relative z-10"
      >
        <div className="aspect-[4/3] bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center relative overflow-hidden">
          {book.cover_url ? (
            <img src={book.cover_url} alt={book.title} className="w-full h-full object-cover" />
          ) : (
            <BookOpen className="w-16 h-16 text-primary/30" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          
          <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-all transform translate-y-2 group-hover:translate-y-0">
            <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
              <ChevronRight className="w-5 h-5 text-primary" />
            </div>
          </div>
        </div>
        <div className="p-4">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            {book?.subject && (
              <Badge variant="secondary" className={subjectColors[book.subject] || subjectColors.other}>
                {book.subject?.replace(/_/g, ' ')}
              </Badge>
            )}
            {book?.table_of_contents?.length > 0 && (
              <Badge variant="outline" className="text-xs">
                {book.table_of_contents.length} chapters
              </Badge>
            )}
          </div>
          <h3 className="font-heading font-semibold text-foreground line-clamp-1 group-hover:text-primary transition-colors">
            {book?.title || "Untitled Book"}
          </h3>
          <div className="flex items-center gap-1.5 mt-1.5">
            <User className="w-3.5 h-3.5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{book?.author || "Unknown Author"}</p>
          </div>
          {book?.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {book.tags.map(tag => (
                <span key={tag} className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">#{tag}</span>
              ))}
            </div>
          )}
        </div>
      </Link>
    </motion.div>
  );
}