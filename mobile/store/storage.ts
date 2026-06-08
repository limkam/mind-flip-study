import AsyncStorage from "@react-native-async-storage/async-storage";

const PREFIX = "@mindflip-app:";

const cache = new Map<string, string>();

let hydrated = false;
let hydratePromise: Promise<void> | null = null;

async function hydrate(): Promise<void> {
  if (hydrated) return;
  if (!hydratePromise) {
    hydratePromise = (async () => {
      const keys = await AsyncStorage.getAllKeys();
      const appKeys = keys.filter((key) => key.startsWith(PREFIX));
      const pairs = await AsyncStorage.multiGet(appKeys);
      for (const [key, value] of pairs) {
        if (value != null) {
          cache.set(key.slice(PREFIX.length), value);
        }
      }
      hydrated = true;
    })();
  }
  await hydratePromise;
}

/** Load persisted keys before screens read from storage (Expo Go–compatible). */
export async function ensureStorageReady(): Promise<void> {
  await hydrate();
}

/** App-wide key-value store (theme, offline study cache, pending progress). */
export const storage = {
  getString(key: string): string | undefined {
    return cache.get(key);
  },

  getBoolean(key: string): boolean {
    return cache.get(key) === "true";
  },

  set(key: string, value: string | boolean): void {
    const serialized = typeof value === "boolean" ? String(value) : value;
    cache.set(key, serialized);
    void AsyncStorage.setItem(PREFIX + key, serialized);
  },

  remove(key: string): void {
    cache.delete(key);
    void AsyncStorage.removeItem(PREFIX + key);
  },
};
