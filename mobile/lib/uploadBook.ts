import { api } from "../api/client";

/**
 * Presigned PUT to object storage (never proxy PDF bytes through FastAPI).
 */
export async function uploadBookFromPicker(opts: {
  title: string;
  author: string;
  uri: string;
  size: number;
  name: string;
  mimeType: string;
}): Promise<void> {
  const { title, author, uri, size, name, mimeType } = opts;
  const contentType = mimeType || "application/octet-stream";
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
  await api.post("/books/", {
    title,
    author,
    s3_key: presign.s3_key,
    file_size_bytes: size,
    extras: {
      tags: [],
      subject: "other",
      description: "",
    },
  });
}
