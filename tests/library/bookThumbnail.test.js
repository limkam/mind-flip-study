import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("src/components/library/BookThumbnail.jsx", "utf8");
const card = fs.readFileSync("src/components/library/BookCard.jsx", "utf8");

test("web book cards fetch protected thumbnails as blobs with graceful states", () => {
  assert.match(card, /<BookThumbnail book=\{book\}/);
  assert.match(source, /client\.get\(book\.thumbnail_url, \{ responseType: "blob"/);
  assert.match(source, /URL\.revokeObjectURL/);
  assert.match(source, /Generating document preview/);
  assert.match(source, /<FallbackIcon \/>/);
});
