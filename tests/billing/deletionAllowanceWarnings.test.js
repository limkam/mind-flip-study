import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("web deletion confirmations disclose that allowance is not restored", () => {
  const book = source("src/pages/BookDetail.jsx");
  const sets = source("src/pages/FlashcardSets.jsx");

  assert.match(book, /Delete this book\?/);
  assert.match(book, /will not restore the upload allowance/);
  assert.match(book, /<AlertDialogCancel>Cancel<\/AlertDialogCancel>/);
  assert.match(book, />\s*Delete Book\s*</);

  assert.match(sets, /Delete these flashcards\?/);
  assert.match(sets, /will not restore the generation allowance/);
  assert.match(sets, /<AlertDialogCancel>Cancel<\/AlertDialogCancel>/);
  assert.match(sets, />\s*Delete Flashcards\s*</);
});

test("mobile deletion confirmations disclose that allowance is not restored", () => {
  const book = source("mobile/app/book/[id].tsx");
  const sets = source("mobile/app/(tabs)/flashcards.tsx");

  assert.match(book, /Delete this book\?/);
  assert.match(book, /will not restore the upload allowance/);
  assert.match(book, /text: "Cancel", style: "cancel"/);
  assert.match(book, /text: "Delete Book"/);

  assert.match(sets, /Delete these flashcards\?/);
  assert.match(sets, /will not restore the generation allowance/);
  assert.match(sets, /text: "Cancel", style: "cancel"/);
  assert.match(sets, /text: "Delete Flashcards"/);
});
