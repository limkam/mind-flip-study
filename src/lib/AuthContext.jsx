import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import client, {
  clearAccessToken,
  getAccessToken,
  getRememberMe,
  setAccessToken,
  setRememberMe,
} from '@/api/client';
import { activateCoreDataCache, deactivateCoreDataCache } from '@/lib/coreDataCache';
import { queryClientInstance } from '@/lib/query-client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const loadUserSeq = useRef(0);

  const loadUser = useCallback(async () => {
    const seq = ++loadUserSeq.current;
    setIsLoading(true);
    try {
      if (!getAccessToken()) {
        if (getRememberMe()) {
          try {
            const { data } = await client.post('/auth/refresh');
            setAccessToken(data.access_token);
          } catch {
            /* no refresh cookie — not signed in */
            setRememberMe(false);
          }
        }
      }
      if (!getAccessToken()) {
        if (seq !== loadUserSeq.current) return;
        setUser(null);
        return;
      }
      const { data } = await client.get('/users/me');
      if (seq !== loadUserSeq.current) return;
      activateCoreDataCache(data.id);
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

  const loginWithEmailCode = useCallback(async (challengeId, code, rememberMe = true) => {
    loadUserSeq.current += 1;
    setIsLoading(false);
    setRememberMe(rememberMe);
    const { data } = await client.post('/auth/email/verify', {
      challenge_id: challengeId,
      code,
      remember_me: rememberMe,
    });
    setAccessToken(data.access_token);
    activateCoreDataCache(data.user.id);
    setUser(data.user);
    return data.user;
  }, []);

  const loginWithGoogle = useCallback(async (idToken, rememberMe = true) => {
    loadUserSeq.current += 1;
    setIsLoading(false);
    setRememberMe(rememberMe);
    const { data } = await client.post('/auth/google', {
      id_token: idToken,
      remember_me: rememberMe,
    });
    setAccessToken(data.access_token);
    activateCoreDataCache(data.user.id);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    loadUserSeq.current += 1;
    try {
      await client.post('/auth/logout');
    } finally {
      deactivateCoreDataCache();
      queryClientInstance.clear();
      clearAccessToken();
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      isLoading,
      isAuthenticated: !!user,
      loginWithEmailCode,
      loginWithGoogle,
      logout,
      refreshUser: loadUser,
      rememberMe: getRememberMe(),
    }),
    [user, isLoading, loginWithEmailCode, loginWithGoogle, logout, loadUser],
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
