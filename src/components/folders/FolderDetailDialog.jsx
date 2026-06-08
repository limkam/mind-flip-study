import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { BookOpen, GraduationCap, Link } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function FolderDetailDialog({ open, onOpenChange, folder, books, flashcardSets, onUpdate }) {
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  if (!folder) return null;

  const bookIds = folder.book_ids || [];
  const setIds = folder.flashcard_set_ids || [];

  const toggleBook = async (id) => {
    const next = bookIds.includes(id) ? bookIds.filter(x => x !== id) : [...bookIds, id];
    setSaving(true);
    await onUpdate(folder.id, { book_ids: next });
    setSaving(false);
  };

  const toggleSet = async (id) => {
    const next = setIds.includes(id) ? setIds.filter(x => x !== id) : [...setIds, id];
    setSaving(true);
    await onUpdate(folder.id, { flashcard_set_ids: next });
    setSaving(false);
  };

  const folderBooks = books.filter(b => bookIds.includes(b.id));
  const folderSets = flashcardSets.filter(s => setIds.includes(s.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <span className="text-2xl">{folder.icon}</span> {folder.name}
          </DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="contents" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="contents">Contents</TabsTrigger>
            <TabsTrigger value="manage">Manage Items</TabsTrigger>
          </TabsList>

          {/* CONTENTS */}
          <TabsContent value="contents" className="flex-1 overflow-y-auto mt-3 space-y-2 pr-1">
            {folderBooks.length === 0 && folderSets.length === 0 && (
              <p className="text-center text-muted-foreground py-8 text-sm">No items yet. Go to "Manage Items" to add books or flashcard sets.</p>
            )}
            {folderBooks.map(b => (
              <div key={b.id} className="flex items-center gap-3 p-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors group">
                <BookOpen className="w-4 h-4 text-primary flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{b.title}</p>
                  <p className="text-xs text-muted-foreground">{b.author}</p>
                </div>
                <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 text-xs" onClick={() => { onOpenChange(false); navigate(`/book/${b.id}`); }}>
                  Open
                </Button>
              </div>
            ))}
            {folderSets.map(s => (
              <div key={s.id} className="flex items-center gap-3 p-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors group">
                <GraduationCap className="w-4 h-4 text-accent flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{s.title}</p>
                  <p className="text-xs text-muted-foreground">{s.card_count} cards</p>
                </div>
                <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 text-xs" onClick={() => { onOpenChange(false); navigate(`/study/${s.id}`); }}>
                  Study
                </Button>
              </div>
            ))}
          </TabsContent>

          {/* MANAGE */}
          <TabsContent value="manage" className="flex-1 overflow-y-auto mt-3 space-y-4 pr-1">
            {books.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Books</p>
                <div className="space-y-1.5">
                  {books.map(b => (
                    <label key={b.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors
                      ${bookIds.includes(b.id) ? "border-primary/30 bg-primary/5" : "border-border hover:bg-muted/40"}`}>
                      <Checkbox checked={bookIds.includes(b.id)} onCheckedChange={() => toggleBook(b.id)} disabled={saving} />
                      <BookOpen className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <span className="text-sm font-medium truncate">{b.title}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            {flashcardSets.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Flashcard Sets</p>
                <div className="space-y-1.5">
                  {flashcardSets.map(s => (
                    <label key={s.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors
                      ${setIds.includes(s.id) ? "border-primary/30 bg-primary/5" : "border-border hover:bg-muted/40"}`}>
                      <Checkbox checked={setIds.includes(s.id)} onCheckedChange={() => toggleSet(s.id)} disabled={saving} />
                      <GraduationCap className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <span className="text-sm font-medium truncate">{s.title}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}