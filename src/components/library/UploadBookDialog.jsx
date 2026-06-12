import React, { useState, useCallback } from "react";
import axios from "axios";
import client from "@/api/client";
import { detectPdfMetadata } from "@/lib/bookUpload";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Loader2, Sparkles, AlertCircle, CheckCircle2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import TagInput from "@/components/common/TagInput";
import UpgradeSection from "@/components/billing/UpgradeSection";
import { getApiErrorMessage } from "@/lib/apiError";
import { getUpgradeRequiredMessage, isUpgradeRequiredError } from "@/lib/billing";

const SUBJECTS = [
  "mathematics", "science", "history", "literature", "technology",
  "business", "arts", "languages", "philosophy", "other"
];

const UPLOAD_PHASE_LABELS = {
  detecting: "Detecting title and author…",
  uploading: "Uploading PDF…",
  saving: "Saving book…",
};

export default function UploadBookDialog({ open, onOpenChange, onBookCreated }) {
  const [form, setForm] = useState({ title: "", author: "", description: "", subject: "other", tags: [] });
  const [file, setFile] = useState(null);
  const [phase, setPhase] = useState(null);
  const [detecting, setDetecting] = useState(false);
  const [detection, setDetection] = useState(null);
  const [upgradeRequired, setUpgradeRequired] = useState(false);
  const { toast } = useToast();

  const resetForm = () => {
    setForm({ title: "", author: "", description: "", subject: "other", tags: [] });
    setFile(null);
    setPhase(null);
    setDetecting(false);
    setDetection(null);
  };

  const handleFileSelect = useCallback(async (selectedFile) => {
    if (!selectedFile) return;
    setFile(selectedFile);
    setDetection(null);
    setForm(prev => ({ ...prev, title: "", author: "" }));

    if (!selectedFile.name?.toLowerCase().endsWith(".pdf")) {
      setDetection({ partial: true, message: "Enter the title and author manually for non-PDF files." });
      return;
    }

    setDetecting(true);
    try {
      const meta = await detectPdfMetadata(selectedFile);
      const title = (meta.title || "").trim();
      const author = (meta.author || "").trim();
      setForm(prev => ({ ...prev, title, author }));
      setDetection({
        titleDetected: meta.title_detected,
        authorDetected: meta.author_detected,
        bothDetected: meta.title_detected && meta.author_detected,
        partial: !meta.title_detected || !meta.author_detected,
      });
      if (!title && !author) {
        toast({
          title: "Metadata not found in PDF",
          description: "This file has no embedded title or author. Please enter them manually.",
        });
      }
    } catch (err) {
      setDetection({
        partial: true,
        message: getApiErrorMessage(err, "Could not read metadata from this PDF. Please enter title and author manually."),
      });
      toast({
        title: "Auto-detection failed",
        description: getApiErrorMessage(err, "Please enter title and author manually."),
        variant: "destructive",
      });
    } finally {
      setDetecting(false);
    }
  }, [toast]);

  const canUpload =
    file &&
    form.title.trim().length > 0 &&
    form.author.trim().length > 0 &&
    !detecting &&
    !phase;

  const handleUpload = async () => {
    if (!file) {
      toast({ title: "Please choose a PDF file", variant: "destructive" });
      return;
    }
    if (!form.title.trim() || !form.author.trim()) {
      toast({
        title: "Title and author required",
        description: "Please fill in both fields before uploading.",
        variant: "destructive",
      });
      return;
    }

    setUpgradeRequired(false);
    setPhase("uploading");

    try {
      const contentType = file.type || "application/pdf";
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

      setPhase("saving");
      const { data: book } = await client.post("/books/", {
        title: form.title.trim(),
        author: form.author.trim(),
        s3_key: presign.s3_key,
        file_size_bytes: file.size,
        extras: {
          table_of_contents: [],
          tags: form.tags,
          description: form.description,
          subject: form.subject,
        },
      });

      resetForm();
      onOpenChange(false);
      onBookCreated?.(book);
      toast({
        title: "Book uploaded!",
        description: "Open the book to extract its table of contents when you're ready.",
      });
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
      setPhase(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
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

          {/* 1. Upload file — primary action at top */}
          <div className="space-y-2">
            <Label className="text-base font-semibold">Upload PDF</Label>
            <div
              className="border-2 border-dashed border-primary/30 rounded-xl p-6 text-center hover:border-primary/60 transition-colors cursor-pointer bg-primary/5"
              onClick={() => !detecting && !phase && document.getElementById("book-upload").click()}
            >
              {detecting ? (
                <>
                  <Loader2 className="w-8 h-8 mx-auto text-primary mb-2 animate-spin" />
                  <p className="text-sm font-medium text-primary">Detecting title and author…</p>
                </>
              ) : (
                <>
                  <Upload className="w-8 h-8 mx-auto text-primary mb-2" />
                  <p className="text-sm font-medium">
                    {file ? file.name : "Click to select your PDF"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Title and author are detected automatically when possible
                  </p>
                </>
              )}
              <input
                id="book-upload"
                type="file"
                className="hidden"
                accept=".pdf,application/pdf"
                onChange={e => handleFileSelect(e.target.files?.[0])}
                disabled={!!phase || detecting}
              />
            </div>
          </div>

          {/* Detection feedback */}
          {detection?.bothDetected && (
            <div className="flex items-start gap-2 rounded-lg border border-green-500/30 bg-green-500/5 p-3 text-sm">
              <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
              <span>Title and author detected from your PDF. Review below, then upload.</span>
            </div>
          )}
          {detection?.partial && !detecting && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
              <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <span>
                {detection.message ||
                  "We couldn't detect all metadata. Please enter the missing title and author below."}
              </span>
            </div>
          )}

          {/* 2. Required metadata */}
          <div className="space-y-2">
            <Label>Title *</Label>
            <Input
              placeholder="e.g. Introduction to Psychology"
              value={form.title}
              onChange={e => setForm({ ...form, title: e.target.value })}
              disabled={!!phase}
            />
          </div>
          <div className="space-y-2">
            <Label>Author *</Label>
            <Input
              placeholder="e.g. James Clear"
              value={form.author}
              onChange={e => setForm({ ...form, author: e.target.value })}
              disabled={!!phase}
            />
          </div>

          {/* Optional fields */}
          <div className="space-y-2">
            <Label>Subject</Label>
            <Select value={form.subject} onValueChange={v => setForm({ ...form, subject: v })} disabled={!!phase}>
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
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              placeholder="Brief description of the book..."
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              rows={2}
              disabled={!!phase}
            />
          </div>

          {/* Upload status */}
          {phase && (
            <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
              <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
              <span>{UPLOAD_PHASE_LABELS[phase]}</span>
            </div>
          )}

          <Button
            onClick={handleUpload}
            disabled={!canUpload}
            className="w-full h-12 text-base font-semibold"
          >
            {phase ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {UPLOAD_PHASE_LABELS[phase]}
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Upload Book
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
