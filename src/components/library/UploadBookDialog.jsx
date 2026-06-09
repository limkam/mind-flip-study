import React, { useState } from "react";
import axios from "axios";
import client from "@/api/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Loader2, Sparkles } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import TagInput from "@/components/common/TagInput";
import UpgradeSection from "@/components/billing/UpgradeSection";
import { getApiErrorMessage } from "@/lib/apiError";
import { getUpgradeRequiredMessage, isUpgradeRequiredError } from "@/lib/billing";

const SUBJECTS = [
  "mathematics", "science", "history", "literature", "technology",
  "business", "arts", "languages", "philosophy", "other"
];

export default function UploadBookDialog({ open, onOpenChange, onBookCreated }) {
  const [form, setForm] = useState({ title: "", author: "", description: "", subject: "other", tags: [] });
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [upgradeRequired, setUpgradeRequired] = useState(false);
  const { toast } = useToast();

  const handleUpload = async () => {
    if (!form.title || !form.author) {
      toast({ title: "Please fill in title and author", variant: "destructive" });
      return;
    }

    setUpgradeRequired(false);
    setUploading(true);
    let toc = [];

    try {
      if (file) {
        setExtracting(true);
        const contentType = file.type || "application/octet-stream";
        const { data: presign } = await client.post("/books/upload-url", {
          filename: file.name,
          content_type: contentType,
          file_size_bytes: file.size,
        });
        try {
          await axios.put(presign.upload_url, file, {
            headers: { "Content-Type": contentType },
          });
        } catch (uploadError) {
          const isCorsOrNetwork =
            !uploadError.response &&
            (uploadError.code === "ERR_NETWORK" || uploadError.message === "Network Error");
          throw new Error(
            isCorsOrNetwork
              ? "File storage upload was blocked (usually S3 CORS). Run: cd services/api && .venv/bin/python scripts/apply_s3_cors.py"
              : uploadError.response
                ? `File storage upload failed (${uploadError.response.status})`
                : uploadError.message || "File storage upload failed",
          );
        }
        setExtracting(false);

        let chapters = [];
        try {
          const { data: tocResult } = await client.post("/ai/invoke", {
            prompt: `Extract the table of contents from the book titled "${form.title}" by ${form.author}. ${form.description ? `Description: ${form.description}` : ""}
Return JSON: {"chapters":[{"chapter_number":1,"title":"...","subtopics":["..."]}]}. If unknown, infer reasonable chapters.`,
            response_json_schema: {
              type: "object",
              properties: {
                chapters: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      chapter_number: { type: "number" },
                      title: { type: "string" },
                      subtopics: { type: "array", items: { type: "string" } }
                    }
                  }
                }
              }
            },
          });
          chapters = tocResult.chapters || [];
        } catch {
          chapters = [];
        }
        toc = chapters;

        const { data: book } = await client.post("/books/", {
          title: form.title,
          author: form.author,
          s3_key: presign.s3_key,
          file_size_bytes: file.size,
          extras: {
            table_of_contents: toc,
            tags: form.tags,
            description: form.description,
            subject: form.subject,
          },
        });
        setUploading(false);
        setForm({ title: "", author: "", description: "", subject: "other", tags: [] });
        setFile(null);
        onOpenChange(false);
        onBookCreated?.(book);
        toast({ title: "Book uploaded successfully!" });
        try {
          const { data: celery } = await client.get("/health/celery");
          if (celery?.status !== "ok") {
            toast({
              title: "Flashcard generation may be delayed",
              description:
                "Book uploaded. Note: flashcard generation is currently delayed — the system queue is not running. Contact your administrator.",
              variant: "destructive",
            });
          }
        } catch {
          /* ignore health check failure */
        }
        return;
      }

      toast({ title: "Please choose a PDF or file to upload", variant: "destructive" });
    } catch (e) {
      if (isUpgradeRequiredError(e)) {
        setUpgradeRequired(true);
        toast({
          title: "Upgrade required",
          description: getUpgradeRequiredMessage(e),
          variant: "destructive",
        });
      } else {
        toast({
          title: "Upload failed",
          description: getApiErrorMessage(e, e.message),
          variant: "destructive",
        });
      }
    } finally {
      setUploading(false);
      setExtracting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">Upload a New Book</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2 overflow-y-auto pr-1">
          {upgradeRequired ? (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
              <p className="mb-3 text-sm font-medium">You&apos;ve reached the free plan upload limit.</p>
              <UpgradeSection subscriptionTier="free" compact />
            </div>
          ) : null}
          <div className="space-y-2">
            <Label>Title *</Label>
            <Input
              placeholder="e.g. Introduction to Psychology"
              value={form.title}
              onChange={e => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Author *</Label>
            <Input
              placeholder="e.g. James Clear"
              value={form.author}
              onChange={e => setForm({ ...form, author: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Subject</Label>
            <Select value={form.subject} onValueChange={v => setForm({ ...form, subject: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SUBJECTS.map(s => (
                  <SelectItem key={s} value={s}>
                    {s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Tags</Label>
            <TagInput
              tags={form.tags}
              onChange={tags => setForm({ ...form, tags })}
              placeholder="Add tags (press Enter)..."
            />
            <p className="text-xs text-muted-foreground">e.g. exam-prep, chapter-1, difficult</p>
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              placeholder="Brief description of the book..."
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label>Upload File (PDF, EPUB, etc.)</Label>
            <div className="border-2 border-dashed border-border rounded-xl p-6 text-center hover:border-primary/50 transition-colors cursor-pointer"
              onClick={() => document.getElementById("book-upload").click()}
            >
              <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                {file ? file.name : "Click to upload or drag and drop"}
              </p>
              <input
                id="book-upload"
                type="file"
                className="hidden"
                accept=".pdf,.epub,.txt,.docx"
                onChange={e => setFile(e.target.files[0])}
              />
            </div>
          </div>
          <Button
            onClick={handleUpload}
            disabled={uploading}
            className="w-full h-12 text-base font-semibold"
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {extracting ? "Extracting Table of Contents..." : "Uploading..."}
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Upload & Extract TOC
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
