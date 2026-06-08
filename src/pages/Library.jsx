import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Plus, Search, BookOpen, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import BookCard from "@/components/library/BookCard";
import UploadBookDialog from "@/components/library/UploadBookDialog";
import { fetchAllBooksPages } from "@/lib/fetchAllBooksPages";

const SUBJECTS = [
  "all", "mathematics", "science", "history", "literature", "technology",
  "business", "arts", "languages", "philosophy", "other"
];

export default function Library() {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("");
  const queryClient = useQueryClient();

  const { data: books = [], isLoading } = useQuery({
    queryKey: ["books"],
    queryFn: () => fetchAllBooksPages(),
  });

  const allTags = [...new Set(books.flatMap(b => b.tags || []))].sort();

  const filtered = books.filter(b => {
    const matchSearch = !search || b.title?.toLowerCase().includes(search.toLowerCase()) || b.author?.toLowerCase().includes(search.toLowerCase());
    const matchSubject = subjectFilter === "all" || b.subject === subjectFilter;
    const matchTag = !tagFilter || (b.tags || []).includes(tagFilter);
    return matchSearch && matchSubject && matchTag;
  });

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="font-heading text-3xl font-bold">Library</h1>
          <p className="text-muted-foreground mt-1">Browse and upload books to generate flashcards</p>
        </div>
        <Button onClick={() => setUploadOpen(true)} className="gap-2 px-6">
          <Plus className="w-4 h-4" /> Upload Book
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search books or authors..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={subjectFilter} onValueChange={setSubjectFilter}>
          <SelectTrigger className="w-48">
            <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Subject" />
          </SelectTrigger>
          <SelectContent>
            {SUBJECTS.map(s => (
              <SelectItem key={s} value={s}>
                {s === "all" ? "All Subjects" : s.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {allTags.length > 0 && (
          <Select value={tagFilter || "all"} onValueChange={v => setTagFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Tag" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tags</SelectItem>
              {allTags.map(tag => (
                <SelectItem key={tag} value={tag}>#{tag}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {Array(8).fill(0).map((_, i) => (
            <div key={i} className="bg-card rounded-2xl border border-border overflow-hidden animate-pulse">
              <div className="aspect-[4/3] bg-muted" />
              <div className="p-4 space-y-2">
                <div className="h-4 bg-muted rounded w-3/4" />
                <div className="h-3 bg-muted rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-20"
        >
          <BookOpen className="w-16 h-16 mx-auto text-muted-foreground/20 mb-4" />
          <h3 className="font-heading text-xl font-semibold text-muted-foreground mb-2">
            {books.length === 0 ? "No books yet" : "No books match your search"}
          </h3>
          <p className="text-muted-foreground mb-6">
            {books.length === 0 ? "Upload your first book to get started" : "Try adjusting your filters"}
          </p>
          {books.length === 0 && (
            <Button onClick={() => setUploadOpen(true)} className="gap-2">
              <Plus className="w-4 h-4" /> Upload Book
            </Button>
          )}
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filtered.map((book, i) => (
            <BookCard 
              key={book.id} 
              book={book} 
              index={i} 
              onDelete={() => queryClient.invalidateQueries({ queryKey: ["books"] })}
            />
          ))}
        </div>
      )}

      <UploadBookDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onBookCreated={() => queryClient.invalidateQueries({ queryKey: ["books"] })}
      />
    </div>
  );
}