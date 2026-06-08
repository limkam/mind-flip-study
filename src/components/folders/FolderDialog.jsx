import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const COLORS = ["violet", "rose", "blue", "green", "amber", "orange"];
const COLOR_STYLES = {
  violet: "bg-violet-500",
  rose: "bg-rose-500",
  blue: "bg-blue-500",
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  orange: "bg-orange-500",
};
const ICONS = ["📁", "📚", "🎓", "⭐", "🔬", "🎨", "🌍", "💡", "🏆", "📝"];

export default function FolderDialog({ open, onOpenChange, folder, onSave }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("violet");
  const [icon, setIcon] = useState("📁");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (folder) {
      setName(folder.name || "");
      setDescription(folder.description || "");
      setColor(folder.color || "violet");
      setIcon(folder.icon || "📁");
    } else {
      setName(""); setDescription(""); setColor("violet"); setIcon("📁");
    }
  }, [folder, open]);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await onSave({ name: name.trim(), description: description.trim(), color, icon });
    setSaving(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">{folder ? "Edit Folder" : "New Folder"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input placeholder="e.g. Science Class" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Description (optional)</Label>
            <Textarea placeholder="What's in this folder?" value={description} onChange={e => setDescription(e.target.value)} rows={2} />
          </div>
          <div className="space-y-2">
            <Label>Icon</Label>
            <div className="flex gap-2 flex-wrap">
              {ICONS.map(ic => (
                <button
                  key={ic}
                  onClick={() => setIcon(ic)}
                  className={`text-xl p-2 rounded-lg transition-all ${icon === ic ? "bg-primary/20 ring-2 ring-primary scale-110" : "hover:bg-muted"}`}
                >
                  {ic}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex gap-2">
              {COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full ${COLOR_STYLES[c]} transition-all ${color === c ? "ring-2 ring-offset-2 ring-primary scale-110" : "opacity-70 hover:opacity-100"}`}
                />
              ))}
            </div>
          </div>
          <Button onClick={handleSave} disabled={saving || !name.trim()} className="w-full">
            {saving ? "Saving..." : folder ? "Save Changes" : "Create Folder"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}