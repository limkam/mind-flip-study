import React from "react";
import { motion } from "framer-motion";
import { BookOpen, GraduationCap, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const COLOR_MAP = {
  violet: "from-violet-500/20 to-purple-500/10 border-violet-300/40",
  rose: "from-rose-500/20 to-pink-500/10 border-rose-300/40",
  blue: "from-blue-500/20 to-cyan-500/10 border-blue-300/40",
  green: "from-emerald-500/20 to-teal-500/10 border-emerald-300/40",
  amber: "from-amber-500/20 to-yellow-500/10 border-amber-300/40",
  orange: "from-orange-500/20 to-red-500/10 border-orange-300/40",
};

export default function FolderCard({ folder, onClick, onEdit, onDelete }) {
  const colorClass = COLOR_MAP[folder.color] || COLOR_MAP.violet;
  const bookCount = folder.book_ids?.length || 0;
  const setCount = folder.flashcard_set_ids?.length || 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4, boxShadow: "0 12px 32px -8px rgba(139,92,246,0.18)" }}
      transition={{ duration: 0.2 }}
      className={`relative bg-gradient-to-br ${colorClass} border rounded-2xl p-5 cursor-pointer group`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-3">
        <span className="text-3xl">{folder.icon || "📁"}</span>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={e => { e.stopPropagation(); onEdit(folder); }}
          >
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 hover:text-destructive"
            onClick={e => { e.stopPropagation(); onDelete(folder); }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
      <h3 className="font-heading font-semibold text-base leading-tight mb-1">{folder.name}</h3>
      {folder.description && (
        <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{folder.description}</p>
      )}
      <div className="flex items-center gap-3 mt-3">
        {bookCount > 0 && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground font-medium">
            <BookOpen className="w-3.5 h-3.5" /> {bookCount} book{bookCount !== 1 ? "s" : ""}
          </span>
        )}
        {setCount > 0 && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground font-medium">
            <GraduationCap className="w-3.5 h-3.5" /> {setCount} set{setCount !== 1 ? "s" : ""}
          </span>
        )}
        {bookCount === 0 && setCount === 0 && (
          <span className="text-xs text-muted-foreground italic">Empty folder</span>
        )}
      </div>
    </motion.div>
  );
}