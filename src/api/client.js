import axios from 'axios';

const STORAGE_KEY = 'bilkeys_access_token';
const REMEMBER_KEY = 'bilkeys_remember_me';

function readRememberMe() {
  try {
    const v = localStorage.getItem(REMEMBER_KEY);
    if (v === null) return false;
    if (v === 'false') return false;
    return true;
  } catch {
    return false;
  }
}

let rememberMe = typeof window !== 'undefined' ? readRememberMe() : true;

function storageForToken() {
  if (typeof window === 'undefined') return null;
  return rememberMe ? localStorage : sessionStorage;
}

function readStoredToken() {
  try {
    const store = storageForToken();
    return store?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

let accessToken = typeof window !== 'undefined' ? readStoredToken() : null;

export const getRememberMe = () => rememberMe;

export const setRememberMe = (value) => {
  rememberMe = !!value;
  try {
    if (rememberMe) {
      localStorage.setItem(REMEMBER_KEY, 'true');
      const sessionToken = sessionStorage.getItem(STORAGE_KEY);
      if (sessionToken) {
        localStorage.setItem(STORAGE_KEY, sessionToken);
        sessionStorage.removeItem(STORAGE_KEY);
      }
    } else {
      localStorage.setItem(REMEMBER_KEY, 'false');
      const localToken = localStorage.getItem(STORAGE_KEY);
      if (localToken) {
        sessionStorage.setItem(STORAGE_KEY, localToken);
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  } catch {
    /* private mode */
  }
};

export const setAccessToken = (token) => {
  accessToken = token;
  try {
    const store = storageForToken();
    if (!store) return;
    if (token) store.setItem(STORAGE_KEY, token);
    else {
      localStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    /* private mode / blocked storage */
  }
};
export const clearAccessToken = () => {
  setAccessToken(null);
};

export const getAccessToken = () => accessToken;

function isAuthNoRefreshUrl(config) {
  const u = String(config?.url ?? '');
  return (
    u.includes('/auth/refresh')
    || u.includes('/auth/login')
    || u.includes('/auth/register')
    || u.includes('/auth/logout')
    || u.includes('/auth/google')
    || u.includes('/auth/apple')
    || u.includes('/auth/email/start')
    || u.includes('/auth/email/verify')
  );
}

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  withCredentials: true,
});

client.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

let isRefreshing = false;
let queue = [];

client.interceptors.response.use(null, async (error) => {
  const original = error.config;
  if (!original) {
    return Promise.reject(error);
  }

  if (
    error.response?.status === 403
    && error.response?.data?.error === 'onboarding_required'
    && typeof window !== 'undefined'
    && window.location.pathname !== '/onboarding'
  ) {
    window.location.assign('/onboarding');
    return Promise.reject(error);
  }

  if (
    error.response?.status === 402
    && typeof window !== 'undefined'
    && window.location.pathname !== '/pricing'
  ) {
    const detail = error.response?.data?.detail;
    const reason = typeof detail === 'object' && detail?.message
      ? detail.message
      : 'You reached a limit on your current plan.';
    error.isPlanLimitError = true;
    window.dispatchEvent(new CustomEvent('bilkeys:plan-limit', { detail: { reason } }));
    return Promise.reject(error);
  }

  if (error.response?.status === 401 && isAuthNoRefreshUrl(original)) {
    return Promise.reject(error);
  }

  // Already retried once after refresh — do not loop.
  if (error.response?.status === 401 && original._retry) {
    return Promise.reject(error);
  }

  if (error.response?.status === 401 && !original._retry) {
    if (isRefreshing) {
      return new Promise((res, rej) => queue.push({ res, rej })).then(() => client(original));
    }
    original._retry = true;
    isRefreshing = true;
    try {
      const { data } = await client.post('/auth/refresh');
      setAccessToken(data.access_token);
      queue.forEach(({ res }) => res());
      queue = [];
      return client(original);
    } catch (e) {
      queue.forEach(({ rej }) => rej(e));
      queue = [];
      clearAccessToken();
      const path = window.location.pathname;
      const onPublicAuth = path === '/login';
      if (!onPublicAuth) {
        window.location.assign('/login');
      }
      return Promise.reject(e);
    } finally {
      isRefreshing = false;
    }
  }
  return Promise.reject(error);
});

export default client;
