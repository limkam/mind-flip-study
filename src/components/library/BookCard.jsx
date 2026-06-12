import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { BookOpen, User, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function BookCard({ book, index = 0 }) {
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
    >
      <Link
        to={`/book/${book.id}`}
        className="group block bg-card rounded-2xl border border-border overflow-hidden hover:shadow-lg hover:border-primary/20 transition-all duration-300"
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
            {book?.table_of_contents?.length === 0 && !book?.is_analyzing && (
              <Badge variant="secondary" className="text-xs bg-muted text-muted-foreground">
                TOC not extracted
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
