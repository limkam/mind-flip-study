import { useCallback, useSyncExternalStore } from "react";

import { storage } from "../store/storage";

type Listener = () => void;

/**
 * Every hook instance reading the same key shares one listener set, so a write
 * from any screen re-renders all of them. Without this, already-mounted screens
 * keep their stale copy until they remount (the theme toggle only reached the
 * screen that owned the switch).
 */
const listeners = new Map<string, Set<Listener>>();

function subscribe(key: string, listener: Listener): () => void {
  let forKey = listeners.get(key);
  if (!forKey) {
    forKey = new Set();
    listeners.set(key, forKey);
  }
  forKey.add(listener);
  return () => {
    forKey.delete(listener);
    if (forKey.size === 0) listeners.delete(key);
  };
}

function emit(key: string): void {
  const forKey = listeners.get(key);
  if (!forKey) return;
  for (const listener of [...forKey]) listener();
}

export function useStorageString(
  key: string,
): [string | undefined, (value: string | undefined) => void] {
  const getSnapshot = useCallback(() => storage.getString(key), [key]);
  const value = useSyncExternalStore(
    useCallback((listener: Listener) => subscribe(key, listener), [key]),
    getSnapshot,
    getSnapshot,
  );

  const setStored = useCallback(
    (next: string | undefined) => {
      if (next === undefined) {
        storage.remove(key);
      } else {
        storage.set(key, next);
      }
      emit(key);
    },
    [key],
  );

  return [value, setStored];
}
