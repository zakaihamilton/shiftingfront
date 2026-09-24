export type StorageAdapter = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  keys: () => string[];
  /** Browser-backed adapters expose their native area for storage events. */
  area?: Storage;
};

/** Storage can fail in browsers with disabled privacy storage or an exhausted quota. */
export function safeGetItem(storage: StorageAdapter, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

export function safeSetItem(storage: StorageAdapter, key: string, value: string): boolean {
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function safeRemoveItem(storage: StorageAdapter, key: string): boolean {
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function safeKeys(storage: StorageAdapter): string[] {
  try {
    return storage.keys();
  } catch {
    return [];
  }
}

export function clearAllGameData(storage: StorageAdapter): boolean {
  try {
    const gameKeys = storage.keys().filter((key) =>
      key.startsWith("shiftingfront:") || key.startsWith("shifting-front:"),
    );
    for (const key of gameKeys) {
      try {
        storage.removeItem(key);
      } catch {
        return false;
      }
    }
    return !storage.keys().some((key) =>
      key.startsWith("shiftingfront:") || key.startsWith("shifting-front:"),
    );
  } catch {
    return false;
  }
}

function unavailableStorageAdapter(): StorageAdapter {
  const unavailable = () => {
    throw new Error("Browser storage is unavailable");
  };
  return {
    getItem: () => unavailable(),
    setItem: () => unavailable(),
    removeItem: () => unavailable(),
    keys: () => unavailable(),
  };
}

export function memoryStorage(initial: Record<string, string> = {}): StorageAdapter {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
    keys: () => [...map.keys()],
  };
}

export function localStorageAdapter(): StorageAdapter {
  let area: Storage;
  try {
    area = window.localStorage;
  } catch {
    return unavailableStorageAdapter();
  }
  return {
    area,
    getItem: (k) => area.getItem(k),
    setItem: (k, v) => area.setItem(k, v),
    removeItem: (k) => area.removeItem(k),
    keys: () => Object.keys(area),
  };
}

export function sessionStorageAdapter(): StorageAdapter {
  let area: Storage;
  try {
    area = window.sessionStorage;
  } catch {
    return unavailableStorageAdapter();
  }
  return {
    area,
    getItem: (k) => area.getItem(k),
    setItem: (k, v) => area.setItem(k, v),
    removeItem: (k) => area.removeItem(k),
    keys: () => Object.keys(area),
  };
}

let _cachedStorage: StorageAdapter | null = null;

export function cachedLocalStorage(): StorageAdapter {
  if (typeof window === "undefined") return memoryStorage();
  if (!_cachedStorage) _cachedStorage = localStorageAdapter();
  return _cachedStorage;
}

let _cachedSessionStorage: StorageAdapter | null = null;

export function cachedSessionStorage(): StorageAdapter {
  if (typeof window === "undefined") return memoryStorage();
  if (!_cachedSessionStorage) {
    try {
      if (typeof window.sessionStorage !== "undefined") {
        window.sessionStorage.getItem("__storage_test__");
        _cachedSessionStorage = sessionStorageAdapter();
      } else {
        _cachedSessionStorage = cachedLocalStorage();
      }
    } catch {
      _cachedSessionStorage = cachedLocalStorage();
    }
  }
  return _cachedSessionStorage;
}
