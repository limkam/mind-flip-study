/** SHA-256 hex digest of a local file URI (for duplicate PDF detection). */
export async function sha256FileUri(uri: string): Promise<string> {
  const buffer = await fetch(uri).then((r) => r.arrayBuffer());
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("SHA-256 is not available on this device");
  }
  const hashBuffer = await subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
