import { useCallback, useState } from "react";

import { storage } from "../store/storage";

export function useStorageString(
  key: string,
): [string | undefined, (value: string | undefined) => void] {
  const [value, setValue] = useState<string | undefined>(() => storage.getString(key));

  const setStored = useCallback(
    (next: string | undefined) => {
      if (next === undefined) {
        storage.remove(key);
      } else {
        storage.set(key, next);
      }
      setValue(next);
    },
    [key],
  );

  return [value, setStored];
}
