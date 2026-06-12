import { api } from "../api/client";
import type { FlashcardSetOut, Paginated } from "../types/api";
import { normalizeList } from "./pagination";

export async function fetchFlashcardSetsList(): Promise<FlashcardSetOut[]> {
  const { data } = await api.get<FlashcardSetOut[] | Paginated<FlashcardSetOut>>("/flashcard-sets/", {
    params: { include_cards: false },
  });
  return normalizeList(data);
}

export async function deleteFlashcardSet(setId: string): Promise<void> {
  await api.delete(`/flashcard-sets/${setId}`);
}
