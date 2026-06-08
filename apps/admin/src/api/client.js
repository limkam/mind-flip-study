import axios from 'axios';

let accessToken = null;

export const setAccessToken = (token) => {
  accessToken = token;
};
export const clearAccessToken = () => {
  accessToken = null;
};

function isAuthNoRefreshUrl(config) {
  const u = String(config?.url ?? '');
  return (
    u.includes('/auth/refresh')
    || u.includes('/auth/login')
    || u.includes('/auth/register')
    || u.includes('/auth/logout')
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
  if (!original) return Promise.reject(error);

  if (error.response?.status === 401 && isAuthNoRefreshUrl(original)) {
    return Promise.reject(error);
  }

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
      if (!window.location.pathname.startsWith('/login')) {
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
