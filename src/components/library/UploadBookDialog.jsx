import React, { useState, useCallback } from "react";
import axios from "axios";
import client from "@/api/client";
import { titleFromFilename } from "@/lib/bookUpload";
import { sha256File } from "@/lib/fileHash";
import { formatFileSize, estimatePageCount } from "@/lib/formatFileSize";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Loader2, Sparkles, AlertCircle, ArrowRight, BookOpen, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/components/ui/use-toast";
import TagInput from "@/components/common/TagInput";
import { getApiErrorMessage } from "@/lib/apiError";
import { isUpgradeRequiredError } from "@/lib/billing";

const SUBJECTS = [
  "mathematics", "science", "history", "literature", "technology",
  "business", "arts", "languages", "philosophy", "other"
];

const UPLOAD_PHASE_LABELS = {
  uploading: "Uploading…",
  saving: "Saving…",
};

export default function UploadBookDialog({ open, onOpenChange, onBookCreated }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ title: "", author: "", description: "", subject: "other", tags: [] });
  const [file, setFile] = useState(null);
  const [phase, setPhase] = useState(null);
  const [titleHint, setTitleHint] = useState(null);
  const [upgradeRequired, setUpgradeRequired] = useState(false);
  const { toast } = useToast();

  const resetForm = () => {
    setForm({ title: "", author: "", description: "", subject: "other", tags: [] });
    setFile(null);
    setPhase(null);
    setTitleHint(null);
    setUpgradeRequired(false);
  };

  const viewPlans = () => {
    resetForm();
    onOpenChange(false);
    navigate("/pricing");
  };

  const closeDialog = () => {
    resetForm();
    onOpenChange(false);
  };

  const MAX_SIZE_BYTES = 20 * 1024 * 1024;
  const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".pptx"];

  const handleFileSelect = useCallback((selectedFile) => {
    if (!selectedFile) return;
    const name = selectedFile.name || "";
    const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      toast({
        title: "Unsupported document format",
        description: "Please upload a PDF (.pdf), Word (.docx), or PowerPoint (.pptx) file.",
        variant: "destructive",
      });
      return;
    }
    if (selectedFile.size > MAX_SIZE_BYTES) {
      toast({
        title: "File too large",
        description: "The selected file exceeds the 20 MB upload limit. Please upload a smaller document.",
        variant: "destructive",
      });
      return;
    }
    setFile(selectedFile);
    const title = titleFromFilename(selectedFile.name || "");
    setForm(prev => ({ ...prev, title, author: "" }));
    if (title) {
      setTitleHint("Title filled from file name. Enter the author below.");
    } else {
      setTitleHint("Enter the title and author manually.");
    }
  }, [toast]);

  const canUpload =
    file &&
    form.title.trim().length > 0 &&
    form.author.trim().length > 0 &&
    !phase;

  const createBook = async (payload) => {
    if (!payload) return;
    setPhase("saving");
    try {
      const { data: book } = await client.post("/books/", payload);
      resetForm();
      onOpenChange(false);
      onBookCreated?.(book);
      toast({
        title: "Book uploaded!",
        description: "Extracting the table of contents in the background…",
      });
    } catch (e) {
      if (e.response?.status === 409) {
        toast({
          title: "Book already in library",
          description: getApiErrorMessage(e, "This document is already in your library."),
          variant: "destructive",
        });
      } else if (isUpgradeRequiredError(e)) {
        return;
      } else {
        toast({ title: "Upload failed", description: getApiErrorMessage(e, e.message), variant: "destructive" });
      }
    } finally {
      setPhase(null);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast({ title: "Please choose a document file", variant: "destructive" });
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      toast({
        title: "File too large",
        description: "The selected file exceeds the 20 MB upload limit. Please upload a smaller document.",
        variant: "destructive",
      });
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

    try {
      setPhase("uploading");
      const fileHash = await sha256File(file);
      const { data: dupCheck } = await client.get("/books/check-duplicate", {
        params: {
          title: form.title.trim(),
          file_sha256: fileHash,
          file_size_bytes: file.size,
        },
      });

      if (dupCheck.is_duplicate) {
        const match = dupCheck.matches?.[0];
        const reason =
          match?.match_reason === "file"
            ? "This exact document is already in your library."
            : "A book with this title already exists.";
        toast({
          title: "Duplicate book",
          description: match
            ? `${reason} Open "${match.title}" by ${match.author} instead.`
            : reason,
          variant: "destructive",
        });
        setPhase(null);
        return;
      }

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

      const createPayload = {
        operation_id: globalThis.crypto.randomUUID(),
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
      };

      await createBook(createPayload);
    } catch (e) {
      if (isUpgradeRequiredError(e)) {
        return;
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
        {upgradeRequired ? (
          <div className="px-1 py-3 sm:px-3 sm:py-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <BookOpen className="h-6 w-6" />
            </div>
            <DialogHeader className="mt-5 text-left">
              <DialogTitle className="font-heading text-2xl">Your library is ready to grow</DialogTitle>
            </DialogHeader>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              You have used the book import included with the Free plan. Upgrade to add this PDF and keep building your study library.
            </p>

            <div className="my-6 border-y border-border py-4">
              {[
                "More book imports every month",
                "Larger flashcard sets",
                "Unlimited daily review on paid plans",
              ].map((benefit) => (
                <div key={benefit} className="flex items-center gap-3 py-1.5 text-sm">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                  <span>{benefit}</span>
                </div>
              ))}
            </div>

            <Button className="h-11 w-full" onClick={viewPlans}>
              Compare plans
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button className="mt-2 h-10 w-full" variant="ghost" onClick={closeDialog}>
              Not now
            </Button>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Paid plans start at $3.99/month. Cancel anytime.
            </p>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-heading text-xl">Upload a New Book</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2 overflow-y-auto pr-1">

          <div className="space-y-2">
            <Label className="text-base font-semibold">Upload Document (PDF, Word, or PowerPoint — max 20MB)</Label>
            <div
              className="border-2 border-dashed border-primary/30 rounded-xl p-6 text-center hover:border-primary/60 transition-colors cursor-pointer bg-primary/5"
              onClick={() => !phase && document.getElementById("book-upload").click()}
            >
              <Upload className="w-8 h-8 mx-auto text-primary mb-2" />
              <p className="text-sm font-medium">
                {file ? file.name : "Click to select your document (.pdf, .docx, .pptx)"}
              </p>
              {file && (
                <p className="text-xs text-muted-foreground mt-1 font-medium">
                  {formatFileSize(file.size)}
                  {estimatePageCount(file.size) && ` • ~${estimatePageCount(file.size)} pages`}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                Title is taken from the file name; enter the author manually
              </p>
              <input
                id="book-upload"
                type="file"
                className="hidden"
                accept=".pdf,.docx,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                onChange={e => handleFileSelect(e.target.files?.[0])}
                disabled={!!phase}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              By uploading, you confirm you have the right to use this material for personal study. Only upload
              content you own or are permitted to use.
            </p>
          </div>

          {titleHint && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
              <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <span>{titleHint}</span>
            </div>
          )}

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
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
