const STORAGE_KEY = "mv_watchlist";
const MAX_ENTRIES = 200;

export interface WatchlistEntry {
  movieId: number;
  addedAt: number;
}

export function getWatchlist(): WatchlistEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as WatchlistEntry[];
  } catch {
    return [];
  }
}

export function getWatchlistIds(): number[] {
  return getWatchlist().map(e => e.movieId);
}

export function isInWatchlist(movieId: number): boolean {
  return getWatchlist().some(e => e.movieId === movieId);
}

export function addToWatchlist(movieId: number): void {
  try {
    const list = getWatchlist().filter(e => e.movieId !== movieId);
    list.unshift({ movieId, addedAt: Date.now() });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_ENTRIES)));
  } catch {}
}

export function removeFromWatchlist(movieId: number): void {
  try {
    const list = getWatchlist().filter(e => e.movieId !== movieId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {}
}

export function toggleWatchlist(movieId: number): boolean {
  if (isInWatchlist(movieId)) {
    removeFromWatchlist(movieId);
    return false;
  } else {
    addToWatchlist(movieId);
    return true;
  }
}
