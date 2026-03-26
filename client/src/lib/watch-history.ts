const STORAGE_KEY = "mv_watch_history";
const MAX_ENTRIES = 20;

export interface WatchEntry {
  movieId: number;
  watchedAt: number;
}

export function getWatchHistory(): WatchEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as WatchEntry[];
  } catch {
    return [];
  }
}

export function addToWatchHistory(movieId: number): void {
  try {
    const history = getWatchHistory().filter(e => e.movieId !== movieId);
    history.unshift({ movieId, watchedAt: Date.now() });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, MAX_ENTRIES)));
  } catch {}
}

export function getWatchHistoryIds(): number[] {
  return getWatchHistory().map(e => e.movieId);
}
