import { useContext } from 'react';
import { AuthContext } from '../context/auth-context';

const hmrFallback = {
  user: null,
  isLoading: true,
  isAuthenticated: false,
  authError: '',
  login: async () => {},
  logout: async () => {},
  refreshUser: async () => null,
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    // Brief gap while Vite swaps modules during HMR (dev only).
    if (import.meta.hot) return hmrFallback;
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
