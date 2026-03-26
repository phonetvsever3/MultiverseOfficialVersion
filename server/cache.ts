interface CacheEntry {
  data: unknown;
  cachedAt: number;
  ttlMs: number;
}

const store: Record<string, CacheEntry> = {};

export function normalizeKey(raw: string): string {
  return raw.toLowerCase().replace(/\s+/g, "");
}

export function getCached(key: string): unknown | null {
  const entry = store[key];
  if (!entry) return null;
  const age = Date.now() - entry.cachedAt;
  if (age > entry.ttlMs) {
    delete store[key];
    return null;
  }
  return entry.data;
}

export function setCache(key: string, data: unknown, ttlMs: number): void {
  store[key] = { data, cachedAt: Date.now(), ttlMs };
}

export function invalidatePrefix(prefix: string): void {
  for (const key of Object.keys(store)) {
    if (key.startsWith(prefix)) delete store[key];
  }
}

export function cacheStats(): { size: number; keys: string[] } {
  return { size: Object.keys(store).length, keys: Object.keys(store) };
}

setInterval(() => {
  const now = Date.now();
  let removed = 0;
  for (const key of Object.keys(store)) {
    const entry = store[key];
    if (now - entry.cachedAt > entry.ttlMs) {
      delete store[key];
      removed++;
    }
  }
  if (removed > 0) console.log(`[Cache] Cleanup: removed ${removed} expired entries`);
}, 10 * 60 * 1000);

export const TTL = {
  MOVIES:   60  * 1000,
  SERIES:   120 * 1000,
  SPORTS:   15  * 1000,
  SEARCH:   30  * 1000,
  HOME:     60  * 1000,
  BROWSE:   30  * 1000,
  SINGLE:   120 * 1000,
};
