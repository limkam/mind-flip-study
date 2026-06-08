import { createContext } from 'react';

/** Survives Vite HMR so Provider and consumers always share one context instance. */
const CONTEXT_KEY = '__mindflip_admin_auth_context__';

function getAuthContext() {
  if (import.meta.hot) {
    if (!globalThis[CONTEXT_KEY]) {
      globalThis[CONTEXT_KEY] = createContext(null);
    }
    return globalThis[CONTEXT_KEY];
  }
  return createContext(null);
}

export const AuthContext = getAuthContext();
