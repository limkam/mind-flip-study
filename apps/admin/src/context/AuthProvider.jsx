import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import client, { clearAccessToken, setAccessToken } from '../api/client';
import { AuthContext } from './auth-context';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const navigate = useNavigate();
  const loadUserSeq = useRef(0);

  const loadUser = useCallback(async () => {
    const seq = ++loadUserSeq.current;
    setIsLoading(true);
    setAuthError('');
    try {
      const { data } = await client.get('/users/me');
      if (seq !== loadUserSeq.current) return null;
      if (data.role !== 'admin') {
        clearAccessToken();
        setUser(null);
        setAuthError('Admin access only');
        if (!window.location.pathname.startsWith('/login')) {
          navigate('/login', { replace: true, state: { message: 'Admin access only' } });
        }
        return null;
      }
      setUser(data);
      return data;
    } catch {
      if (seq !== loadUserSeq.current) return null;
      clearAccessToken();
      setUser(null);
      return null;
    } finally {
      if (seq === loadUserSeq.current) {
        setIsLoading(false);
      }
    }
  }, [navigate]);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const login = useCallback(async (email, password) => {
    loadUserSeq.current += 1;
    setIsLoading(false);
    setAuthError('');
    const { data } = await client.post('/auth/login', {
      email: email.trim().toLowerCase(),
      password,
    });
    if (data.user.role !== 'admin') {
      clearAccessToken();
      setUser(null);
      try {
        await client.post('/auth/logout');
      } catch {
        /* clear refresh cookie set by login */
      }
      const msg = 'Admin access only';
      setAuthError(msg);
      throw new Error(msg);
    }
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
      navigate('/login', { replace: true });
    }
  }, [navigate]);

  const value = useMemo(
    () => ({
      user,
      isLoading,
      isAuthenticated: !!user,
      authError,
      login,
      logout,
      refreshUser: loadUser,
    }),
    [user, isLoading, authError, login, logout, loadUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
