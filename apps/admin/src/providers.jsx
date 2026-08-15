import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthProvider';

const retryTransientFailure = (failureCount, error) => {
  const status = error?.response?.status;
  if ([401, 403, 404].includes(status)) return false;
  return failureCount < 2;
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: retryTransientFailure,
      retryDelay: (attempt) => Math.min(500 * (2 ** attempt), 2000),
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      staleTime: 30_000,
    },
  },
});

export function AppProviders({ children }) {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>{children}</AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
