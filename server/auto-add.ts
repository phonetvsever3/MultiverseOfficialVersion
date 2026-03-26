import { storage } from "./storage";
import { postMovieToChannel } from "./channel";
import { invalidatePrefix } from "./cache";
import type { SyncedFile } from "@shared/schema";

// ─── Movie filename parser ────────────────────────────────────────────────────

export function parseMovieFileName(fileName: string): { title: string; year?: number; quality?: string } | null {
  const name = fileName.replace(/\.[^.]+$/, '');
  const normalized = name.replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim();

  // Skip TV series episodes — any filename with SxxExx, SxxEPxx, EPxx or Episode patterns
  if (
    /\bS\d{1,2}EP\s*\d{1,3}\b/i.test(normalized) ||
    /\bS\d{1,2}[\s-]?E\d{1,3}\b/i.test(normalized) ||
    /\bEP\s*\d{1,3}\b/i.test(normalized) ||
    /\bEpisode\s*\d+\b/i.test(normalized) ||
    /\bE\d{2,3}\b/.test(normalized)
  ) {
    return null;
  }

  const yearMatch = normalized.match(/\b(19[0-9]{2}|20[0-9]{2})\b/);
  const year = yearMatch ? parseInt(yearMatch[1]) : undefined;

  let title = year ? normalized.substring(0, normalized.indexOf(String(year))).trim() : normalized;

  const qualityKeywords = /\b(480p|720p|1080p|4k|WEB[-\s]?DL|BluRay|BRRip|HDRip|HEVC|x264|x265|AAC|AVC|NF|AMZN|TRUE|Final|Edit|Telugu|Hindi|Tamil|Malayalam|Kannada|English|Dual|Multi)\b.*/i;
  title = title.replace(qualityKeywords, '').trim();
  title = title.replace(/[\[\(].*?[\]\)]/g, '').trim();
  title = title.replace(/[-_\s]+$/, '').trim();

  if (!title) return null;

  const qualityMatch = normalized.match(/\b(480p|720p|1080p|4k)\b/i);
  const quality = qualityMatch ? qualityMatch[1].toLowerCase() as any : undefined;

  return { title, year, quality };
}

// ─── Series filename parser ───────────────────────────────────────────────────

export function parseSeriesFileName(fileName: string): {
  title: string;
  season: number;
  episode: number;
  year?: number;
  quality?: string;
} | null {
  const name = fileName.replace(/\.[^.]+$/, '');
  const normalized = name.replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim();

  let season: number | undefined;
  let episode: number | undefined;
  let matchStart = -1;
  let matchLength = 0;

  // Priority 1: SxxEPxx (e.g., S01EP03, S01EP003) — must come before SxxExx
  const sxepx = normalized.match(/\bS(\d{1,2})EP\s*(\d{1,3})\b/i);
  if (sxepx && sxepx.index !== undefined) {
    season = parseInt(sxepx[1]);
    episode = parseInt(sxepx[2]);
    matchStart = sxepx.index;
    matchLength = sxepx[0].length;
  }

  // Priority 2: SxxExx / Sx Exx / Sxx-Exx (standard format)
  if (season === undefined) {
    const sxex = normalized.match(/\bS(\d{1,2})[\s\-]?E(\d{1,3})\b/i);
    if (sxex && sxex.index !== undefined) {
      season = parseInt(sxex[1]);
      episode = parseInt(sxex[2]);
      matchStart = sxex.index;
      matchLength = sxex[0].length;
    }
  }

  // Priority 3: EPxx / EP xx  (no season number → Season 1)
  if (season === undefined) {
    const epOnly = normalized.match(/\bEP\s*(\d{1,3})\b/i);
    if (epOnly && epOnly.index !== undefined) {
      season = 1;
      episode = parseInt(epOnly[1]);
      matchStart = epOnly.index;
      matchLength = epOnly[0].length;
    }
  }

  // Priority 4: Exx alone (2–3 digits, not preceded by S), e.g., "Siren's Kiss E03"
  if (season === undefined) {
    const eOnly = normalized.match(/(?<!\bS\d{1,2}[\s\-]?)(?<![A-Za-z])\bE(\d{2,3})\b(?!\d)/i);
    if (eOnly && eOnly.index !== undefined) {
      season = 1;
      episode = parseInt(eOnly[1]);
      matchStart = eOnly.index;
      matchLength = eOnly[0].length;
    }
  }

  // Priority 5: "Episode N" spelled out
  if (season === undefined) {
    const epSpelled = normalized.match(/\bEpisode\s+(\d{1,3})\b/i);
    if (epSpelled && epSpelled.index !== undefined) {
      season = 1;
      episode = parseInt(epSpelled[1]);
      matchStart = epSpelled.index;
      matchLength = epSpelled[0].length;
    }
  }

  if (season === undefined || episode === undefined || matchStart < 0) return null;

  // Everything before the episode/season code is the title
  let title = normalized.substring(0, matchStart).trim();

  // Extract year if present in the title portion
  const yearMatch = title.match(/\b(19[0-9]{2}|20[0-9]{2})\b/);
  const year = yearMatch ? parseInt(yearMatch[1]) : undefined;
  if (year) title = title.replace(String(year), '').trim();

  // Strip quality keywords and brackets
  const qualityKeywords = /\b(480p|720p|1080p|4k|WEB[-\s]?DL|BluRay|BRRip|HDRip|HEVC|x264|x265|AAC|AVC|NF|AMZN|TRUE|Final|Edit|Telugu|Hindi|Tamil|Malayalam|Kannada|English|Dual|Multi)\b.*/i;
  title = title.replace(qualityKeywords, '').trim();
  title = title.replace(/[\[\(].*?[\]\)]/g, '').trim();
  title = title.replace(/[-_\s]+$/, '').trim();

  // Capitalize words nicely (skip letters after apostrophes)
  title = title.replace(/(?<!['\u2019])\b\w/g, c => c.toUpperCase());

  if (!title || title.length < 2) return null;

  const qualityMatch = normalized.match(/\b(480p|720p|1080p|4k)\b/i);
  const quality = qualityMatch ? qualityMatch[1].toLowerCase() as any : undefined;

  return { title, season, episode, year, quality };
}

// ─── Result types ─────────────────────────────────────────────────────────────

export type AutoAddResult =
  | { ok: true; created: true; movie: any; episode?: any; type: 'movie' | 'series' }
  | { ok: true; created: false; reason: "already_exists" | "not_found" | "disabled" }
  | { ok: false; error: string };

// ─── Skip list ───────────────────────────────────────────────────────────────

const SKIP_TITLES = new Set([
  "video", "3", "2", "1", "clip", "movie", "film", "sample",
  "trailer", "teaser", "promo", "scene", "short", "untitled",
  "hd", "fhd", "uhd", "4k", "rip", "cam", "ts",
]);

function isTitleTooGeneric(title: string): boolean {
  const t = title.toLowerCase().trim();
  if (t.length < 2) return true;
  if (SKIP_TITLES.has(t)) return true;
  if (/^\d+$/.test(t)) return true;
  return false;
}

// ─── Auto-add series from file ────────────────────────────────────────────────

export async function autoAddSeriesFromFile(file: SyncedFile, forceAdd = false): Promise<AutoAddResult> {
  try {
    const settings = await storage.getSettings();
    if (!settings?.tmdbApiKey) return { ok: false, error: "TMDB API key not configured" };

    if (!forceAdd && !settings.autoAddMovies) {
      return { ok: true, created: false, reason: "disabled" };
    }

    // Check if this exact file is already an episode
    if (file.fileUniqueId) {
      const existing = await storage.getEpisodeByFileUniqueId(file.fileUniqueId);
      if (existing) return { ok: true, created: false, reason: "already_exists" };
    }

    const parsed = parseSeriesFileName(file.fileName);
    if (!parsed) return { ok: true, created: false, reason: "not_found" };

    if (isTitleTooGeneric(parsed.title)) {
      return { ok: true, created: false, reason: "not_found" };
    }

    // Search TMDB TV shows
    const searchUrl = `https://api.themoviedb.org/3/search/tv?api_key=${settings.tmdbApiKey}&query=${encodeURIComponent(parsed.title)}${parsed.year ? `&first_air_date_year=${parsed.year}` : ''}`;
    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) return { ok: false, error: "TMDB TV search failed" };

    const searchData = await searchRes.json() as any;
    if (!searchData.results || searchData.results.length === 0) {
      return { ok: true, created: false, reason: "not_found" };
    }

    const tmdbShow = searchData.results[0];
    if (!tmdbShow.poster_path) {
      return { ok: true, created: false, reason: "not_found" };
    }

    // Find or create the series in our library
    let series = await storage.getMovieByTmdbId(tmdbShow.id);
    let seriesCreated = false;

    if (!series) {
      // Fetch full TV show details + credits
      const detailsRes = await fetch(
        `https://api.themoviedb.org/3/tv/${tmdbShow.id}?api_key=${settings.tmdbApiKey}&append_to_response=credits`
      );
      if (!detailsRes.ok) return { ok: false, error: "TMDB TV details fetch failed" };
      const details = await detailsRes.json() as any;

      const cast = details.credits?.cast?.slice(0, 10).map((c: any) => ({
        name: c.name, character: c.character, profilePath: c.profile_path,
      })) || [];
      const genre = details.genres?.map((g: any) => g.name).join(', ') || '';

      series = await storage.createMovie({
        title: details.name || tmdbShow.name,
        type: 'series',
        quality: '720p',
        fileId: null as any,
        fileUniqueId: null as any,
        fileSize: null as any,
        tmdbId: tmdbShow.id,
        overview: details.overview,
        posterPath: details.poster_path,
        releaseDate: details.first_air_date,
        genre,
        cast: cast as any,
        rating: Math.round((details.vote_average || 0) * 10),
      });

      seriesCreated = true;
      invalidatePrefix("movies:");
      invalidatePrefix("home:");
    }

    // Fetch TMDB episode details for title/overview/airDate
    let epTitle: string | undefined;
    let epOverview: string | undefined;
    let epAirDate: string | undefined;

    try {
      const epRes = await fetch(
        `https://api.themoviedb.org/3/tv/${tmdbShow.id}/season/${parsed.season}/episode/${parsed.episode}?api_key=${settings.tmdbApiKey}`
      );
      if (epRes.ok) {
        const epData = await epRes.json() as any;
        epTitle = epData.name;
        epOverview = epData.overview;
        epAirDate = epData.air_date;
      }
    } catch { /* Silently ignore – episode metadata is optional */ }

    // Check if this season+episode already exists for the series
    const existingEpisodes = await storage.getEpisodes(series.id, parsed.season);
    const dupEp = existingEpisodes.find(e => e.episodeNumber === parsed.episode);
    if (dupEp) {
      return { ok: true, created: false, reason: "already_exists" };
    }

    // Create the episode
    const episode = await storage.createEpisode({
      movieId: series.id,
      seasonNumber: parsed.season,
      episodeNumber: parsed.episode,
      title: epTitle || `Episode ${parsed.episode}`,
      overview: epOverview,
      fileId: file.fileId,
      fileUniqueId: file.fileUniqueId,
      fileSize: file.fileSize,
      airDate: epAirDate,
      rating: 0,
    });

    invalidatePrefix("movies:");
    invalidatePrefix("home:");

    return { ok: true, created: true, movie: series, episode, type: 'series' };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

// ─── Auto-add movie from file ─────────────────────────────────────────────────

export async function autoAddMovieFromFile(file: SyncedFile, forceAdd = false): Promise<AutoAddResult> {
  try {
    const settings = await storage.getSettings();
    if (!settings?.tmdbApiKey) {
      return { ok: false, error: "TMDB API key not configured" };
    }

    if (!forceAdd && !settings.autoAddMovies) {
      return { ok: true, created: false, reason: "disabled" };
    }

    if (file.fileUniqueId) {
      const existing = await storage.getMovieByFileUniqueId(file.fileUniqueId);
      if (existing) return { ok: true, created: false, reason: "already_exists" };
    }

    const parsed = parseMovieFileName(file.fileName);
    if (!parsed) return { ok: true, created: false, reason: "not_found" };

    if (isTitleTooGeneric(parsed.title)) {
      return { ok: true, created: false, reason: "not_found" };
    }

    const searchRes = await fetch(
      `https://api.themoviedb.org/3/search/movie?api_key=${settings.tmdbApiKey}&query=${encodeURIComponent(parsed.title)}${parsed.year ? `&year=${parsed.year}` : ''}`
    );
    if (!searchRes.ok) return { ok: false, error: "TMDB search failed" };

    const searchData = await searchRes.json() as any;
    if (!searchData.results || searchData.results.length === 0) {
      return { ok: true, created: false, reason: "not_found" };
    }

    const tmdbMovie = searchData.results[0];

    if (!tmdbMovie.poster_path) {
      return { ok: true, created: false, reason: "not_found" };
    }

    if (tmdbMovie.id) {
      const existingByTmdb = await storage.getMovieByTmdbId(tmdbMovie.id);
      if (existingByTmdb) return { ok: true, created: false, reason: "already_exists" };
    }

    const tmdbTitle = tmdbMovie.title || tmdbMovie.name;
    if (tmdbTitle) {
      const existingByTitle = await storage.getMovieByTitle(tmdbTitle);
      if (existingByTitle) return { ok: true, created: false, reason: "already_exists" };
    }

    const detailsRes = await fetch(
      `https://api.themoviedb.org/3/movie/${tmdbMovie.id}?api_key=${settings.tmdbApiKey}&append_to_response=credits`
    );
    if (!detailsRes.ok) return { ok: false, error: "TMDB details fetch failed" };
    const details = await detailsRes.json() as any;

    const cast = details.credits?.cast?.slice(0, 10).map((c: any) => ({
      name: c.name, character: c.character, profilePath: c.profile_path,
    })) || [];
    const genre = details.genres?.map((g: any) => g.name).join(', ') || '';

    const movie = await storage.createMovie({
      title: details.title || tmdbMovie.title,
      type: 'movie',
      quality: parsed.quality || '720p',
      fileId: file.fileId,
      fileUniqueId: file.fileUniqueId,
      fileSize: file.fileSize,
      tmdbId: tmdbMovie.id,
      overview: details.overview,
      posterPath: details.poster_path,
      releaseDate: details.release_date,
      genre,
      cast: cast as any,
      rating: Math.round((details.vote_average || 0) * 10),
    });

    invalidatePrefix("movies:");
    invalidatePrefix("home:");

    if (settings.autoPostMovies && settings.telegramChannelUsername && !movie.postedToChannel) {
      postMovieToChannel(movie.id)
        .then(result => { if (result.ok) storage.markMoviePosted(movie.id); })
        .catch(() => {});
    }

    return { ok: true, created: true, movie, type: 'movie' };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

// ─── Unified auto-add (detects movie vs series automatically) ─────────────────

export async function autoAddFromFile(file: SyncedFile, forceAdd = false): Promise<AutoAddResult> {
  const isSeries = parseSeriesFileName(file.fileName) !== null;
  if (isSeries) {
    return autoAddSeriesFromFile(file, forceAdd);
  }
  return autoAddMovieFromFile(file, forceAdd);
}
