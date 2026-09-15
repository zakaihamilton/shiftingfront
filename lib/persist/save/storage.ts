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
    const keys = safeKeys(storage);
    for (const key of keys) {
      if (key.startsWith("shiftingfront:") || key.startsWith("shifting-front:")) {
        safeRemoveItem(storage, key);
      }
    }
    return true;
  } catch {
    return false;
  }
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
  return {
    area: window.localStorage,
    getItem: (k) => window.localStorage.getItem(k),
    setItem: (k, v) => window.localStorage.setItem(k, v),
    removeItem: (k) => window.localStorage.removeItem(k),
    keys: () => Object.keys(window.localStorage),
  };
}

export function sessionStorageAdapter(): StorageAdapter {
  return {
    area: window.sessionStorage,
    getItem: (k) => window.sessionStorage.getItem(k),
    setItem: (k, v) => window.sessionStorage.setItem(k, v),
    removeItem: (k) => window.sessionStorage.removeItem(k),
    keys: () => Object.keys(window.sessionStorage),
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
