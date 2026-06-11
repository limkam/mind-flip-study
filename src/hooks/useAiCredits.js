import { useQuery, useQueryClient } from '@tanstack/react-query';
import client from '@/api/client';

export function useAiCredits() {
  return useQuery({
    queryKey: ['ai-credits'],
    queryFn: async () => {
      const { data } = await client.get('/users/me/ai-credits');
      return data;
    },
    staleTime: 30_000,
  });
}

export function useInvalidateAiCredits() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['ai-credits'] });
}
