import { useQuery } from '@tanstack/react-query';
import client from '../api/client';

function errorMessage(error) {
  const status = error?.response?.status;
  const detail = error?.response?.data?.detail;
  if (status === 404) {
    return 'Analytics API not found. Rebuild the API container (docker compose build api).';
  }
  if (typeof detail === 'string') return detail;
  if (status) return `Request failed (${status}).`;
  return error?.message || 'Request failed.';
}

export function useAdminDashboard(endpoint, queryKey) {
  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const { data } = await client.get(endpoint);
      return data;
    },
    retry: 1,
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    errorMessage: query.isError ? errorMessage(query.error) : null,
    lastUpdated: query.data?.updated_at,
    refresh: () => query.refetch(),
  };
}
