import { api } from "../api/client";

export type TocChapter = {
  chapter_number?: number;
  title: string;
  subtopics?: string[];
};

export type DetectMetadataResult = {
  title: string;
  author: string;
  title_detected: boolean;
  author_detected: boolean;
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
  onProgress?: (phase: "detecting" | "uploading" | "creating") => void;
};

/** Detect title/author from a local PDF before upload. */
export async function detectPdfMetadataFromUri(
  uri: string,
  name: string,
): Promise<DetectMetadataResult> {
  const form = new FormData();
  form.append("file", {
    uri,
    name: name || "upload.pdf",
    type: "application/pdf",
  } as unknown as Blob);
  const { data } = await api.post<DetectMetadataResult>("/books/detect-metadata", form);
  return data;
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
