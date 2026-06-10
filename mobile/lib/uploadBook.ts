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
  onProgress?: (phase: "uploading" | "extracting_toc" | "creating") => void;
};

/**
 * Presigned PUT to object storage, PDF-based TOC extraction, then create book row.
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
  const contentType = mimeType || "application/octet-stream";

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

  onProgress?.("extracting_toc");
  let chapters: TocChapter[] = [];
  try {
    const { data: toc } = await api.post<{ chapters: TocChapter[] }>("/books/extract-toc", {
      s3_key: presign.s3_key,
      title,
      author,
      description: description || undefined,
    });
    chapters = toc.chapters ?? [];
  } catch {
    chapters = [];
  }

  onProgress?.("creating");
  await api.post("/books/", {
    title,
    author,
    s3_key: presign.s3_key,
    file_size_bytes: size,
    extras: {
      table_of_contents: chapters,
      tags,
      subject,
      description,
    },
  });
}
