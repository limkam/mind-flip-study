import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import client, { clearAccessToken, getAccessToken, setAccessToken } from '@/api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const loadUserSeq = useRef(0);

  const loadUser = useCallback(async () => {
    const seq = ++loadUserSeq.current;
    setIsLoading(true);
    try {
      // Restore session after refresh/HMR: cookie refresh or persisted access token.
      if (!getAccessToken()) {
        try {
          const { data } = await client.post('/auth/refresh');
          setAccessToken(data.access_token);
        } catch {
          /* no refresh cookie — not signed in */
        }
      }
      const { data } = await client.get('/users/me');
      if (seq !== loadUserSeq.current) return;
      setUser(data);
    } catch {
      if (seq !== loadUserSeq.current) return;
      clearAccessToken();
      setUser(null);
    } finally {
      if (seq === loadUserSeq.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const login = useCallback(async (email, password) => {
    loadUserSeq.current += 1;
    setIsLoading(false);
    const { data } = await client.post('/auth/login', {
      email: email.trim().toLowerCase(),
      password,
    });
    setAccessToken(data.access_token);
    setUser(data.user);
    return data.user;
  }, []);

  const loginWithGoogle = useCallback(async (idToken) => {
    loadUserSeq.current += 1;
    setIsLoading(false);
    const { data } = await client.post('/auth/google', { id_token: idToken });
    setAccessToken(data.access_token);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    loadUserSeq.current += 1;
    try {
      await client.post('/auth/logout');
    } finally {
      clearAccessToken();
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      isLoading,
      isAuthenticated: !!user,
      login,
      loginWithGoogle,
      logout,
      refreshUser: loadUser,
    }),
    [user, isLoading, login, loginWithGoogle, logout, loadUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
