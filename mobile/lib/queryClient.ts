import { QueryClient } from "@tanstack/react-query";

export const mobileQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      retry: 1,
    },
  },
});

export function clearMobileQueryCache() {
  mobileQueryClient.clear();
}
