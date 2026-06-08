import client from "@/api/client";

/**
 * Walks paginated GET /books/ until has_more is false (same contract as quiz-results / leaderboard).
 */
export async function fetchAllBooksPages() {
  const items = [];
  let page = 1;
  const size = 100;
  for (;;) {
    const { data } = await client.get("/books/", { params: { page, size } });
    items.push(...(data.items ?? []));
    if (!data.has_more) break;
    page += 1;
    if (page > 500) break;
  }
  return items;
}
