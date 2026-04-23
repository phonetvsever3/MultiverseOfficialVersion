const STORAGE_KEY = "mv_watch_history";
const MAX_ENTRIES = 20;

export interface WatchEntry {
  movieId: number;
  watchedAt: number;
  progress?: number;  // seconds watched
  duration?: number;  // total seconds
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

export function updateWatchProgress(movieId: number, progress: number, duration: number): void {
  try {
    const history = getWatchHistory();
    const idx = history.findIndex(e => e.movieId === movieId);
    if (idx >= 0) {
      history[idx].progress = Math.floor(progress);
      history[idx].duration = Math.floor(duration);
      history[idx].watchedAt = Date.now();
    } else {
      history.unshift({ movieId, watchedAt: Date.now(), progress: Math.floor(progress), duration: Math.floor(duration) });
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, MAX_ENTRIES)));
  } catch {}
}

export function getWatchProgress(movieId: number): { progress: number; duration: number } | null {
  const entry = getWatchHistory().find(e => e.movieId === movieId);
  if (!entry || !entry.progress || !entry.duration || entry.progress < 5) return null;
  return { progress: entry.progress, duration: entry.duration };
}

export function getWatchHistoryIds(): number[] {
  return getWatchHistory().map(e => e.movieId);
}
