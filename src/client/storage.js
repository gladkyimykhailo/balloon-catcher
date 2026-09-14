// Keep the game playable when browser storage is unavailable or damaged.
const memory = new Map();
export const storage = {
  getItem(key) {
    if (memory.has(key)) return memory.get(key);
    try { return globalThis.localStorage.getItem(key); } catch { return null; }
  },
  setItem(key, value) {
    memory.set(key, String(value));
    try { globalThis.localStorage.setItem(key, String(value)); } catch { /* Session-only progress. */ }
  },
};

export function savedNumber(key, fallback = 0) {
  const value = Number(storage.getItem(key) ?? fallback);
  return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

export function savedSet(key, defaults = []) {
  try {
    const value = JSON.parse(storage.getItem(key));
    if (Array.isArray(value)) return new Set([...defaults, ...value.filter(v => typeof v === 'string')]);
  } catch { /* Invalid JSON uses the default collection. */ }
  return new Set(defaults);
}
