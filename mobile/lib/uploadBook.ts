import { api } from "../api/client";

export type TocChapter = {
  chapter_number?: number;
  title: string;
  subtopics?: string[];
};

export type UploadBookOptions = {
  title: string;
  author: string;
  uri: string;
  size: number;
  name: string;
  mimeType: string;
  description?: string;
  subject?: string;
  tags?: string[];
  onProgress?: (phase: "uploading" | "creating") => void;
};

/** Derive book title from file name (no PDF parsing). */
export function titleFromFilename(filename: string): string {
  const base = filename.replace(/\\/g, "/").split("/").pop() || "";
  const stem = base.replace(/\.pdf$/i, "").trim();
  if (!stem) return "";
  return stem.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Presigned PUT to object storage, then create book row.
 * TOC extraction is user-triggered from book detail.
 */
export async function uploadBookFromPicker(opts: UploadBookOptions): Promise<void> {
  const {
    title,
    author,
    uri,
    size,
    name,
    mimeType,
    description = "",
    subject = "other",
    tags = [],
    onProgress,
  } = opts;
  const contentType = mimeType || "application/pdf";

  onProgress?.("uploading");
  const { data: presign } = await api.post<{ upload_url: string; s3_key: string }>("/books/upload-url", {
    filename: name,
    content_type: contentType,
    file_size_bytes: size,
  });
  const body = await (await fetch(uri)).arrayBuffer();
  const putRes = await fetch(presign.upload_url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body,
  });
  if (!putRes.ok) {
    throw new Error(`Storage upload failed (${putRes.status})`);
  }

  onProgress?.("creating");
  await api.post("/books/", {
    title: title.trim(),
    author: author.trim(),
    s3_key: presign.s3_key,
    file_size_bytes: size,
    extras: {
      table_of_contents: [],
      tags,
      subject,
      description,
    },
  });
}
