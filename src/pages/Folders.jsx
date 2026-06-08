import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import client from "@/api/client";
import { motion } from "framer-motion";
import { Plus, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import FolderCard from "@/components/folders/FolderCard";
import FolderDialog from "@/components/folders/FolderDialog";
import FolderDetailDialog from "@/components/folders/FolderDetailDialog";
import { useToast } from "@/components/ui/use-toast";
import { fetchAllBooksPages } from "@/lib/fetchAllBooksPages";

export default function Folders() {
  const [createOpen, setCreateOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState(null);
  const [viewingFolder, setViewingFolder] = useState(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: folders = [] } = useQuery({
    queryKey: ["folders"],
    queryFn: async () => {
      const { data } = await client.get("/folders/");
      return data;
    },
  });

  const { data: books = [] } = useQuery({
    queryKey: ["books"],
    queryFn: () => fetchAllBooksPages(),
  });

  const { data: flashcardSets = [] } = useQuery({
    queryKey: ["flashcard-sets"],
    queryFn: async () => {
      const { data } = await client.get("/flashcard-sets/", { params: { include_cards: false } });
      return data;
    },
  });

  const handleCreate = async (data) => {
    await client.post("/folders/", {
      name: data.name,
      parent_id: data.parent_id ?? null,
      description: data.description || null,
      color: data.color || null,
      icon: data.icon || null,
    });
    queryClient.invalidateQueries({ queryKey: ["folders"] });
    toast({ title: "Folder created!" });
  };

  const handleEdit = async (data) => {
    await client.patch(`/folders/${editingFolder.id}`, {
      name: data.name,
      parent_id: data.parent_id ?? null,
      description: data.description || null,
      color: data.color || null,
      icon: data.icon || null,
    });
    queryClient.invalidateQueries({ queryKey: ["folders"] });
    // Refresh viewingFolder if it's open
    if (viewingFolder?.id === editingFolder.id) {
      setViewingFolder(prev => ({ ...prev, ...data }));
    }
    toast({ title: "Folder updated!" });
  };

  const handleDelete = async (folder) => {
    await client.delete(`/folders/${folder.id}`);
    queryClient.invalidateQueries({ queryKey: ["folders"] });
    if (viewingFolder?.id === folder.id) setViewingFolder(null);
    toast({ title: "Folder deleted" });
  };

  const handleUpdate = async (folderId, data) => {
    await client.patch(`/folders/${folderId}`, data);
    queryClient.invalidateQueries({ queryKey: ["folders"] });
    setViewingFolder(prev => (prev && prev.id === folderId ? { ...prev, ...data } : prev));
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-heading text-3xl font-bold">Collections</h1>
          <p className="text-muted-foreground mt-1">Organize your books and flashcard sets into folders</p>
        </div>
        <Button onClick={() => { setEditingFolder(null); setCreateOpen(true); }} className="gap-2">
          <Plus className="w-4 h-4" /> New Folder
        </Button>
      </div>

      {folders.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-24 bg-card rounded-2xl border border-border"
        >
          <FolderOpen className="w-16 h-16 mx-auto text-muted-foreground/20 mb-4" />
          <h3 className="font-heading text-xl font-semibold mb-2">No folders yet</h3>
          <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
            Create folders to group your books and flashcard sets for easier navigation.
          </p>
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Create your first folder
          </Button>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {folders.map((folder, i) => (
            <motion.div
              key={folder.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <FolderCard
                folder={folder}
                onClick={() => setViewingFolder(folder)}
                onEdit={(f) => { setEditingFolder(f); setCreateOpen(true); }}
                onDelete={handleDelete}
              />
            </motion.div>
          ))}
        </div>
      )}

      {/* Create / Edit dialog */}
      <FolderDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        folder={editingFolder}
        onSave={editingFolder ? handleEdit : handleCreate}
      />

      {/* View folder contents */}
      <FolderDetailDialog
        open={!!viewingFolder}
        onOpenChange={(o) => !o && setViewingFolder(null)}
        folder={viewingFolder}
        books={books}
        flashcardSets={flashcardSets}
        onUpdate={handleUpdate}
      />
    </div>
  );
}