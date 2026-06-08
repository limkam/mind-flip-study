import React, { useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";

export default function TagInput({ tags = [], onChange, placeholder = "Add a tag..." }) {
  const [input, setInput] = useState("");

  const addTag = (raw) => {
    const tag = raw.trim().toLowerCase();
    if (!tag || tags.includes(tag)) return;
    onChange([...tags, tag]);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(input);
      setInput("");
    } else if (e.key === "Backspace" && !input && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  };

  const removeTag = (tag) => onChange(tags.filter(t => t !== tag));

  return (
    <div className="flex flex-wrap gap-1.5 p-2 border border-input rounded-md bg-transparent min-h-[40px] focus-within:ring-1 focus-within:ring-ring">
      {tags.map(tag => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs font-medium px-2 py-1 rounded-md"
        >
          {tag}
          <button type="button" onClick={() => removeTag(tag)} className="hover:text-destructive transition-colors">
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => { if (input.trim()) { addTag(input); setInput(""); } }}
        placeholder={tags.length === 0 ? placeholder : ""}
        className="flex-1 min-w-[100px] bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}