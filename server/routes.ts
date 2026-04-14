import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import crypto from "crypto";
import { Readable } from "stream";
import pg from "pg";

declare module "express-session" {
  interface SessionData {
    isAdmin: boolean;
  }
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.session?.isAdmin) return next();
  res.status(401).json({ message: "Unauthorized" });
}
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { generateAndSendTikTok, type MusicStyle } from "./tiktok-video";
import { startBot, broadcastMovieNotification, broadcastEpisodeNotification } from "./bot";
import { seed } from "./seed";
import { db, pool } from "./db";
import { sql } from "drizzle-orm";
import { movies, episodes, channels, syncedFiles, users, ads, settings, mascotSettings, footballApiKeys, backups, appUrls, viewLogs } from "@shared/schema";
import { performBackup } from "./github-backup";
import { performTelegramDbBackup } from "./telegram-db-backup";
import { initializeAutoBackup, initializeTelegramBackup } from "./backup-scheduler";
import multer from "multer";
import path from "path";
import fs from "fs";
import os from "os";
import v8 from "v8";
import { spawn } from "child_process";
import { getCached, setCache, invalidatePrefix, normalizeKey, TTL, clearAllCache, cacheStats } from "./cache";
import { postMovieToChannel, postFootballToChannel, type ChannelFootballMatch } from "./channel";
import { parseMovieFileName, parseSeriesFileName, autoAddFromFile, autoAddMovieFromFile } from "./auto-add";
import { runHealthCheck } from "./url-checker";
import { registerHlsRoutes } from "./hls-stream";
import { getTgClient, scanChannelMtproto } from "./tg-stream";
import { registerStreamLbRoutes, initStreamLbHealthCheck, runStreamBackendHealthCheck } from "./stream-lb";

const uploadsDir = path.resolve("public/uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
    },
  }),
  limits: { fileSize: 200 * 1024 * 1024 },
});

const lottieDir = path.resolve("public/lottie");
if (!fs.existsSync(lottieDir)) fs.mkdirSync(lottieDir, { recursive: true });

const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

const lottieUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, lottieDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || ".lottie";
      const base = path.basename(file.originalname, ext).replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
      cb(null, `${base}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.originalname.endsWith(".lottie") || file.mimetype === "application/zip") {
      cb(null, true);
    } else {
      cb(new Error("Only .lottie files are allowed"));
    }
  },
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // ─── Auth Middleware ──────────────────────────────────────────────────────
  // Protect all /api/admin/* routes except the login endpoint
  app.use((req: Request, res: Response, next: NextFunction) => {
    const isAdminPath = req.path.startsWith("/api/admin/") || req.path === "/api/admin";
    const isLoginPath = req.path === "/api/admin/login" && req.method === "POST";
    const isAuthCheckPath = req.path === "/api/admin/auth/me" && req.method === "GET";
    if (isAdminPath && !isLoginPath && !isAuthCheckPath) {
      return requireAdmin(req, res, next);
    }
    next();
  });
  // Stream Load Balancer (must be before HLS routes to intercept first)
  registerStreamLbRoutes(app);
  initStreamLbHealthCheck();

  // HLS Streaming routes
  registerHlsRoutes(app);

  // Start the Telegram Bot (Dynamic from DB)
  startBot().catch(console.error);
  
  // Seed Database (Async)
  seed().catch(console.error);
  
  // Activate all ads on startup
  db.update(ads).set({ isActive: true }).execute().catch(console.error);

  // Initialize auto backup
  initializeAutoBackup().catch(console.error);

  // Movies
  app.get(api.movies.list.path, async (req, res) => {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    const type = (req.query.type as string) || "";
    const search = normalizeKey((req.query.search as string) || "");
    const status = (req.query.status as string) || "";
    const missingEpisodes = req.query.missingEpisodes === "true";
    const ttl = type === "series" ? TTL.SERIES : TTL.MOVIES;
    const cacheKey = `movies:${type}:${search}:${status}:${missingEpisodes}:p${page}:l${limit}`;

    // Skip cache for admin-specific filters
    if (!status && !missingEpisodes) {
      const hit = getCached(cacheKey);
      if (hit) {
        console.log(`[Cache] CACHE HIT → ${cacheKey}`);
        res.setHeader("Cache-Control", `public, max-age=${ttl / 1000}`);
        return res.json(hit);
      }
    }

    console.log(`[Cache] FETCH API → ${cacheKey}`);
    const result = await storage.getMovies({
      search: req.query.search as string,
      type,
      limit,
      offset,
      ...(status ? { status } : {}),
      ...(missingEpisodes ? { missingEpisodes: true } : {}),
    });
    if (!status && !missingEpisodes) {
      setCache(cacheKey, result, ttl);
      res.setHeader("Cache-Control", `public, max-age=${ttl / 1000}`);
    }
    res.json(result);
  });

  // Toggle series ongoing/completed status
  app.patch("/api/admin/movies/:id/status", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { status } = req.body;
      if (!["ongoing", "completed"].includes(status)) {
        return res.status(400).json({ message: "status must be 'ongoing' or 'completed'" });
      }
      const updated = await storage.updateMovie(id, { status } as any);
      invalidatePrefix("movies:");
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get(api.movies.get.path, async (req, res) => {
    const id = Number(req.params.id);
    const cacheKey = `movie:${id}`;
    const hit = getCached(cacheKey);
    if (hit) {
      console.log(`[Cache] CACHE HIT → ${cacheKey}`);
      res.setHeader("Cache-Control", `public, max-age=${TTL.SINGLE / 1000}`);
      return res.json(hit);
    }
    const movie = await storage.getMovie(id);
    if (!movie) return res.status(404).json({ message: "Movie not found" });
    setCache(cacheKey, movie, TTL.SINGLE);
    res.setHeader("Cache-Control", `public, max-age=${TTL.SINGLE / 1000}`);
    res.json(movie);
  });

  // POST /getMovie — Bot API: look up a movie's fileId by database ID
  // Secured with x-api-key header (set via dashboard Settings → API Key)
  app.post("/getMovie", async (req: Request, res: Response) => {
    try {
      const cfg = await storage.getSettings();
      const configuredKey = cfg?.apiKey?.trim();
      if (configuredKey) {
        const provided = (req.headers["x-api-key"] as string | undefined)?.trim();
        if (provided !== configuredKey) {
          return res.status(401).json({ success: false, error: "Invalid API key" });
        }
      }

      const { userId, movieId } = req.body as { userId?: unknown; movieId?: unknown };
      if (!movieId) {
        return res.status(400).json({ success: false, error: "movieId is required" });
      }

      const id = Number(movieId);
      if (isNaN(id)) {
        return res.status(400).json({ success: false, error: "movieId must be a number" });
      }

      const movie = await storage.getMovie(id);
      if (!movie || !movie.fileId) {
        return res.status(404).json({ success: false, error: "Movie not found" });
      }

      console.log(`[getMovie] userId=${userId} movieId=${id} fileId=${movie.fileId}`);
      return res.json({ success: true, fileId: movie.fileId, name: movie.title });
    } catch (err) {
      console.error("[getMovie] Error:", err);
      return res.status(500).json({ success: false, error: "Internal server error" });
    }
  });

  app.post(api.movies.create.path, async (req, res) => {
    try {
      const input = api.movies.create.input.parse(req.body);
      
      // If tmdbId is provided, fetch more info if not already in input
      let movieData = { ...input };
      if (input.tmdbId) {
        const settings = await storage.getSettings();
        if (settings?.tmdbApiKey) {
          try {
            const tmdbRes = await fetch(`https://api.themoviedb.org/3/${input.type === 'series' ? 'tv' : 'movie'}/${input.tmdbId}?api_key=${settings.tmdbApiKey}&append_to_response=credits`);
            if (tmdbRes.ok) {
              const tmdbData = await tmdbRes.json();
              movieData.overview = movieData.overview || tmdbData.overview;
              movieData.posterPath = movieData.posterPath || tmdbData.poster_path;
              movieData.releaseDate = movieData.releaseDate || (input.type === 'series' ? tmdbData.first_air_date : tmdbData.release_date);
              
              // Handle Cast
              if (tmdbData.credits?.cast) {
                movieData.cast = tmdbData.credits.cast.slice(0, 10).map((c: any) => ({
                  name: c.name,
                  character: c.character,
                  profilePath: c.profile_path
                }));
              }

              // Handle Rating
              if (tmdbData.vote_average) {
                (movieData as any).rating = Math.round(tmdbData.vote_average * 10);
              }
            }
          } catch (err) {
            console.error("TMDB fetch error:", err);
          }
        }
      }

      // Deduplicate: if a movie with this fileUniqueId already exists, return it silently
      if (movieData.fileUniqueId) {
        const existing = await storage.getMovieByFileUniqueId(movieData.fileUniqueId);
        if (existing) {
          return res.status(200).json(existing);
        }
      }

      // Deduplicate: if a movie with this TMDB ID already exists, return it silently
      if (movieData.tmdbId) {
        const existingByTmdb = await storage.getMovieByTmdbId(movieData.tmdbId);
        if (existingByTmdb) {
          return res.status(200).json(existingByTmdb);
        }
      }

      // Deduplicate: if a movie with the same title already exists, return it silently
      if (movieData.title) {
        const existingByTitle = await storage.getMovieByTitle(movieData.title);
        if (existingByTitle) {
          return res.status(200).json(existingByTitle);
        }
      }

      const movie = await storage.createMovie(movieData);
      invalidatePrefix("movies:");
      invalidatePrefix("home:");

      // Auto-post to Telegram channel: movies only, never series, never already-posted
      if (movie.type === "movie") {
        storage.getSettings().then(async s => {
          if (s?.autoPostMovies && s?.telegramChannelUsername && !movie.postedToChannel) {
            const result = await postMovieToChannel(movie.id);
            if (result.ok) await storage.markMoviePosted(movie.id);
          }
        }).catch(() => {});
      }

      // TikTok video generation (runs async, never blocks response)
      generateAndSendTikTok(movie).catch(() => {});

      res.status(201).json(movie);
    } catch (e) {
      res.status(400).json({ message: "Invalid input" });
    }
  });

  app.delete(api.movies.delete.path, async (req, res) => {
    const id = Number(req.params.id);
    await storage.deleteMovie(id);
    invalidatePrefix("movies:");
    invalidatePrefix("home:");
    invalidatePrefix(`movie:${id}`);
    res.status(204).send();
  });

  // Remove all duplicate movies that share the same TMDB ID (keeps the first/oldest)
  app.post("/api/movies/remove-duplicates", async (_req, res) => {
    try {
      const duplicates = await storage.getDuplicateMoviesByTmdbId();
      let removed = 0;
      for (const movie of duplicates) {
        await storage.deleteMovie(movie.id);
        invalidatePrefix(`movie:${movie.id}`);
        removed++;
      }
      invalidatePrefix("movies:");
      invalidatePrefix("home:");
      res.json({ removed, message: `Removed ${removed} duplicate movie(s).` });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch(api.movies.update.path, async (req, res) => {
    try {
      const updates = api.movies.update.input.parse(req.body);
      const id = Number(req.params.id);
      const movie = await storage.updateMovie(id, updates);
      invalidatePrefix("movies:");
      invalidatePrefix("home:");
      invalidatePrefix(`movie:${id}`);
      res.json(movie);
    } catch (e) {
      res.status(400).json({ message: "Invalid input or movie not found" });
    }
  });

  // Episodes
  app.get("/api/movies/:id/episodes", async (req, res) => {
    const season = req.query.season ? Number(req.query.season) : undefined;
    const episodes = await storage.getEpisodes(Number(req.params.id), season);
    res.json(episodes);
  });

  app.post("/api/episodes", async (req, res) => {
    try {
      const input = req.body;
      const movie = await storage.getMovie(input.movieId);
      if (!movie || movie.type !== 'series') return res.status(400).json({ message: "Invalid series" });

      let episodeData = { ...input };
      const settings = await storage.getSettings();
      if (settings?.tmdbApiKey && movie.tmdbId) {
        try {
          const tmdbRes = await fetch(`https://api.themoviedb.org/3/tv/${movie.tmdbId}/season/${input.seasonNumber}/episode/${input.episodeNumber}?api_key=${settings.tmdbApiKey}`);
          if (tmdbRes.ok) {
            const tmdbData = await tmdbRes.json();
            episodeData.title = episodeData.title || tmdbData.name;
            episodeData.overview = episodeData.overview || tmdbData.overview;
            episodeData.airDate = episodeData.airDate || tmdbData.air_date;
            episodeData.rating = Math.round(tmdbData.vote_average * 10);
          }
        } catch (err) {
          console.error("TMDB episode fetch error:", err);
        }
      }

      const episode = await storage.createEpisode(episodeData);
      res.status(201).json(episode);
    } catch (e) {
      res.status(400).json({ message: "Invalid input" });
    }
  });

  // Auto-fetch all episodes for a season from TMDB
  app.post("/api/movies/:id/fetch-season", async (req, res) => {
    try {
      const movieId = Number(req.params.id);
      const { seasonNumber } = req.body;
      if (!seasonNumber) return res.status(400).json({ message: "seasonNumber is required" });

      const movie = await storage.getMovie(movieId);
      if (!movie || movie.type !== "series") return res.status(400).json({ message: "Invalid series" });
      if (!movie.tmdbId) return res.status(400).json({ message: "This series has no TMDB ID set" });

      const settings = await storage.getSettings();
      if (!settings?.tmdbApiKey) return res.status(400).json({ message: "TMDB API key not configured in settings" });

      const tmdbRes = await fetch(`https://api.themoviedb.org/3/tv/${movie.tmdbId}/season/${seasonNumber}?api_key=${settings.tmdbApiKey}`);
      if (!tmdbRes.ok) return res.status(400).json({ message: "Season not found on TMDB" });
      const seasonData = await tmdbRes.json();

      const existingEpisodes = await storage.getEpisodes(movieId, seasonNumber);
      const existingEpNums = new Set(existingEpisodes.map((e: any) => e.episodeNumber));

      const created = [];
      for (const ep of (seasonData.episodes || [])) {
        if (existingEpNums.has(ep.episode_number)) continue;
        const episode = await storage.createEpisode({
          movieId,
          seasonNumber,
          episodeNumber: ep.episode_number,
          title: ep.name || null,
          overview: ep.overview || null,
          airDate: ep.air_date || null,
          rating: ep.vote_average ? Math.round(ep.vote_average * 10) : null,
          fileId: "",
          fileSize: 0,
          fileUniqueId: `tmdb_s${seasonNumber}e${ep.episode_number}_${movieId}`,
        });
        created.push(episode);
      }

      res.json({ created: created.length, total: seasonData.episodes?.length || 0 });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Channels
  app.get(api.channels.list.path, async (req, res) => {
    const channels = await storage.getChannels();
    res.json(channels);
  });

  app.post(api.channels.create.path, async (req, res) => {
    const channel = await storage.createChannel(req.body);
    res.status(201).json(channel);
  });

  app.delete(api.channels.delete.path, async (req, res) => {
    await storage.deleteChannel(Number(req.params.id));
    res.status(204).send();
  });

  // ── Channel history scan ────────────────────────────────────────────────────
  // In-memory progress tracker (resets on restart)
  const scanProgress: Record<number, { status: "running" | "done" | "error"; added: number; skipped: number; failed: number; total: number; currentId: number; maxId: number; errors: string[]; message?: string; hint?: string; botUsername?: string }> = {};

  app.get("/api/channels/:id/scan-progress", (req, res) => {
    const id = parseInt(req.params.id);
    res.json(scanProgress[id] || null);
  });

  app.post("/api/channels/:id/scan-history", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid channel ID" });

    const channel = await storage.getChannels().then(list => list.find(c => c.id === id));
    if (!channel) return res.status(404).json({ message: "Channel not found" });

    const cfg = await storage.getSettings();
    const token = cfg?.botToken || process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return res.status(503).json({ message: "Bot token not configured" });

    const binChannel = cfg?.fsbBinChannel;
    if (!binChannel) return res.status(422).json({ message: "FSB Bin Channel is not configured in FileStreamBot settings." });

    if (scanProgress[id]?.status === "running") {
      return res.json({ status: "already_running", ...scanProgress[id] });
    }

    // Respond immediately — scan runs in the background
    scanProgress[id] = { status: "running", added: 0, skipped: 0, failed: 0, total: 0, currentId: 0, maxId: 0, errors: [] };
    res.json({ status: "started", message: "Channel history scan started in background." });

    // ── Pure Bot API sequential scan ──────────────────────────────────────────
    (async () => {
      const prog = scanProgress[id];
      try {
        const apiBase = `https://api.telegram.org/bot${token}`;

        // Resolve bot username for helpful error messages
        let botUsername = "";
        try {
          const meRes = await fetch(`${apiBase}/getMe`);
          const meData = await meRes.json();
          if (meData.ok) botUsername = `@${meData.result.username || meData.result.first_name}`;
        } catch {}
        prog.botUsername = botUsername;

        // Normalise stored telegramId → always "-100{channelId}" for Bot API
        const rawChannelId = channel.telegramId
          .replace(/^-100/, "")
          .replace(/^-/, "");
        const botApiId = `-100${rawChannelId}`;

        // Use the highest known message ID as the scan ceiling.
        // Accept optional override from query param: ?maxMsgId=5000
        const overrideMax = req.query?.maxMsgId ? parseInt(req.query.maxMsgId as string) : 0;
        const maxMsgId = overrideMax > 0
          ? overrideMax
          : (channel.lastMessageId && channel.lastMessageId > 0 ? channel.lastMessageId : 100000);

        let scanned = 0;
        prog.maxId = maxMsgId;

        console.log(`[scan-history] "${channel.name}": scanning IDs 1 → ${maxMsgId}`);

        // Scan UPWARD (1 → maxMsgId) so we never skip low-ID messages.
        // Structure:
        //  - Forward attempt is isolated; network errors skip the ID silently.
        //  - isFatal errors throw to the outer catch → aborts the entire scan.
        //  - prog.failed ONLY counts failures to save a found document (DB errors).
        //  - Deleted / service / non-document messages are silently skipped.
        for (let msgId = 1; msgId <= maxMsgId; msgId++) {
          scanned++;
          prog.currentId = msgId;

          // ── 1. Forward the message ─────────────────────────────────────────
          let fwdData: any = null;
          try {
            const fwdRes = await fetch(`${apiBase}/forwardMessage`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: binChannel,
                from_chat_id: botApiId,
                message_id: msgId,
                disable_notification: true,
              }),
            });
            fwdData = await fwdRes.json();
          } catch {
            // Pure network error — skip this ID, try the next
            await new Promise(r => setTimeout(r, 200));
            continue;
          }

          if (!fwdData.ok) {
            // Rate-limited — wait and retry the same ID
            if (fwdData.error_code === 429) {
              const wait = ((fwdData.parameters?.retry_after as number) || 5) * 1000;
              await new Promise(r => setTimeout(r, wait));
              msgId--;
              continue;
            }
            // Fatal Bot API access error → try MTProto fallback scan
            const desc = (fwdData.description || "").toLowerCase();
            if (
              desc.includes("chat not found") ||
              desc.includes("peer_id_invalid") ||
              desc.includes("channel_private") ||
              desc.includes("bot was kicked")
            ) {
              console.log(`[scan-history] Bot API access failed: "${fwdData.description}". Attempting MTProto fallback...`);
              const apiId = cfg?.fsbApiId?.trim();
              const apiHash = cfg?.fsbApiHash?.trim();
              if (!apiId || !apiHash || isNaN(parseInt(apiId, 10))) {
                prog.hint = "add_bot_as_admin";
                throw new Error(
                  `Cannot access channel. The easiest fix: add ${botUsername || "the bot"} as an admin to the channel, then run Scan History again. ` +
                  `(Bot API: "${fwdData.description}")`
                );
              }
              // Try FSB bot token first, fall back to main bot token
              const tokensToTry = [cfg?.fsbBotToken?.trim(), token.trim()].filter(Boolean) as string[];
              // Deduplicate in case they are the same
              const uniqueTokens = [...new Set(tokensToTry)];
              let client: any = null;
              let lastMtError = "";
              for (const tok of uniqueTokens) {
                try {
                  console.log(`[scan-history] Trying MTProto with token ending …${tok.slice(-6)}`);
                  client = await getTgClient(apiId, apiHash, tok);
                  break;
                } catch (mtErr: any) {
                  lastMtError = mtErr.message;
                  console.warn(`[scan-history] MTProto attempt failed: ${mtErr.message}`);
                }
              }
              if (!client) {
                prog.hint = "add_bot_as_admin";
                throw new Error(
                  `Cannot access channel. The easiest fix: add ${botUsername || "the bot"} as an admin to the channel, then run Scan History again. ` +
                  `(Bot API: "${fwdData.description}". MTProto also failed: ${lastMtError})`
                );
              }
              // Switch to MTProto scan — pass maxMsgId so it uses the already-known ceiling
              prog.message = "MTProto fallback: detecting channel history size...";
              prog.maxId = maxMsgId;
              await scanChannelMtproto(
                client,
                botApiId,
                maxMsgId,
                async (fileInfo) => {
                  prog.currentId = fileInfo.messageId;
                  const MT_MIN_FILE_BYTES = 100 * 1024 * 1024; // 100 MB
                  if ((fileInfo.fileSize || 0) < MT_MIN_FILE_BYTES) { prog.skipped++; return; }
                  prog.total++;
                  try {
                    const existing = await storage.getSyncedFileByUniqueId(fileInfo.fileUniqueId);
                    if (existing) { prog.skipped++; return; }
                    const syncedFile = await storage.createSyncedFile({
                      channelId: botApiId,
                      messageId: fileInfo.messageId,
                      fileId: fileInfo.fileId,
                      fileUniqueId: fileInfo.fileUniqueId,
                      fileName: fileInfo.fileName,
                      fileSize: fileInfo.fileSize,
                      mimeType: fileInfo.mimeType,
                    });
                    prog.added++;
                    const { autoAddFromFile } = await import("./auto-add");
                    autoAddFromFile(syncedFile).catch(() => {});
                  } catch (dbErr: any) {
                    prog.failed++;
                    if (prog.errors.length < 20) prog.errors.push(`Msg ${fileInfo.messageId}: ${dbErr.message}`);
                  }
                },
                (current, max) => { prog.currentId = current; prog.maxId = max; }
              );
              // MTProto scan completed — exit the Bot API loop
              break;
            }
            // Deleted / service / non-forwardable message — silently skip
            await new Promise(r => setTimeout(r, 100));
            continue;
          }

          // ── 2. Inspect forwarded message ───────────────────────────────────
          const fwdMsg = fwdData.result;
          if (!fwdMsg) { await new Promise(r => setTimeout(r, 100)); continue; }

          // Always delete the forwarded copy (fire-and-forget)
          fetch(`${apiBase}/deleteMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: binChannel, message_id: fwdMsg.message_id }),
          }).catch(() => {});

          const fwdDoc = fwdMsg.document || fwdMsg.video || fwdMsg.audio || fwdMsg.animation;

          // Not a document — skip without counting as failure
          if (!fwdDoc?.file_id) { await new Promise(r => setTimeout(r, 100)); continue; }

          // ── 3. Save the document (failures here are real failures) ──────────
          const docFileSize = fwdDoc.file_size || 0;
          const MIN_FILE_BYTES = 100 * 1024 * 1024; // 100 MB
          if (docFileSize < MIN_FILE_BYTES) { prog.skipped++; continue; }
          prog.total++;
          try {
            const existing = await storage.getSyncedFileByUniqueId(fwdDoc.file_unique_id);
            if (existing) { prog.skipped++; continue; }

            const rawCaption = fwdMsg.caption?.split('\n')[0]?.trim();
            const rawFileName = fwdDoc.file_name as string | undefined;
            const GENERIC_NAME = /^(video|file|document|audio|animation|default[_.\s-]?name|default|untitled|no[_.\s-]?name|filename|movie|media|unnamed)(\.mp4|\.mkv|\.avi|\.mov|\.ts)?$/i;
            const isGeneric = !rawFileName || GENERIC_NAME.test(rawFileName.trim());
            const { normalizeFileName } = await import("./unicode-normalize");
            const rawName = (rawCaption && rawCaption.length > 2 ? rawCaption : null) || (isGeneric ? null : rawFileName) || rawFileName || `File_${msgId}`;
            const fileName = normalizeFileName(rawName);
            const syncedFile = await storage.createSyncedFile({
              channelId: botApiId,
              messageId: msgId,
              fileId: fwdDoc.file_id,
              fileUniqueId: fwdDoc.file_unique_id,
              fileName,
              fileSize: docFileSize,
              mimeType: fwdDoc.mime_type || "application/octet-stream",
            });
            prog.added++;

            const { autoAddFromFile } = await import("./auto-add");
            autoAddFromFile(syncedFile).catch(() => {});
          } catch (dbErr: any) {
            // Only real failures: could not save a found document
            prog.failed++;
            if (prog.errors.length < 20) prog.errors.push(`Msg ${msgId}: ${dbErr.message}`);
          }

          // ~10 req/s — stays well under Telegram Bot API flood limits
          await new Promise(r => setTimeout(r, 100));
        }

        const finalMsg = prog.message || `Scan complete: ${prog.added} added, ${prog.skipped} skipped, ${prog.failed} failed. (${scanned} IDs checked)`;
        prog.status = "done";
        prog.message = finalMsg;
        console.log(`[scan-history] "${channel.name}": ${finalMsg}`);
      } catch (err: any) {
        prog.status = "error";
        prog.message = err.message;
        console.error("[scan-history] Error:", err);
      }
    })();
  });

  // Ads
  app.get(api.ads.list.path, async (req, res) => {
    const ads = await storage.getAds();
    res.json(ads);
  });

  app.post(api.ads.create.path, async (req, res) => {
    const ad = await storage.createAd(req.body);
    res.status(201).json(ad);
  });

  app.get(api.ads.serve.path, async (req, res) => {
    const ad = await storage.getRandomAd();
    res.json(ad || null);
  });

  app.get("/api/ads/fullscreen", async (req, res) => {
    const ad = await storage.getRandomFullscreenAd();
    res.json(ad || null);
  });

  // Public: support config (admin telegram username + packages)
  app.get("/api/support/config", async (_req, res) => {
    const s = await storage.getSettings();
    res.json({
      adminTelegramUsername: s?.adminTelegramUsername || null,
      supportPackages: s?.supportPackages || [],
    });
  });

  app.post(api.ads.impression.path, async (req, res) => {
    await storage.incrementAdImpressions(Number(req.params.id));
    res.json({ success: true });
  });

  app.delete('/api/ads/:id', async (req, res) => {
    await storage.deleteAd(Number(req.params.id));
    res.status(204).send();
  });

  app.get("/api/episodes/:id", async (req, res) => {
    const episode = await storage.getEpisode(Number(req.params.id));
    if (!episode) return res.status(404).json({ message: "Episode not found" });
    res.json(episode);
  });

  app.put("/api/episodes/:id", async (req, res) => {
    try {
      const updated = await storage.updateEpisode(Number(req.params.id), req.body);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/episodes/:id", async (req, res) => {
    await storage.deleteEpisode(Number(req.params.id));
    res.status(204).send();
  });

  // Stats
  app.get(api.stats.dashboard.path, async (req, res) => {
    const cacheKey = "admin:dashboard-stats";
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);
    const [stats, userStats] = await Promise.all([
      storage.getDashboardStats(),
      storage.getUserStats(),
    ]);
    const result = { ...stats, totalUsers: userStats.totalUsers };
    setCache(cacheKey, result, 60 * 1000); // cache for 60 seconds
    res.json(result);
  });

  // Admin: daily/monthly view stats for charts
  app.get("/api/admin/view-stats", async (req, res) => {
    const period = (req.query.period as string) || "7d";
    const days = period === "30d" ? 30 : 7;
    const cacheKey = `admin:view-stats:${days}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);
    const data = await storage.getViewStats(days);
    setCache(cacheKey, data, 5 * 60 * 1000); // cache for 5 minutes
    res.json(data);
  });

  // Admin: live server stats
  let _prevCpu: { idle: number; total: number } | null = null;
  let _reqCount = 0;
  let _reqWindow: number[] = [];
  let _latencyWindow: number[] = [];

  // Middleware to track request rate and latency
  app.use((req, res, next) => {
    const start = Date.now();
    _reqCount++;
    const now = Date.now();
    _reqWindow.push(now);
    // Keep only last 60 seconds
    _reqWindow = _reqWindow.filter(t => now - t < 60000);
    res.on("finish", () => {
      const ms = Date.now() - start;
      _latencyWindow.push(ms);
      if (_latencyWindow.length > 200) _latencyWindow.shift();
    });
    next();
  });

  function getCpuTick() {
    const cpus = os.cpus();
    let idle = 0, total = 0;
    for (const cpu of cpus) {
      for (const v of Object.values(cpu.times)) idle += (cpu.times as any).idle, total += v;
      idle -= (cpu.times as any).idle; // undo extra idle add
      idle += cpu.times.idle;         // add idle once
    }
    return { idle: idle / cpus.length, total: total / cpus.length };
  }
  app.get("/api/admin/server-stats", async (_req, res) => {
    const cur = getCpuTick();
    let cpuPercent = 0;
    if (_prevCpu) {
      const idleDiff = cur.idle - _prevCpu.idle;
      const totalDiff = cur.total - _prevCpu.total;
      cpuPercent = totalDiff > 0 ? Math.round(100 - (100 * idleDiff / totalDiff)) : 0;
      cpuPercent = Math.max(0, Math.min(100, cpuPercent));
    }
    _prevCpu = cur;
    const totalMem = os.totalmem();
    const mem = process.memoryUsage();

    // On Linux, use /proc/meminfo for accurate available RAM.
    // os.freemem() only counts truly-free pages; Linux fills spare RAM with
    // page cache so freemem() always looks artificially low.
    // MemAvailable = free + reclaimable cache — what can actually be used.
    let availableMem = os.freemem();
    try {
      if (os.platform() === "linux") {
        const meminfo = await fs.promises.readFile("/proc/meminfo", "utf8");
        const match = meminfo.match(/^MemAvailable:\s+(\d+)\s+kB/m);
        if (match) availableMem = parseInt(match[1]) * 1024;
      }
    } catch { /* fallback to os.freemem() */ }
    const usedMem = totalMem - availableMem;

    const now = Date.now();
    _reqWindow = _reqWindow.filter(t => now - t < 60000);
    const reqPerMin = _reqWindow.length;
    const avgLatency = _latencyWindow.length > 0
      ? Math.round(_latencyWindow.reduce((a, b) => a + b, 0) / _latencyWindow.length)
      : 0;
    const p95Latency = _latencyWindow.length > 0
      ? Math.round([..._latencyWindow].sort((a, b) => a - b)[Math.floor(_latencyWindow.length * 0.95)])
      : 0;

    res.json({
      cpu: cpuPercent,
      cpuCores: os.cpus().length,
      ramUsed: Math.round(usedMem / 1024 / 1024),
      ramTotal: Math.round(totalMem / 1024 / 1024),
      ramPercent: Math.round((usedMem / totalMem) * 100),
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
      heapSizeLimit: Math.round(v8.getHeapStatistics().heap_size_limit / 1024 / 1024),
      rss: Math.round(mem.rss / 1024 / 1024),
      uptime: Math.round(os.uptime()),
      processUptime: Math.round(process.uptime()),
      platform: os.platform(),
      hostname: os.hostname(),
      loadAvg: os.loadavg().map(v => Math.round(v * 100) / 100),
      reqPerMin,
      totalRequests: _reqCount,
      avgLatency,
      p95Latency,
    });
  });

  // Admin: RAM / temp-file cleanup
  app.post("/api/admin/cleanup", requireAdmin, async (_req, res) => {
    const beforeMem = process.memoryUsage();
    const beforeHeapMB = Math.round(beforeMem.heapUsed / 1024 / 1024);

    // 1. Clear in-memory API cache
    const cacheCleared = clearAllCache();

    // 2. Delete temp files in system /tmp that belong to this process (stream chunks, etc.)
    let tempFilesDeleted = 0;
    let tempBytesFreed = 0;
    try {
      const tmpDir = os.tmpdir();
      const files = fs.readdirSync(tmpDir);
      for (const file of files) {
        // Only delete files that look like our temp stream/chunk files
        if (/^(hls-|chunk-|stream-|tg-|mv-tmp-)/.test(file)) {
          try {
            const filePath = `${tmpDir}/${file}`;
            const stat = fs.statSync(filePath);
            tempBytesFreed += stat.size;
            fs.unlinkSync(filePath);
            tempFilesDeleted++;
          } catch { /* skip locked files */ }
        }
      }
    } catch { /* tmpdir not accessible */ }

    // 3. Trigger GC if available (needs --expose-gc flag)
    let gcRan = false;
    if (typeof (global as any).gc === "function") {
      (global as any).gc();
      gcRan = true;
    }

    // Short wait so GC + OS can reclaim memory before we measure
    await new Promise(r => setTimeout(r, 200));

    const afterMem = process.memoryUsage();
    const afterHeapMB = Math.round(afterMem.heapUsed / 1024 / 1024);
    const freedMB = Math.max(0, beforeHeapMB - afterHeapMB);

    console.log(`[Cleanup] Cache cleared: ${cacheCleared} entries | Temp files: ${tempFilesDeleted} | Heap freed: ${freedMB} MB | GC: ${gcRan}`);

    res.json({
      success: true,
      cacheCleared,
      tempFilesDeleted,
      tempBytesFreed: Math.round(tempBytesFreed / 1024),
      heapBefore: beforeHeapMB,
      heapAfter: afterHeapMB,
      freedMB,
      gcRan,
    });
  });

  // Admin: get current database URL (masked)
  app.get("/api/admin/database-url", requireAdmin, (_req, res) => {
    const url = process.env.DATABASE_URL || "";
    const masked = url ? url.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:****@") : "";
    res.json({ url: masked, isOverride: fs.existsSync(path.resolve(".db-override.json")) });
  });

  // Admin: set a new database URL — writes override file and restarts
  app.post("/api/admin/database-url", requireAdmin, async (req, res) => {
    const { databaseUrl } = req.body as { databaseUrl?: string };
    if (!databaseUrl?.trim()) {
      return res.status(400).json({ message: "databaseUrl is required" });
    }
    // Quick connectivity test before saving
    const testPool = new pg.Pool({ connectionString: databaseUrl.trim(), connectionTimeoutMillis: 5000 });
    try {
      const client = await testPool.connect();
      client.release();
      await testPool.end();
    } catch (err: any) {
      return res.status(422).json({ message: `Cannot connect to new database: ${err?.message}` });
    }
    // Save override file
    fs.writeFileSync(path.resolve(".db-override.json"), JSON.stringify({ DATABASE_URL: databaseUrl.trim() }, null, 2));
    res.json({ success: true, message: "Database URL saved. Server is restarting…" });
    // Restart after responding so the client gets the response
    setTimeout(() => process.exit(0), 500);
  });

  // Admin: remove the database URL override (revert to env var)
  app.delete("/api/admin/database-url", requireAdmin, (_req, res) => {
    const p = path.resolve(".db-override.json");
    if (fs.existsSync(p)) fs.unlinkSync(p);
    res.json({ success: true, message: "Override removed. Server is restarting…" });
    setTimeout(() => process.exit(0), 500);
  });

  // Admin: episode gap checker — find series with missing/un-uploaded episodes
  app.get("/api/admin/episode-gaps", async (_req, res) => {
    try {
      const cacheKey = "admin:episode-gaps";
      const cached = getCached(cacheKey);
      if (cached) return res.json(cached);

      const today = new Date().toISOString().slice(0, 10);

      // Get all episodes grouped by movie
      const allEps = await db.select().from(episodes).orderBy(episodes.movieId, episodes.seasonNumber, episodes.episodeNumber);
      const allSeries = await db.select({ id: movies.id, title: movies.title, posterPath: movies.posterPath, tmdbId: movies.tmdbId, status: movies.status })
        .from(movies).where(sql`type = 'series'`);

      const seriesMap = new Map(allSeries.map(s => [s.id, s]));
      const epsByMovie = new Map<number, typeof allEps>();
      for (const ep of allEps) {
        if (!epsByMovie.has(ep.movieId)) epsByMovie.set(ep.movieId, []);
        epsByMovie.get(ep.movieId)!.push(ep);
      }

      const result = [];
      for (const [movieId, eps] of epsByMovie) {
        const series = seriesMap.get(movieId);
        if (!series) continue;

        // Group by season
        const seasonMap = new Map<number, {
          uploaded: number[];
          noFile: number[];        // has metadata, no file, but aired
          upcoming: number[];      // has metadata, no file, NOT yet aired
          gapsInRange: number[];
          missing: number[];
          total: number;
          totalReleased: number;
        }>();

        for (const ep of eps) {
          if (!seasonMap.has(ep.seasonNumber)) {
            seasonMap.set(ep.seasonNumber, { uploaded: [], noFile: [], upcoming: [], gapsInRange: [], missing: [], total: 0, totalReleased: 0 });
          }
          const s = seasonMap.get(ep.seasonNumber)!;
          const hasFile = ep.fileId && ep.fileId.trim() !== '' && !(ep.fileUniqueId || '').startsWith('tmdb_');
          const isAired = !ep.airDate || ep.airDate <= today;

          if (hasFile) {
            s.uploaded.push(ep.episodeNumber);
          } else if (isAired) {
            s.noFile.push(ep.episodeNumber); // aired but no file = truly missing
          } else {
            s.upcoming.push(ep.episodeNumber); // not yet aired = upcoming
          }
        }

        const seasons = [];
        let totalMissing = 0;
        for (const [sNum, data] of seasonMap) {
          const uploaded = data.uploaded.sort((a, b) => a - b);
          const noFile = data.noFile.sort((a, b) => a - b);
          const upcoming = data.upcoming.sort((a, b) => a - b);

          // Determine max aired episode (uploaded + noFile aired, exclude upcoming)
          const airedNums = [...uploaded, ...noFile].sort((a, b) => a - b);
          const maxReleased = airedNums.length ? airedNums[airedNums.length - 1] : 0;

          // Total range (including upcoming) for display
          const allNums = [...uploaded, ...noFile, ...upcoming].sort((a, b) => a - b);
          const maxEp = allNums.length ? allNums[allNums.length - 1] : 0;

          // Gaps = episode numbers within aired range not in DB at all
          const inDb = new Set(allNums);
          const gapsInRange = maxReleased > 0
            ? Array.from({ length: maxReleased }, (_, i) => i + 1).filter(n => !inDb.has(n))
            : [];

          // Missing = aired with no file + gaps within aired range
          const missing = [...noFile, ...gapsInRange].sort((a, b) => a - b);
          totalMissing += missing.length;

          seasons.push({
            season: sNum,
            uploaded,
            noFile,
            upcoming,
            gapsInRange,
            missing,
            total: maxEp,
            totalReleased: maxReleased,
          });
        }

        if (totalMissing > 0) {
          result.push({
            id: movieId,
            title: series.title,
            posterPath: series.posterPath,
            tmdbId: series.tmdbId,
            status: series.status,
            seasons: seasons.sort((a, b) => a.season - b.season),
            totalMissing,
          });
        }
      }

      result.sort((a, b) => b.totalMissing - a.totalMissing);
      setCache(cacheKey, result, 5 * 60 * 1000); // cache for 5 minutes
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Admin: users list with detail
  app.get("/api/admin/users", async (req, res) => {
    const allUsers = await storage.getUsers();
    res.json(allUsers);
  });

  // Import users from JSON backup — adds new, updates existing, never deletes
  app.post("/api/admin/users/import", requireAdmin, async (req, res) => {
    const { users: incoming } = req.body as { users?: unknown[] };
    if (!Array.isArray(incoming) || incoming.length === 0) {
      return res.status(400).json({ message: "Body must be { users: [...] } with at least one entry" });
    }

    let added = 0, updated = 0, skipped = 0;

    for (const raw of incoming) {
      const u = raw as Record<string, unknown>;
      const telegramId = String(u.telegramId ?? u.telegram_id ?? "").trim();
      if (!telegramId) { skipped++; continue; }

      const username = u.username ? String(u.username) : null;
      const firstName = u.firstName ?? u.first_name ? String(u.firstName ?? u.first_name) : null;
      const isAdmin = Boolean(u.isAdmin ?? u.is_admin ?? false);
      const joinedAt = u.joinedAt ?? u.joined_at ?? new Date().toISOString();
      const lastActive = u.lastActive ?? u.last_active ?? new Date().toISOString();

      try {
        const { rows } = await pool.query(
          `INSERT INTO users (telegram_id, username, first_name, is_admin, joined_at, last_active)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (telegram_id) DO UPDATE SET
             username   = EXCLUDED.username,
             first_name = EXCLUDED.first_name,
             last_active = GREATEST(users.last_active, EXCLUDED.last_active)
           RETURNING (xmax = 0) AS inserted`,
          [telegramId, username, firstName, isAdmin, joinedAt, lastActive]
        );
        if (rows[0]?.inserted) added++; else updated++;
      } catch { skipped++; }
    }

    invalidatePrefix("users");
    console.log(`[UserImport] added=${added} updated=${updated} skipped=${skipped}`);
    res.json({ success: true, added, updated, skipped, total: incoming.length });
  });

  // ─── Auth Routes ─────────────────────────────────────────────────────────
  app.get("/api/admin/auth/me", (req, res) => {
    if (req.session?.isAdmin) {
      return res.json({ authenticated: true });
    }
    res.status(401).json({ authenticated: false });
  });

  app.post("/api/admin/logout", (req, res) => {
    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      res.json({ success: true });
    });
  });

  app.post(api.settings.login.path, async (req, res) => {
    const { username, password } = req.body;
    const dbSettings = await storage.getSettings();
    const validUser = dbSettings ? dbSettings.adminUsername : "admin";
    const validPass = dbSettings?.adminPassword || "admin123";

    if (username === validUser && password === validPass) {
      req.session.isAdmin = true;
      return req.session.save((err) => {
        if (err) return res.status(500).json({ success: false, message: "Session error" });
        res.json({ success: true, message: "Logged in" });
      });
    }
    res.status(401).json({ success: false, message: "Invalid username or password" });
  });

  app.get(api.settings.get.path, async (req, res) => {
    const settings = await storage.getSettings();
    res.json(settings || { adminUsername: "admin", adminPassword: "admin123", isSetup: false });
  });

  app.post(api.settings.update.path, async (req, res) => {
    const settings = await storage.updateSettings(req.body);
    // Restart bot with new token if it was updated
    if (req.body.botToken) {
      startBot().catch(console.error);
    }
    // Reinitialize Telegram backup if those settings changed
    if (
      req.body.telegramBackupChannelId !== undefined ||
      req.body.telegramAutoDbBackupEnabled !== undefined
    ) {
      if (settings?.telegramAutoDbBackupEnabled && settings?.telegramBackupChannelId && settings?.botToken) {
        initializeTelegramBackup().catch(console.error);
      }
    }
    res.json(settings);
  });

  // ── Built-in Telegram File Streaming ─────────────────────────────────────
  // Public route — hash validates access (no login required)
  // GET /stream/:fileId?hash=<md5(fileId)[:hashLength]>
  app.get("/stream/:fileId", async (req: Request, res: Response) => {
    try {
      const { fileId } = req.params;
      const { hash } = req.query as { hash?: string };

      const cfg = await storage.getSettings();
      const botToken = cfg?.botToken || process.env.TELEGRAM_BOT_TOKEN;
      const hashLength = cfg?.fsbHashLength ?? 6;

      if (!botToken) {
        return res.status(503).send("Bot token not configured on this server.");
      }

      // Validate hash — MD5(fileId).substring(0, hashLength)
      const expectedHash = crypto.createHash("md5").update(fileId).digest("hex").substring(0, hashLength);
      if (!hash || hash !== expectedHash) {
        return res.status(403).send("Access denied: invalid or missing hash.");
      }

      // Ask Telegram for the file's download path
      const getFileRes = await fetch(
        `https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`
      );
      const fileData = (await getFileRes.json()) as any;

      if (!fileData.ok || !fileData.result?.file_path) {
        return res
          .status(404)
          .send(
            fileData.description ||
            "File not found. Note: Telegram Bot API only supports files up to 20 MB. Larger files require MTProto (TG-FileStreamBot)."
          );
      }

      const downloadUrl = `https://api.telegram.org/file/bot${botToken}/${fileData.result.file_path}`;

      // Forward optional Range header from browser (needed for video seeking)
      const fetchHeaders: Record<string, string> = {};
      if (req.headers.range) fetchHeaders["Range"] = req.headers.range;

      const tgRes = await fetch(downloadUrl, { headers: fetchHeaders });

      // Set response headers
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Accept-Ranges", "bytes");
      const ct = tgRes.headers.get("Content-Type");
      if (ct) res.setHeader("Content-Type", ct);
      const cl = tgRes.headers.get("Content-Length");
      if (cl) res.setHeader("Content-Length", cl);
      const cr = tgRes.headers.get("Content-Range");
      if (cr) res.setHeader("Content-Range", cr);
      res.setHeader("Content-Disposition", "inline");

      res.status(req.headers.range ? 206 : tgRes.status);

      if (tgRes.body) {
        Readable.fromWeb(tgRes.body as any).pipe(res);
      } else {
        res.end();
      }
    } catch (e: any) {
      if (!res.headersSent) res.status(500).send(e.message);
    }
  });

  // ── FileStreamBot Routes ──────────────────────────────────────────────────
  // Test connectivity to configured FSB instance
  app.get("/api/admin/fsb/test", requireAdmin, async (_req, res) => {
    try {
      const cfg = await storage.getSettings();
      if (!cfg?.fsbBaseUrl) return res.status(400).json({ ok: false, message: "FSB base URL not configured" });
      const url = cfg.fsbBaseUrl.replace(/\/$/, "");
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const r = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);
        res.json({ ok: true, status: r.status, message: `Reachable (HTTP ${r.status})` });
      } catch (e: any) {
        clearTimeout(timeout);
        res.json({ ok: false, message: e.name === "AbortError" ? "Timeout — server did not respond in 5s" : e.message });
      }
    } catch (e: any) {
      res.status(500).json({ ok: false, message: e.message });
    }
  });

  // Get all movies with their stream URL status for FSB management
  app.get("/api/admin/fsb/movies", requireAdmin, async (req, res) => {
    try {
      const { page = "1", search = "", filter = "all" } = req.query as Record<string, string>;
      const pageNum = parseInt(page) || 1;
      const limit = 50;
      const offset = (pageNum - 1) * limit;
      const { db } = await import("./db");
      const { movies: moviesTable } = await import("../shared/schema");
      const { ilike, or, isNull, isNotNull, sql: drizzleSql } = await import("drizzle-orm");
      let query = db.select({
        id: moviesTable.id,
        title: moviesTable.title,
        type: moviesTable.type,
        quality: moviesTable.quality,
        posterPath: moviesTable.posterPath,
        streamUrl: moviesTable.streamUrl,
        fileId: moviesTable.fileId,
        fileSize: moviesTable.fileSize,
      }).from(moviesTable);
      const conditions: any[] = [];
      if (search) conditions.push(ilike(moviesTable.title, `%${search}%`));
      if (filter === "linked") conditions.push(isNotNull(moviesTable.streamUrl));
      if (filter === "unlinked") conditions.push(isNull(moviesTable.streamUrl));
      const allRows = conditions.length > 0
        ? await query.where(conditions.length === 1 ? conditions[0] : drizzleSql`${conditions[0]} AND ${conditions[1]}`)
        : await query;
      const total = allRows.length;
      const items = allRows.slice(offset, offset + limit);
      res.json({ items, total, page: pageNum, totalPages: Math.ceil(total / limit) });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Get episodes for a series with their stream URL status
  app.get("/api/admin/fsb/series/:id/episodes", requireAdmin, async (req, res) => {
    try {
      const movieId = Number(req.params.id);
      const eps = await storage.getEpisodes(movieId);
      res.json(eps);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Set stream URL for a movie
  app.patch("/api/admin/movies/:id/stream-url", requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { streamUrl } = req.body;
      const updated = await storage.updateMovie(id, { streamUrl: streamUrl || null } as any);
      if (!updated) return res.status(404).json({ message: "Movie not found" });
      invalidatePrefix("movies:");
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Set stream URL for an episode
  app.patch("/api/admin/episodes/:id/stream-url", requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { streamUrl } = req.body;
      const updated = await storage.updateEpisode(id, { streamUrl: streamUrl || null } as any);
      if (!updated) return res.status(404).json({ message: "Episode not found" });
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Bulk set stream URLs for movies (array of {id, streamUrl})
  app.post("/api/admin/fsb/bulk-update", requireAdmin, async (req, res) => {
    try {
      const { updates } = req.body as { updates: { id: number; streamUrl: string | null }[] };
      if (!Array.isArray(updates)) return res.status(400).json({ message: "updates must be an array" });
      const results = await Promise.allSettled(
        updates.map(({ id, streamUrl }) => storage.updateMovie(id, { streamUrl: streamUrl || null } as any))
      );
      const succeeded = results.filter(r => r.status === "fulfilled").length;
      invalidatePrefix("movies:");
      res.json({ succeeded, failed: results.length - succeeded });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });
  // ─────────────────────────────────────────────────────────────────────────

  app.get("/api/synced-files", async (req, res) => {
    const { search, fileIdSearch, type, listed, dateFrom, dateTo, sort, limit, offset } = req.query as Record<string, string>;
    const result = await storage.getSyncedFiles({
      search,
      fileIdSearch,
      type: type as "movie" | "series" | undefined,
      listed: listed as "listed" | "not_listed" | undefined,
      dateFrom,
      dateTo,
      sort: sort as "az" | "za" | undefined,
      limit: limit ? parseInt(limit) : 200,
      offset: offset ? parseInt(offset) : 0,
    });
    res.json(result);
  });

  app.delete("/api/synced-files/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    await storage.deleteSyncedFile(id);
    res.json({ success: true });
  });

  app.patch("/api/synced-files/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const { fileName } = req.body;
    if (!fileName || typeof fileName !== "string" || !fileName.trim()) {
      return res.status(400).json({ message: "fileName is required" });
    }
    const { normalizeFileName } = await import("./unicode-normalize");
    const updated = await storage.updateSyncedFileName(id, normalizeFileName(fileName.trim()));
    if (!updated) return res.status(404).json({ message: "File not found" });
    res.json(updated);
  });

  // Refresh fileId + fileUniqueId from source channel via Bot API forwardMessage
  app.post("/api/synced-files/:id/refresh-ids", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });

      const file = await storage.getSyncedFileById(id);
      if (!file) return res.status(404).json({ message: "File not found" });

      const cfg = await storage.getSettings();
      const token = cfg?.botToken || process.env.TELEGRAM_BOT_TOKEN;
      if (!token) return res.status(503).json({ message: "Bot token not configured" });

      const binChannel = cfg?.fsbBinChannel;
      if (!binChannel) {
        return res.status(422).json({ message: "FSB Bin Channel is not configured. Please set it in FileStreamBot settings so the bot has a channel to use for refreshing file IDs." });
      }

      if (!file.channelId || !file.messageId) {
        return res.status(422).json({ message: "File has no source channel/message info — cannot refresh from source." });
      }

      const apiBase = `https://api.telegram.org/bot${token}`;

      // Forward the original message from source channel to bin channel.
      // This uses the permanent channelId + messageId (never expire) to get a fresh file_id.
      const fwdRes = await fetch(`${apiBase}/forwardMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: binChannel,
          from_chat_id: file.channelId,
          message_id: file.messageId,
          disable_notification: true,
        }),
      });
      const fwdData: any = await fwdRes.json();
      if (!fwdData.ok) {
        return res.status(502).json({ message: `Telegram forwardMessage failed: ${fwdData.description || JSON.stringify(fwdData)}` });
      }

      const fwdMsg = fwdData.result;
      const doc = fwdMsg.document || fwdMsg.video || fwdMsg.audio || fwdMsg.animation;
      if (!doc?.file_id) {
        return res.status(422).json({ message: "Forwarded message has no document — cannot extract file ID." });
      }

      const freshFileId: string = doc.file_id;
      const freshFileUniqueId: string = doc.file_unique_id;

      // Delete the forwarded copy (best-effort cleanup)
      fetch(`${apiBase}/deleteMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: binChannel, message_id: fwdMsg.message_id }),
      }).catch(() => {});

      const updated = await storage.updateSyncedFileIds(id, freshFileId, freshFileUniqueId);
      res.json({ success: true, file: updated });
    } catch (err: any) {
      console.error("[refresh-ids]", err);
      res.status(500).json({ message: err?.message || "Failed to refresh file IDs" });
    }
  });

  // Bulk refresh all synced file IDs from source channel via Bot API forwardMessage
  app.post("/api/synced-files/refresh-all-ids", async (req, res) => {
    try {
      const cfg = await storage.getSettings();
      const token = cfg?.botToken || process.env.TELEGRAM_BOT_TOKEN;
      if (!token) return res.status(503).json({ message: "Bot token not configured" });

      const binChannel = cfg?.fsbBinChannel;
      if (!binChannel) {
        return res.status(422).json({ message: "FSB Bin Channel is not configured. Please set it in FileStreamBot settings." });
      }

      const apiBase = `https://api.telegram.org/bot${token}`;

      let success = 0;
      let failed = 0;
      const errors: string[] = [];

      // Process in batches of 500 to avoid loading 100K rows into memory at once
      const BATCH_SIZE = 500;
      let offset = 0;
      let hasMore = true;
      while (hasMore) {
        const { items: allFiles, total } = await storage.getSyncedFiles({ limit: BATCH_SIZE, offset });
        hasMore = offset + allFiles.length < total;
        offset += allFiles.length;

      for (const file of allFiles) {
        try {
          if (!file.channelId || !file.messageId) {
            failed++;
            errors.push(`#${file.id}: No source channel/message info`);
            continue;
          }
          // Forward from source channel using permanent channelId + messageId
          const fwdRes = await fetch(`${apiBase}/forwardMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: binChannel,
              from_chat_id: file.channelId,
              message_id: file.messageId,
              disable_notification: true,
            }),
          });
          const fwdData: any = await fwdRes.json();
          if (!fwdData.ok) {
            failed++;
            errors.push(`#${file.id}: ${fwdData.description}`);
            continue;
          }
          const fwdMsg = fwdData.result;
          const doc = fwdMsg.document || fwdMsg.video || fwdMsg.audio || fwdMsg.animation;
          if (doc?.file_id) {
            await storage.updateSyncedFileIds(file.id, doc.file_id, doc.file_unique_id);
            success++;
            // Delete the forwarded copy (best-effort)
            fetch(`${apiBase}/deleteMessage`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ chat_id: binChannel, message_id: fwdMsg.message_id }),
            }).catch(() => {});
          } else {
            failed++;
          }
          // Rate-limit: 30 messages/second max — wait 50ms between sends
          await new Promise(r => setTimeout(r, 50));
        } catch {
          failed++;
        }
      }
      } // end while batch

      res.json({ success: true, refreshed: success, failed, errors: errors.slice(0, 20) });
    } catch (err: any) {
      console.error("[refresh-all-ids]", err);
      res.status(500).json({ message: err?.message || "Failed to refresh file IDs" });
    }
  });

  // Auto-add movie OR series from synced file name using TMDB
  app.post("/api/synced-files/:id/auto-add-movie", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const file = await storage.getSyncedFileById(id);
      if (!file) return res.status(404).json({ message: "File not found" });

      const settings = await storage.getSettings();
      if (!settings?.tmdbApiKey) return res.status(400).json({ message: "TMDB API key not configured in settings" });

      // Detect whether this is a series or a movie
      const parsedSeries = parseSeriesFileName(file.fileName);
      const parsedMovie = parseMovieFileName(file.fileName);
      if (!parsedSeries && !parsedMovie) {
        return res.status(400).json({ message: "Could not parse title from filename" });
      }

      const result = await autoAddFromFile(file, true);
      if (!result.ok) return res.status(500).json({ message: result.error });
      if (!result.created) {
        const title = parsedSeries?.title ?? parsedMovie?.title;
        return res.status(404).json({ message: `No TMDB result found for: ${title}`, reason: result.reason });
      }

      res.status(201).json({
        movie: result.movie,
        episode: (result as any).episode ?? undefined,
        type: (result as any).type,
        parsed: parsedSeries ?? parsedMovie,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Remove duplicate synced files (same fileName, keep newest) — pure SQL, no full table scan in JS
  app.post("/api/synced-files/remove-duplicates", async (_req, res) => {
    try {
      const result = await db.execute(sql`
        DELETE FROM synced_files
        WHERE id NOT IN (
          SELECT MAX(id)
          FROM synced_files
          GROUP BY LOWER(TRIM(COALESCE(file_name, '')))
        )
      `);
      const removed = (result as any).rowCount ?? 0;
      res.json({ removed, message: `Removed ${removed} duplicate file(s).` });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Bulk-fix generic filenames by looking up matching movies/episodes in the library
  app.post("/api/synced-files/fix-names", async (_req, res) => {
    try {
      const { normalizeFileName } = await import("./unicode-normalize");
      const GENERIC_NAME = /^(video|file|document|audio|animation|default[_.\s-]?name|default|untitled|no[_.\s-]?name|filename|movie|media|unnamed|File_\d+)(\.mp4|\.mkv|\.avi|\.mov|\.ts)?$/i;
      const { items: allFiles } = await storage.getSyncedFiles({ limit: 10000 });

      // Build lookup maps from library
      const allMoviesRaw = await db.select({ id: movies.id, title: movies.title, quality: movies.quality, fileUniqueId: movies.fileUniqueId }).from(movies);
      const movieByUniqueId = new Map(allMoviesRaw.filter(m => m.fileUniqueId).map(m => [m.fileUniqueId!, m]));

      const allEpisodesRaw = await db.select({ id: episodes.id, title: episodes.title, seasonNumber: episodes.seasonNumber, episodeNumber: episodes.episodeNumber, fileUniqueId: episodes.fileUniqueId }).from(episodes);
      const epByUniqueId = new Map(allEpisodesRaw.map(e => [e.fileUniqueId, e]));

      let fixed = 0;
      for (const file of allFiles) {
        let newName: string | null = null;
        const isGeneric = !file.fileName || GENERIC_NAME.test(file.fileName.trim());

        if (isGeneric) {
          // Try to get the real name from the library
          const movie = movieByUniqueId.get(file.fileUniqueId);
          if (movie) {
            newName = `${movie.title}${movie.quality ? ` (${movie.quality})` : ""}.mp4`;
          } else {
            const ep = epByUniqueId.get(file.fileUniqueId);
            if (ep) {
              const s = String(ep.seasonNumber ?? 1).padStart(2, "0");
              const e = String(ep.episodeNumber ?? 1).padStart(2, "0");
              newName = `S${s}E${e}${ep.title ? ` - ${ep.title}` : ""}.mp4`;
            }
          }
        } else {
          // Normalize Unicode styled chars (bold, italic, etc.) to plain ASCII
          const normalized = normalizeFileName(file.fileName);
          if (normalized !== file.fileName) newName = normalized;
        }

        if (newName) {
          await storage.updateSyncedFileName(file.id, normalizeFileName(newName));
          fixed++;
        }
      }

      res.json({ fixed, total: allFiles.length, message: `Fixed ${fixed} of ${allFiles.length} filename(s).` });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Remove all synced files that are already listed (exist in movies or episodes)
  app.post("/api/synced-files/remove-listed", async (_req, res) => {
    try {
      const result = await db.delete(syncedFiles).where(
        sql`(
          EXISTS (SELECT 1 FROM movies WHERE movies.file_unique_id = ${syncedFiles.fileUniqueId})
          OR EXISTS (SELECT 1 FROM episodes WHERE episodes.file_unique_id = ${syncedFiles.fileUniqueId})
        )`
      );
      const removed = (result as any).rowCount ?? 0;
      res.json({ removed, message: `Removed ${removed} already-listed file(s) from the queue.` });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Restore synced file entries from existing movies and episodes
  app.post("/api/synced-files/restore-from-library", async (_req, res) => {
    try {
      // Get all existing synced file unique IDs to avoid duplicates
      const existingSynced = await db.select({ fileUniqueId: syncedFiles.fileUniqueId }).from(syncedFiles);
      const existingIds = new Set(existingSynced.map(f => f.fileUniqueId));

      const toInsert: typeof syncedFiles.$inferInsert[] = [];

      // Restore from movies
      const allMovies = await db.select().from(movies);
      for (const movie of allMovies) {
        if (!movie.fileId || !movie.fileUniqueId) continue;
        if (existingIds.has(movie.fileUniqueId)) continue;
        toInsert.push({
          channelId: "restored",
          messageId: 0,
          fileId: movie.fileId,
          fileUniqueId: movie.fileUniqueId,
          fileName: `${movie.title}${movie.quality ? ` (${movie.quality})` : ""}.mp4`,
          fileSize: movie.fileSize,
          mimeType: "video/mp4",
        });
        existingIds.add(movie.fileUniqueId);
      }

      // Restore from episodes (join with movies for title)
      const allEpisodes = await db.select().from(episodes);
      const movieMap = new Map(allMovies.map(m => [m.id, m]));
      for (const ep of allEpisodes) {
        if (!ep.fileId || !ep.fileUniqueId) continue;
        if (existingIds.has(ep.fileUniqueId)) continue;
        const movie = movieMap.get(ep.movieId);
        const title = movie?.title ?? "Unknown Series";
        const s = String(ep.seasonNumber ?? 1).padStart(2, "0");
        const e = String(ep.episodeNumber ?? 1).padStart(2, "0");
        toInsert.push({
          channelId: "restored",
          messageId: 0,
          fileId: ep.fileId,
          fileUniqueId: ep.fileUniqueId,
          fileName: `${title} S${s}E${e}.mp4`,
          fileSize: ep.fileSize,
          mimeType: "video/mp4",
        });
        existingIds.add(ep.fileUniqueId);
      }

      // Insert in batches
      let restored = 0;
      const batchSize = 500;
      for (let i = 0; i < toInsert.length; i += batchSize) {
        await db.insert(syncedFiles).values(toInsert.slice(i, i + batchSize));
        restored += Math.min(batchSize, toInsert.length - i);
      }

      res.json({ restored, message: `Restored ${restored} file(s) from library.` });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Bulk auto-add movies AND series from ALL synced files using TMDB
  app.post("/api/synced-files/bulk-auto-add", async (req, res) => {
    try {
      const settings = await storage.getSettings();
      if (!settings?.tmdbApiKey) {
        return res.status(400).json({ message: "TMDB API key not configured in settings" });
      }

      const { items: allFiles } = await storage.getSyncedFiles({ limit: 10000 });
      const results = { added: 0, skipped: 0, failed: 0, errors: [] as string[], addedTitles: [] as string[] };

      for (const file of allFiles) {
        try {
          const result = await autoAddFromFile(file, true);
          if (!result.ok) {
            results.failed++;
            results.errors.push(`${file.fileName}: ${result.error}`);
          } else if (result.created) {
            results.added++;
            const label = (result as any).type === 'series' && (result as any).episode
              ? `${result.movie.title} S${String((result as any).episode.seasonNumber).padStart(2,'0')}E${String((result as any).episode.episodeNumber).padStart(2,'0')}`
              : result.movie.title;
            results.addedTitles.push(label);
          } else {
            results.skipped++;
          }
          // Small delay to avoid TMDB rate limits
          await new Promise(r => setTimeout(r, 300));
        } catch (e: any) {
          results.failed++;
          results.errors.push(`${file.fileName}: ${e.message}`);
        }
      }

      res.json({
        success: true,
        total: allFiles.length,
        ...results,
        message: `Done: ${results.added} added, ${results.skipped} skipped, ${results.failed} failed`,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Home page sections
  app.get("/api/home/sections", async (req, res) => {
    try {
      const cacheKey = "home:sections";
      const hit = getCached(cacheKey);
      if (hit) {
        console.log(`[Cache] CACHE HIT → ${cacheKey}`);
        res.setHeader("Cache-Control", `public, max-age=${TTL.HOME / 1000}`);
        return res.json(hit);
      }
      console.log(`[Cache] FETCH API → ${cacheKey}`);
      const [latest, topMovies, topSeries, bestView, bollywood, kdrama, recommended, newMovies, newSeries, action, animation, horror, scifi, todayTrending, weeklyTrending] = await Promise.all([
        storage.getMovies({ limit: 12, offset: 0 }).then(r => r.items),
        storage.getMovies({ type: 'movie', limit: 12, offset: 0, sort: 'rating' }).then(r => r.items),
        storage.getMovies({ type: 'series', limit: 12, offset: 0, sort: 'rating' }).then(r => r.items),
        storage.getMovies({ limit: 12, offset: 0, sort: 'views' }).then(r => r.items),
        storage.getMovies({ language: 'hi', limit: 12, offset: 0, sort: 'rating' }).then(r => r.items),
        storage.getMovies({ language: 'ko', limit: 12, offset: 0, sort: 'rating' }).then(r => r.items),
        storage.getMovies({ limit: 12, offset: 0, sort: 'rating' }).then(r => r.items),
        storage.getMovies({ type: 'movie', limit: 12, offset: 0 }).then(r => r.items),
        storage.getMovies({ type: 'series', limit: 12, offset: 0 }).then(r => r.items),
        storage.getMovies({ search: 'action', limit: 12, offset: 0, sort: 'rating' }).then(r => r.items),
        storage.getMovies({ search: 'animation', limit: 12, offset: 0, sort: 'rating' }).then(r => r.items),
        storage.getMovies({ search: 'horror', limit: 12, offset: 0, sort: 'rating' }).then(r => r.items),
        storage.getMovies({ search: 'sci-fi', limit: 12, offset: 0, sort: 'rating' }).then(r => r.items),
        storage.getTrendingByPeriod(1, 12),
        storage.getTrendingByPeriod(7, 12),
      ]);
      const result = { latest, topMovies, topSeries, bestView, bollywood, kdrama, recommended, newMovies, newSeries, action, animation, horror, scifi, todayTrending, weeklyTrending };
      setCache(cacheKey, result, TTL.HOME);
      res.setHeader("Cache-Control", `public, max-age=${TTL.HOME / 1000}`);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Increment movie views + log daily analytics
  app.post("/api/movies/:id/view", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await Promise.all([
        storage.incrementMovieViews(id),
        storage.logDailyView(id),
      ]);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Batch fetch movies by IDs (for watch history)
  app.get("/api/movies/by-ids", async (req, res) => {
    try {
      const idsParam = req.query.ids as string;
      if (!idsParam) return res.json([]);
      const ids = idsParam.split(",").map(Number).filter(n => !isNaN(n) && n > 0);
      const items = await storage.getMoviesByIds(ids);
      res.json(items);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Update movie from TMDB
  app.post("/api/movies/:id/refresh-tmdb", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const movie = await storage.getMovie(id);
      if (!movie || !movie.tmdbId) {
        return res.status(400).json({ message: "Movie has no TMDB ID" });
      }
      const settings = await storage.getSettings();
      if (!settings?.tmdbApiKey) {
        return res.status(400).json({ message: "TMDB API key not configured" });
      }
      const type = movie.type === 'series' ? 'tv' : 'movie';
      const [detailsRes, creditsRes] = await Promise.all([
        fetch(`https://api.themoviedb.org/3/${type}/${movie.tmdbId}?api_key=${settings.tmdbApiKey}`),
        fetch(`https://api.themoviedb.org/3/${type}/${movie.tmdbId}/credits?api_key=${settings.tmdbApiKey}`)
      ]);
      const details = await detailsRes.json() as any;
      const credits = await creditsRes.json() as any;
      const genre = details.genres?.map((g: any) => g.name).join(', ') || movie.genre || '';
      const cast = credits.cast?.slice(0, 5).map((c: any) => c.name) || [];
      const updated = await storage.updateMovie(id, {
        genre,
        originalLanguage: details.original_language || movie.originalLanguage || null,
        cast: cast as any,
        overview: details.overview || movie.overview,
        posterPath: details.poster_path || movie.posterPath,
      });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Bulk refresh TMDB genre + cast for all movies and series
  app.post("/api/movies/refresh-all-tmdb", async (_req, res) => {
    try {
      const settings = await storage.getSettings();
      if (!settings?.tmdbApiKey) {
        return res.status(400).json({ message: "TMDB API key not configured" });
      }
      const { items } = await storage.getMovies({ limit: 9999, offset: 0 });
      const eligible = items.filter(m => m.tmdbId);
      let updated = 0;
      let failed = 0;
      for (const movie of eligible) {
        try {
          const type = movie.type === 'series' ? 'tv' : 'movie';
          const [detailsRes, creditsRes] = await Promise.all([
            fetch(`https://api.themoviedb.org/3/${type}/${movie.tmdbId}?api_key=${settings.tmdbApiKey}`),
            fetch(`https://api.themoviedb.org/3/${type}/${movie.tmdbId}/credits?api_key=${settings.tmdbApiKey}`)
          ]);
          if (!detailsRes.ok || !creditsRes.ok) { failed++; continue; }
          const details = await detailsRes.json() as any;
          const credits = await creditsRes.json() as any;
          const genre = details.genres?.map((g: any) => g.name).join(', ') || movie.genre || '';
          const castData = credits.cast?.slice(0, 10).map((c: any) => ({
            name: c.name, character: c.character, profilePath: c.profile_path
          })) || [];
          await storage.updateMovie(movie.id, {
            genre,
            originalLanguage: details.original_language || movie.originalLanguage || null,
            cast: castData as any,
            overview: details.overview || movie.overview,
            posterPath: details.poster_path || movie.posterPath,
            rating: details.vote_average ? Math.round(details.vote_average * 10) : movie.rating,
          });
          updated++;
        } catch {
          failed++;
        }
      }
      invalidatePrefix("movies:");
      invalidatePrefix("home:");
      res.json({ updated, failed, total: eligible.length, message: `Updated ${updated} of ${eligible.length} titles.` });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // File upload endpoint for ads
  app.post("/api/upload", upload.single("file"), (req, res) => {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    const url = `/uploads/${req.file.filename}`;
    res.json({ url, originalName: req.file.originalname, size: req.file.size });
  });

  // ── Splash Screen API ──────────────────────────────────────────────────────
  // Public: get splash config (mode + whether a custom video exists)
  app.get("/api/splash/config", async (_req, res) => {
    try {
      const s = await storage.getSettings();
      res.json({
        alwaysShow: s?.splashAlwaysShow ?? false,
        hasVideo: !!(s?.splashVideoPath && fs.existsSync(s.splashVideoPath)),
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Public: stream the splash video with cache headers
  app.get("/api/splash/video", async (_req, res) => {
    try {
      const s = await storage.getSettings();
      const customPath = s?.splashVideoPath;
      const defaultPath = path.resolve("client/public/splash.mp4");
      const videoPath = customPath && fs.existsSync(customPath) ? customPath : defaultPath;

      if (!fs.existsSync(videoPath)) {
        return res.status(404).json({ message: "No splash video found" });
      }

      res.setHeader("Cache-Control", "public, max-age=86400");
      res.setHeader("Content-Type", "video/mp4");
      res.sendFile(videoPath);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Admin: upload a new splash video
  app.post("/api/admin/splash/upload", memoryUpload.single("video"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      const splashDir = path.resolve("public/splash");
      if (!fs.existsSync(splashDir)) fs.mkdirSync(splashDir, { recursive: true });
      const dest = path.join(splashDir, "splash.mp4");
      fs.writeFileSync(dest, req.file.buffer);
      await storage.updateSettings({ splashVideoPath: dest });
      res.json({ message: "Splash video uploaded", path: dest });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Admin: remove custom splash video (revert to default)
  app.delete("/api/admin/splash/video", async (_req, res) => {
    try {
      const s = await storage.getSettings();
      if (s?.splashVideoPath && fs.existsSync(s.splashVideoPath)) {
        fs.unlinkSync(s.splashVideoPath);
      }
      await storage.updateSettings({ splashVideoPath: null });
      res.json({ message: "Splash video removed" });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Admin: update splash mode (always show / 1 day limit)
  app.post("/api/admin/splash/config", async (req, res) => {
    try {
      const { alwaysShow } = req.body as { alwaysShow: boolean };
      await storage.updateSettings({ splashAlwaysShow: alwaysShow });
      res.json({ alwaysShow });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ── Intro Video API ────────────────────────────────────────────────────────
  // Public: check if an intro video is configured
  app.get("/api/intro/config", async (_req, res) => {
    try {
      const s = await storage.getSettings();
      res.json({
        hasVideo: !!(s?.introVideoPath && fs.existsSync(s.introVideoPath)),
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Public: stream the intro video
  app.get("/api/intro/video", async (_req, res) => {
    try {
      const s = await storage.getSettings();
      const videoPath = s?.introVideoPath;
      if (!videoPath || !fs.existsSync(videoPath)) {
        return res.status(404).json({ message: "No intro video configured" });
      }
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.setHeader("Content-Type", "video/mp4");
      res.sendFile(videoPath);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Admin: upload intro video
  app.post("/api/admin/intro/upload", memoryUpload.single("video"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      const introDir = path.resolve("public/intro");
      if (!fs.existsSync(introDir)) fs.mkdirSync(introDir, { recursive: true });
      const dest = path.join(introDir, "intro.mp4");
      fs.writeFileSync(dest, req.file.buffer);
      await storage.updateSettings({ introVideoPath: dest });
      res.json({ message: "Intro video uploaded", path: dest });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Admin: remove intro video
  app.delete("/api/admin/intro/video", async (_req, res) => {
    try {
      const s = await storage.getSettings();
      if (s?.introVideoPath && fs.existsSync(s.introVideoPath)) {
        fs.unlinkSync(s.introVideoPath);
      }
      await storage.updateSettings({ introVideoPath: null });
      res.json({ message: "Intro video removed" });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ── Mascot API ─────────────────────────────────────────────────────────────
  // Public: frontend reads these to know if mascot is on/off and which files to use
  app.get("/api/mascot/settings", async (_req, res) => {
    try {
      const s = await storage.getMascotSettings();
      res.json(s);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Admin: update mascot settings (toggle, interval, duration)
  app.post("/api/admin/mascot/settings", async (req, res) => {
    try {
      const { enabled, intervalSeconds, showDurationSeconds, files } = req.body;
      const updated = await storage.updateMascotSettings({
        ...(enabled !== undefined && { enabled }),
        ...(intervalSeconds !== undefined && { intervalSeconds: Number(intervalSeconds) }),
        ...(showDurationSeconds !== undefined && { showDurationSeconds: Number(showDurationSeconds) }),
        ...(files !== undefined && { files }),
      });
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Admin: upload a new .lottie file
  app.post("/api/admin/mascot/upload", lottieUpload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      const filename = req.file.filename;
      // Append to the files list in mascot settings
      const current = await storage.getMascotSettings();
      const existingFiles: string[] = (current.files as string[]) || [];
      if (!existingFiles.includes(filename)) {
        await storage.updateMascotSettings({ files: [...existingFiles, filename] });
      }
      res.json({ filename, url: `/lottie/${filename}` });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Admin: list all .lottie files on disk
  app.get("/api/admin/mascot/files", (_req, res) => {
    try {
      const files = fs.readdirSync(lottieDir)
        .filter(f => f.endsWith(".lottie"))
        .map(f => ({
          filename: f,
          url: `/lottie/${f}`,
          size: fs.statSync(path.join(lottieDir, f)).size,
        }));
      res.json(files);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Admin: delete a .lottie file
  app.delete("/api/admin/mascot/files/:filename", async (req, res) => {
    try {
      const filename = req.params.filename;
      if (!filename.endsWith(".lottie")) return res.status(400).json({ message: "Invalid file" });
      const filePath = path.join(lottieDir, filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      // Also remove from settings files list
      const current = await storage.getMascotSettings();
      const filtered = ((current.files as string[]) || []).filter(f => f !== filename);
      await storage.updateMascotSettings({ files: filtered });
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Movie trailer from TMDB
  app.get("/api/movies/:id/trailer", async (req, res) => {
    try {
      const movie = await storage.getMovie(Number(req.params.id));
      if (!movie || !movie.tmdbId) return res.json(null);
      const settings = await storage.getSettings();
      if (!settings?.tmdbApiKey) return res.json(null);
      const type = movie.type === 'series' ? 'tv' : 'movie';
      const vidRes = await fetch(`https://api.themoviedb.org/3/${type}/${movie.tmdbId}/videos?api_key=${settings.tmdbApiKey}`);
      if (!vidRes.ok) return res.json(null);
      const vidData = await vidRes.json() as any;
      const trailer = (vidData.results || []).find((v: any) => v.type === 'Trailer' && v.site === 'YouTube') ||
                      (vidData.results || [])[0];
      res.json(trailer ? { key: trailer.key, site: trailer.site, name: trailer.name } : null);
    } catch (err) {
      res.json(null);
    }
  });

  const XNXX_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Referer": "https://www.xnxx.com/",
  };

  // HLS / MP4 proxy — bypasses CORS for XNXX CDN streams and proxies internal HLS paths
  app.get("/api/proxy/stream", async (req, res) => {
    try {
      const rawUrl = req.query.url as string;
      if (!rawUrl) return res.status(400).send("Missing url");

      const decoded = decodeURIComponent(rawUrl);

      // Allow internal API paths (e.g. /api/hls/…) — proxy from localhost
      if (decoded.startsWith("/")) {
        const port = process.env.PORT || "5000";
        const localUrl = `http://127.0.0.1:${port}${decoded}`;
        const upstream = await fetch(localUrl);
        res.set("Access-Control-Allow-Origin", "*");
        const ct = upstream.headers.get("content-type") || "application/octet-stream";
        res.set("Content-Type", ct);
        const contentLength = upstream.headers.get("content-length");
        if (contentLength) res.set("Content-Length", contentLength);
        if (!upstream.ok || !upstream.body) {
          return res.status(upstream.status).send(await upstream.text());
        }
        const { Readable } = await import("stream");
        Readable.fromWeb(upstream.body as any).pipe(res);
        return;
      }

      const allowed = ["xnxx-cdn.com", "mp4-cdn", "hls-cdn", "thumb-cdn"];
      const isAllowed = allowed.some(d => decoded.includes(d));
      if (!isAllowed) return res.status(403).send("Forbidden");

      const upstream = await fetch(decoded, {
        headers: {
          "User-Agent": XNXX_HEADERS["User-Agent"],
          "Referer": "https://www.xnxx.com/",
          "Origin": "https://www.xnxx.com",
        },
      });

      res.set("Access-Control-Allow-Origin", "*");
      res.set("Access-Control-Allow-Methods", "GET, OPTIONS");

      const ct = upstream.headers.get("content-type") || "";
      res.set("Content-Type", ct);

      const isHlsManifest =
        ct.includes("mpegURL") ||
        ct.includes("m3u8") ||
        decoded.includes(".m3u8");

      if (isHlsManifest) {
        const text = await upstream.text();
        const base = decoded.substring(0, decoded.lastIndexOf("/") + 1);

        const rewritten = text
          .split("\n")
          .map((line) => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith("#")) return line;
            const absUrl = trimmed.startsWith("http") ? trimmed : base + trimmed;
            return `/api/proxy/stream?url=${encodeURIComponent(absUrl)}`;
          })
          .join("\n");

        return res.send(rewritten);
      }

      const contentLength = upstream.headers.get("content-length");
      if (contentLength) res.set("Content-Length", contentLength);

      const buf = await upstream.arrayBuffer();
      res.send(Buffer.from(buf));
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  // ffmpeg-powered download — streams HLS→MP4 or proxies MP4 directly
  app.get("/api/proxy/download", async (req, res) => {
    try {
      const rawUrl = req.query.url as string;
      const type = (req.query.type as string) || "mp4";
      const title = (req.query.title as string) || "download";
      if (!rawUrl) return res.status(400).send("Missing url");

      const decoded = decodeURIComponent(rawUrl);
      const safeTitle = title.replace(/[^a-z0-9_\-\s]/gi, "_").slice(0, 80);
      const filename = `${safeTitle}.mp4`;

      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Access-Control-Allow-Origin", "*");

      if (type === "hls") {
        // For HLS: feed ffmpeg via the proxy (handles both internal and external URLs)
        const port = process.env.PORT || "5000";
        // If the URL is a relative internal path, fetch it directly from localhost
        // so ffmpeg doesn't need to go through proxy/stream's domain filter
        const proxiedM3u8 = decoded.startsWith("/")
          ? `http://127.0.0.1:${port}${decoded}`
          : `http://127.0.0.1:${port}/api/proxy/stream?url=${encodeURIComponent(decoded)}`;

        const ff = spawn("ffmpeg", [
          "-y",
          "-i", proxiedM3u8,
          "-c", "copy",
          "-movflags", "frag_keyframe+empty_moov+default_base_moof",
          "-f", "mp4",
          "pipe:1",
        ]);

        ff.stderr.on("data", (d) => {
          process.stdout.write(`[ffmpeg] ${d}`);
        });

        ff.on("error", (err) => {
          console.error("[ffmpeg] spawn error:", err);
          if (!res.headersSent) res.status(500).send("ffmpeg error");
        });

        ff.stdout.pipe(res);

        req.on("close", () => {
          if (!ff.killed) ff.kill("SIGKILL");
        });

        return;
      }

      // MP4: fetch and pipe with attachment header
      const port = process.env.PORT || "5000";
      // Resolve relative paths to an absolute localhost URL
      const fetchUrl = decoded.startsWith("/")
        ? `http://127.0.0.1:${port}${decoded}`
        : decoded;
      const isXnxx = decoded.includes("xnxx-cdn.com") || decoded.includes("mp4-cdn") || decoded.includes("hls-cdn");
      const fetchHeaders: Record<string, string> = isXnxx
        ? {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0",
            "Referer": "https://www.xnxx.com/",
            "Origin": "https://www.xnxx.com",
            "Accept": "*/*",
            "Accept-Language": "en-US,en;q=0.5",
          }
        : {
            "User-Agent": "Mozilla/5.0",
          };

      const upstream = await fetch(fetchUrl, { headers: fetchHeaders });

      if (!upstream.ok || !upstream.body) {
        return res.status(502).send("Failed to fetch source");
      }

      const contentLength = upstream.headers.get("content-length");
      if (contentLength) res.setHeader("Content-Length", contentLength);

      const { Readable } = await import("stream");
      const nodeStream = Readable.fromWeb(upstream.body as any);
      nodeStream.pipe(res);

      req.on("close", () => nodeStream.destroy());
    } catch (err: any) {
      console.error("[download]", err);
      if (!res.headersSent) res.status(500).send(err.message);
    }
  });

  // Adult category - XNXX search
  app.get("/api/adult/search", async (req, res) => {
    try {
      const query = (req.query.query as string) || "";
      const page = Math.max(0, (Number(req.query.page) || 1) - 1);

      const url = query
        ? `https://www.xnxx.com/search/${encodeURIComponent(query)}/${page}`
        : `https://www.xnxx.com/search/featured/${page}`;

      const response = await fetch(url, { headers: XNXX_HEADERS });
      if (!response.ok) return res.json({ videos: [], total: 0 });

      const html = await response.text();
      const videos: any[] = [];

      const rawBlocks = html.split(/<div\s[^>]*data-eid="/);

      for (const block of rawBlocks.slice(1, 22)) {
        const eid = block.match(/^([a-z0-9]+)"/)?.[1];
        if (!eid) continue;

        const hrefMatch = block.match(/href="(\/video-[a-z0-9]+\/[^"]+)"/);
        if (!hrefMatch) continue;
        const urlPath = hrefMatch[1];

        const title = block.match(/title="([^"]+)"/)?.[1]?.trim() || "Untitled";
        const thumb = block.match(/data-src="(https?:\/\/[^"]+\.(?:jpg|jpeg|webp|gif)[^"]*)"/i)?.[1] || "";
        const durMatch = block.match(/>\s*((?:\d+h)?\d+min)\s*</);
        const duration = durMatch?.[1]?.trim() || "";
        const viewsMatch = block.match(/([\d,.]+[kK]?)\s*<span[^>]*icf-eye/);
        const viewsRaw = viewsMatch?.[1]?.replace(/,/g, "") || "";
        const views = viewsRaw
          ? viewsRaw.toLowerCase().endsWith("k")
            ? Math.round(parseFloat(viewsRaw) * 1000)
            : parseInt(viewsRaw)
          : undefined;
        const quality = block.match(/video-hd[^>]*>[^0-9]*(\d+p)/)?.[1] || "";

        videos.push({
          id: eid,
          title,
          thumbnail: thumb,
          duration,
          url: `https://www.xnxx.com${urlPath}`,
          views,
          quality,
        });
      }

      res.json({ videos: videos.filter(v => v.id && v.title !== "Untitled"), total: videos.length });
    } catch (err: any) {
      res.status(500).json({ message: err.message, videos: [], total: 0 });
    }
  });

  // Adult video detail — extract multi-quality MP4 + HLS sources
  app.get("/api/adult/video/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const urlParam = req.query.url as string;
      const url = urlParam && urlParam.startsWith("https://www.xnxx.com/")
        ? urlParam
        : `https://www.xnxx.com/video-${id}/`;

      const response = await fetch(url, { headers: XNXX_HEADERS });
      if (!response.ok) return res.status(404).json({ message: "Video not found" });

      const html = await response.text();

      const extract = (key: string): string | null => {
        const patterns = [
          new RegExp(`html5player\\.${key}\\('([^']+)'\\)`),
          new RegExp(`html5player\\.${key}\\("([^"]+)"\\)`),
          new RegExp(`${key}:'([^']+)'`),
          new RegExp(`"${key}":"([^"]+)"`),
        ];
        for (const p of patterns) {
          const m = html.match(p);
          if (m?.[1]) return m[1];
        }
        return null;
      };

      const title    = extract("setVideoTitle");
      const hls      = extract("setVideoHLS");
      const high     = extract("setVideoUrlHigh");
      const low      = extract("setVideoUrlLow");
      const p1080    = extract("setVideoUrl1080p");
      const p720     = extract("setVideoUrl720p");
      const p480     = extract("setVideoUrl480p");
      const p360     = extract("setVideoUrl360p");
      const p240     = extract("setVideoUrl240p");
      const thumb    = extract("setThumbUrl169") || extract("setThumbUrl");
      const uploader = extract("setUploaderName");

      const fallbackHls  = hls  || html.match(/["'](https?:\/\/[^"']+\.m3u8[^"']*)/)?.[1] || null;
      const fallbackHigh = high || html.match(/["'](https?:\/\/[^"']+\/hd\/[^"']+\.mp4[^"']*)/)?.[1] || null;
      const fallbackLow  = low  || html.match(/["'](https?:\/\/[^"']+\/lo\/[^"']+\.mp4[^"']*)/)?.[1] || null;

      const seen = new Set<string>();
      const sources: { label: string; url: string; type: string }[] = [];
      const addSrc = (label: string, url: string | null, type: "mp4" | "hls") => {
        if (!url || seen.has(url)) return;
        seen.add(url);
        sources.push({ label, url, type });
      };

      addSrc("Auto (HLS)", fallbackHls, "hls");
      addSrc("1080p", p1080, "mp4");
      addSrc("720p",  p720,  "mp4");
      addSrc("480p",  p480,  "mp4");
      addSrc("360p",  p360 || fallbackHigh, "mp4");
      addSrc("240p",  p240 || fallbackLow,  "mp4");

      res.json({ id, title, thumb, uploader, sources });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Browse movies/series by category
  app.get("/api/browse", async (req, res) => {
    try {
      const type = (req.query.type as string) || "";
      const sort = (req.query.sort as string) || "rating";
      const lang = (req.query.lang as string) || "";
      const search = (req.query.search as string) || "";
      const page = Number(req.query.page) || 1;
      const limit = 20;
      const cacheKey = `browse:${type}:${sort}:${lang}:${search}:p${page}`;
      const hit = getCached(cacheKey);
      if (hit) {
        console.log(`[Cache] CACHE HIT → ${cacheKey}`);
        res.setHeader("Cache-Control", `public, max-age=${TTL.BROWSE / 1000}`);
        return res.json(hit);
      }
      console.log(`[Cache] FETCH API → ${cacheKey}`);
      const result = await storage.getMovies({ type, sort, language: lang || undefined, search: search || undefined, limit, offset: (page - 1) * limit });
      setCache(cacheKey, result, TTL.BROWSE);
      res.setHeader("Cache-Control", `public, max-age=${TTL.BROWSE / 1000}`);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Backup endpoints
  app.post("/api/backup/manual", async (req, res) => {
    try {
      const settings = await storage.getSettings();
      
      if (!settings?.githubToken || !settings?.githubRepo) {
        return res.status(400).json({ 
          success: false, 
          message: "GitHub configuration not set. Please configure in settings." 
        });
      }

      const config = {
        token: settings.githubToken,
        repo: settings.githubRepo,
        branch: settings.githubBranch || 'main'
      };

      const result = await performBackup(config, 'manual');
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ 
        success: false, 
        message: error.message 
      });
    }
  });

  app.post("/api/backup/telegram", requireAdmin, async (_req, res) => {
    try {
      const result = await performTelegramDbBackup();
      if (result.success) {
        res.json({ success: true, message: result.message });
      } else {
        res.status(400).json({ success: false, message: result.message });
      }
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get("/api/backup/history", async (req, res) => {
    try {
      const backups = await storage.getBackups();
      res.json(backups);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ─── Football API Keys (Admin) ──────────────────────────────────────────────
  app.get("/api/admin/football-keys", async (_req, res) => {
    try {
      const keys = await storage.getFootballApiKeys();
      res.json(keys);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/admin/football-keys", async (req, res) => {
    try {
      const { key, label } = req.body;
      if (!key || typeof key !== "string" || key.trim().length < 5) {
        return res.status(400).json({ message: "Invalid API key" });
      }
      const created = await storage.createFootballApiKey({ key: key.trim(), label: label?.trim() || null, isActive: true });
      res.status(201).json(created);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.patch("/api/admin/football-keys/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updated = await storage.updateFootballApiKey(id, req.body);
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/admin/football-keys/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteFootballApiKey(id);
      res.status(204).end();
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ─── Football Proxy (SportSRC API) ──────────────────────────────────────────
  const SPORTSRC_BASE = "https://api.sportsrc.org/v2";

  async function fetchWithRandomKey(params: URLSearchParams): Promise<Response> {
    const keyRow = await storage.getRandomFootballApiKey();
    if (!keyRow) throw new Error("No active football API keys configured");
    storage.incrementFootballApiKeyRequestCount(keyRow.id).catch(() => {});
    return fetch(`${SPORTSRC_BASE}/?${params}`, {
      headers: {
        "X-API-KEY": keyRow.key,
        "Accept": "application/json",
        "User-Agent": "CineBot-Football/1.0",
      },
    });
  }

  app.get("/api/football/matches", async (req, res) => {
    try {
      const date = (req.query.date as string) || "";
      const league = (req.query.league as string) || "";
      const cacheKey = `sports:matches:${date}:${league}`;
      const hit = getCached(cacheKey);
      if (hit) {
        console.log(`[Cache] CACHE HIT → ${cacheKey}`);
        res.setHeader("Cache-Control", `public, max-age=${TTL.SPORTS / 1000}`);
        return res.json(hit);
      }
      console.log(`[Cache] FETCH API → ${cacheKey}`);
      const params = new URLSearchParams({ type: "matches" });
      if (date) params.set("date", date);
      if (league) params.set("league", league);
      const upstream = await fetchWithRandomKey(params);
      const data = await upstream.json();
      if (upstream.ok) {
        setCache(cacheKey, data, TTL.SPORTS);
        res.setHeader("Cache-Control", `public, max-age=${TTL.SPORTS / 1000}`);
      }
      res.status(upstream.ok ? 200 : upstream.status).json(data);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/football/match/:id", async (req, res) => {
    try {
      const matchId = req.params.id;
      const cacheKey = `sports:match:${matchId}`;
      const hit = getCached(cacheKey);
      if (hit) {
        console.log(`[Cache] CACHE HIT → ${cacheKey}`);
        res.setHeader("Cache-Control", `public, max-age=${TTL.SPORTS / 1000}`);
        return res.json(hit);
      }
      console.log(`[Cache] FETCH API → ${cacheKey}`);
      const params = new URLSearchParams({ type: "detail", id: matchId });
      const upstream = await fetchWithRandomKey(params);
      const data = await upstream.json();

      if (!upstream.ok) {
        return res.status(upstream.status).json(data);
      }

      const inner = data.data ?? data;
      const matchInfo = inner.match_info ?? inner;

      const rawSources: { id: string; streamNo?: number; embedUrl?: string; source?: string; hd?: boolean; language?: string; name?: string; quality?: string }[] =
        Array.isArray(inner.sources) ? inner.sources : [];

      const streams = rawSources.map((s, i) => ({
        name: s.name || s.source || `Stream ${s.streamNo ?? i + 1}`,
        quality: s.hd ? "HD" : (s.quality || "SD"),
        embed_url: s.embedUrl || null,
        url: s.embedUrl || null,
      })).filter(s => s.embed_url);

      const embed_url =
        inner.embed_url ||
        (streams.length > 0 ? streams[0].embed_url : null);

      const result = { ...matchInfo, streams, embed_url };
      setCache(cacheKey, result, TTL.SPORTS);
      res.setHeader("Cache-Control", `public, max-age=${TTL.SPORTS / 1000}`);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ─── Notify All Users ────────────────────────────────────────────────────
  app.post("/api/notify/movie/:id", async (req, res) => {
    try {
      const movie = await storage.getMovie(parseInt(req.params.id));
      if (!movie) return res.status(404).json({ message: "Movie not found" });
      const result = await broadcastMovieNotification(movie);
      res.json({ success: true, ...result });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/notify/episode/:id", async (req, res) => {
    try {
      const episode = await storage.getEpisode(parseInt(req.params.id));
      if (!episode) return res.status(404).json({ message: "Episode not found" });
      const series = await storage.getMovie(episode.movieId);
      if (!series) return res.status(404).json({ message: "Series not found" });
      const result = await broadcastEpisodeNotification(episode, series);
      res.json({ success: true, ...result });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ─── Channel Post Routes ─────────────────────────────────────────────────
  app.post("/api/admin/channel/post-movie/:id", async (req, res) => {
    try {
      const movieId = Number(req.params.id);
      const result = await postMovieToChannel(movieId);
      if (!result.ok) return res.status(400).json({ success: false, message: result.message });
      await storage.markMoviePosted(movieId);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  app.post("/api/admin/channel/post-football", async (req, res) => {
    try {
      const match = req.body as ChannelFootballMatch;
      if (!match?.id || !match?.homeTeam || !match?.awayTeam) {
        return res.status(400).json({ success: false, message: "Invalid match data" });
      }
      const result = await postFootballToChannel(match);
      if (!result.ok) return res.status(400).json({ success: false, message: result.message });
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  // ─── Database Export ──────────────────────────────────────────────────────
  app.get("/api/db/export", async (_req, res) => {
    try {
      const [
        allMovies,
        allEpisodes,
        allChannels,
        allSyncedFiles,
        allUsers,
        allAds,
        allSettings,
        allMascotSettings,
        allFootballApiKeys,
        allBackups,
        allViewLogs,
        allAppUrls,
      ] = await Promise.all([
        db.select().from(movies),
        db.select().from(episodes),
        db.select().from(channels),
        db.select().from(syncedFiles),
        db.select().from(users),
        db.select().from(ads),
        db.select().from(settings),
        db.select().from(mascotSettings),
        db.select().from(footballApiKeys),
        db.select().from(backups),
        db.select().from(viewLogs),
        db.select().from(appUrls),
      ]);

      const dump = {
        exportedAt: new Date().toISOString(),
        version: 1,
        tables: {
          movies: allMovies,
          episodes: allEpisodes,
          channels: allChannels,
          syncedFiles: allSyncedFiles,
          users: allUsers,
          ads: allAds,
          settings: allSettings,
          mascotSettings: allMascotSettings,
          footballApiKeys: allFootballApiKeys,
          backups: allBackups,
          viewLogs: allViewLogs,
          appUrls: allAppUrls,
        },
      };

      const json = JSON.stringify(dump, null, 2);
      const filename = `cinebot-db-${new Date().toISOString().slice(0, 10)}.json`;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(json);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ─── Per-Table Export ─────────────────────────────────────────────────────
  const TABLE_MAP: Record<string, any> = {
    movies,
    episodes,
    channels,
    synced_files: syncedFiles,
    users,
    ads,
    settings,
    mascot_settings: mascotSettings,
    football_api_keys: footballApiKeys,
    backups,
    view_logs: viewLogs,
    app_urls: appUrls,
  };

  app.get("/api/db/export/:table", async (req, res) => {
    const tableName = req.params.table;
    const table = TABLE_MAP[tableName];
    if (!table) {
      return res.status(404).json({ message: `Table "${tableName}" not found` });
    }
    try {
      const rows = await db.select().from(table);
      const json = JSON.stringify(rows, null, 2);
      const filename = `${tableName}-${new Date().toISOString().slice(0, 10)}.json`;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(json);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ─── Per-Table Import ─────────────────────────────────────────────────────
  app.post("/api/db/import/:table", memoryUpload.single("file"), async (req, res) => {
    const tableName = req.params.table;
    const table = TABLE_MAP[tableName];
    if (!table) return res.status(404).json({ message: `Table "${tableName}" not found` });
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    let rows: any[];
    try {
      const parsed = JSON.parse(req.file.buffer.toString("utf-8"));
      if (!Array.isArray(parsed)) return res.status(400).json({ message: "File must be a JSON array" });
      rows = parsed;
    } catch {
      return res.status(400).json({ message: "Invalid JSON file" });
    }

    try {
      // Delete dependents first to avoid FK violations
      if (tableName === "movies") await db.delete(episodes);
      if (tableName === "channels") { /* no direct FKs in channels */ }

      await db.delete(table);
      if (rows.length > 0) await insertChunked(table, fixTimestamps(rows));

      // Reset sequence
      const pgName = tableName; // table names match postgres names
      await db.execute(
        sql.raw(`SELECT setval(pg_get_serial_sequence('"${pgName}"', 'id'), COALESCE((SELECT MAX(id) FROM "${pgName}"), 1))`)
      );

      return res.json({ success: true, inserted: rows.length, message: `${rows.length} rows imported into ${tableName}` });
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  // ─── Table Row Counts ─────────────────────────────────────────────────────
  app.get("/api/db/counts", async (_req, res) => {
    try {
      const counts = await Promise.all(
        Object.entries(TABLE_MAP).map(async ([name, table]) => {
          const rows = await db.select().from(table);
          return [name, rows.length];
        })
      );
      res.json(Object.fromEntries(counts));
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ─── Database Import ──────────────────────────────────────────────────────
  const TIMESTAMP_KEYS = new Set(["createdAt", "joinedAt", "lastActive"]);
  function fixTimestamps(rows: any[]): any[] {
    return rows.map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([k, v]) => {
          if (TIMESTAMP_KEYS.has(k) && typeof v === "string") {
            const d = new Date(v);
            return [k, isNaN(d.getTime()) ? v : d];
          }
          return [k, v];
        })
      )
    );
  }

  async function insertChunked(table: any, rows: any[], size = 100) {
    for (let i = 0; i < rows.length; i += size) {
      await db.insert(table).values(rows.slice(i, i + size));
    }
  }

  async function restoreFromTables(t: any) {
    // Delete in dependency order (children first)
    await db.delete(episodes);
    await db.delete(syncedFiles);
    await db.delete(movies);
    await db.delete(channels);
    await db.delete(users);
    await db.delete(ads);
    await db.delete(mascotSettings);
    await db.delete(footballApiKeys);
    await db.delete(backups);
    await db.delete(settings);

    // Re-insert in dependency order (parents first)
    if (t.settings?.length)        await db.insert(settings).values(fixTimestamps(t.settings));
    if (t.channels?.length)        await db.insert(channels).values(fixTimestamps(t.channels));
    if (t.movies?.length)          await insertChunked(movies, fixTimestamps(t.movies));
    if (t.episodes?.length)        await insertChunked(episodes, fixTimestamps(t.episodes));
    if (t.syncedFiles?.length)     await insertChunked(syncedFiles, fixTimestamps(t.syncedFiles));
    if (t.users?.length)           await db.insert(users).values(fixTimestamps(t.users));
    if (t.ads?.length)             await db.insert(ads).values(fixTimestamps(t.ads));
    if (t.mascotSettings?.length)  await db.insert(mascotSettings).values(fixTimestamps(t.mascotSettings));
    if (t.footballApiKeys?.length) await db.insert(footballApiKeys).values(fixTimestamps(t.footballApiKeys));
    if (t.backups?.length)         await insertChunked(backups, fixTimestamps(t.backups));
  }

  app.post("/api/db/import", memoryUpload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });

      let dump: any;
      try {
        dump = JSON.parse(req.file.buffer.toString("utf-8"));
      } catch {
        return res.status(400).json({ message: "Invalid JSON file" });
      }

      // Format 1: standard full dump { exportedAt, version, tables: { ... } }
      if (dump?.tables && typeof dump.tables === "object" && !Array.isArray(dump.tables)) {
        await restoreFromTables(dump.tables);
        return res.json({ success: true, message: "Database restored successfully" });
      }

      // Format 2: array of backup-history records (each has backupData with partial tables)
      // e.g. the file downloaded from "Download Individual Tables > Backups"
      if (Array.isArray(dump) && dump.length > 0 && dump[0]?.backupData) {
        // Find the most recent entry that has movies data (most complete snapshot)
        const sorted = [...dump].sort((a, b) => {
          const da = a.createdAt ? new Date(a.createdAt).getTime() : (a.id ?? 0);
          const db_ = b.createdAt ? new Date(b.createdAt).getTime() : (b.id ?? 0);
          return db_ - da;
        });
        const best = sorted.find(r => r.backupData?.movies?.length) ?? sorted[0];
        const t = best.backupData ?? {};
        await restoreFromTables(t);
        return res.json({ success: true, message: `Database restored from backup record #${best.id}` });
      }

      // Format 3: raw array without backupData — this is a single-table export, not restorable
      if (Array.isArray(dump)) {
        return res.status(400).json({
          message: "This file is a single-table export and cannot be used to restore the full database. Please use the file downloaded from the 'Download Now' button under 'Database Backup & Restore'.",
        });
      }

      return res.status(400).json({ message: "Invalid database dump format" });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ── App URL Health Check (manual trigger) ────────────────────────────────
  app.post("/api/admin/app-urls/check", requireAdmin, async (_req, res) => {
    try {
      await runHealthCheck();
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ── App URL Rotation ─────────────────────────────────────────────────────
  app.get("/api/admin/app-urls", requireAdmin, async (_req, res) => {
    try {
      const urls = await storage.getAppUrls();
      res.json(urls);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/admin/app-urls", requireAdmin, async (req, res) => {
    try {
      const schema = z.object({ url: z.string().url(), label: z.string().optional(), isActive: z.boolean().optional() });
      const data = schema.parse(req.body);
      const created = await storage.createAppUrl(data);
      res.json(created);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.patch("/api/admin/app-urls/:id", requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const schema = z.object({ url: z.string().url().optional(), label: z.string().optional(), isActive: z.boolean().optional() });
      const data = schema.parse(req.body);
      const updated = await storage.updateAppUrl(id, data);
      res.json(updated);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.delete("/api/admin/app-urls/:id", requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      await storage.deleteAppUrl(id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ── Stream Load Balancer Backends ──────────────────────────────────────────
  app.post("/api/admin/stream-backends/check", requireAdmin, async (_req, res) => {
    try {
      await runStreamBackendHealthCheck();
      const backends = await storage.getStreamBackends();
      res.json(backends);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/admin/stream-backends", requireAdmin, async (_req, res) => {
    try {
      const backends = await storage.getStreamBackends();
      res.json(backends);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/admin/stream-backends", requireAdmin, async (req, res) => {
    try {
      const schema = z.object({ url: z.string().url(), label: z.string().optional(), isActive: z.boolean().optional() });
      const data = schema.parse(req.body);
      const created = await storage.createStreamBackend(data);
      res.json(created);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.patch("/api/admin/stream-backends/:id", requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const schema = z.object({ url: z.string().url().optional(), label: z.string().optional(), isActive: z.boolean().optional() });
      const data = schema.parse(req.body);
      const updated = await storage.updateStreamBackend(id, data);
      res.json(updated);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.delete("/api/admin/stream-backends/:id", requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      await storage.deleteStreamBackend(id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Get the current app URL (rotated or base) — used by the bot and publicly exposed
  app.get("/api/app-url", async (_req, res) => {
    try {
      const settings = await storage.getSettings();
      const domain = process.env.REPLIT_DEV_DOMAIN || process.env.VITE_DEV_SERVER_HOSTNAME;
      const baseUrl = domain ? `https://${domain}/app` : "";

      if (settings?.urlRotationEnabled) {
        const randomUrl = await storage.getRandomActiveAppUrl();
        if (randomUrl) {
          await storage.incrementAppUrlVisitCount(randomUrl.id);
          return res.json({ url: randomUrl.url, id: randomUrl.id });
        }
      }
      res.json({ url: baseUrl, id: null });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ── Database Table Viewer ────────────────────────────────────────────────
  app.get("/api/admin/db-tables", requireAdmin, async (_req, res) => {
    try {
      const [
        moviesData, episodesData, channelsData, syncedFilesData,
        usersData, adsData, settingsData, backupsData,
        mascotData, footballData, viewLogsData, appUrlsData,
      ] = await Promise.all([
        db.select().from(movies).orderBy(desc(movies.id)).limit(200),
        db.select().from(episodes).orderBy(desc(episodes.id)).limit(200),
        db.select().from(channels).orderBy(desc(channels.id)).limit(200),
        db.select().from(syncedFiles).orderBy(desc(syncedFiles.id)).limit(200),
        db.select().from(users).orderBy(desc(users.id)).limit(200),
        db.select().from(ads).orderBy(desc(ads.id)).limit(200),
        db.select().from(settings).limit(1),
        db.select().from(backups).orderBy(desc(backups.id)).limit(200),
        db.select().from(mascotSettings).limit(1),
        db.select().from(footballApiKeys).orderBy(desc(footballApiKeys.id)).limit(200),
        db.select().from(viewLogs).orderBy(desc(viewLogs.id)).limit(200),
        db.select().from(appUrls).orderBy(desc(appUrls.id)).limit(200),
      ]);
      res.json({
        movies: moviesData,
        episodes: episodesData,
        channels: channelsData,
        synced_files: syncedFilesData,
        users: usersData,
        ads: adsData,
        settings: settingsData,
        backups: backupsData,
        mascot_settings: mascotData,
        football_api_keys: footballData,
        view_logs: viewLogsData,
        app_urls: appUrlsData,
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // In-memory cache: fileId → { downloadUrl, fileSize, expiresAt }
  const tgUrlCache = new Map<string, { downloadUrl: string; fileSize?: number; expiresAt: number }>();

  async function resolveTelegramUrl(fileId: string, token: string): Promise<{ downloadUrl: string; fileSize?: number }> {
    const cached = tgUrlCache.get(fileId);
    if (cached && cached.expiresAt > Date.now()) {
      return { downloadUrl: cached.downloadUrl, fileSize: cached.fileSize };
    }

    const fileInfoRes = await fetch(
      `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`
    );
    const fileInfo = (await fileInfoRes.json()) as any;

    if (!fileInfo.ok || !fileInfo.result?.file_path) {
      throw Object.assign(new Error("File not found on Telegram"), { status: 404 });
    }

    const filePath: string = fileInfo.result.file_path;
    const fileSize: number | undefined = fileInfo.result.file_size;
    const downloadUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;

    // Cache for 25 minutes (Telegram links last ~1 hour)
    tgUrlCache.set(fileId, { downloadUrl, fileSize, expiresAt: Date.now() + 25 * 60 * 1000 });
    return { downloadUrl, fileSize };
  }

  // Quick check — resolves fileId without streaming, used by the player before opening
  app.get("/api/stream/telegram/:fileId/check", async (req, res) => {
    try {
      const { fileId } = req.params;
      const cfg = await storage.getSettings();
      const token = cfg?.botToken || process.env.TELEGRAM_BOT_TOKEN;
      if (!token) return res.status(503).json({ ok: false, message: "Bot token not configured. Go to Admin → Settings and enter your bot token." });

      const { fileSize } = await resolveTelegramUrl(fileId, token);
      res.json({ ok: true, fileSize });
    } catch (err: any) {
      res.status(err.status || 500).json({ ok: false, message: err.message });
    }
  });

  // Telegram file direct streaming with Range request support + caching
  app.get("/api/stream/telegram/:fileId", async (req, res) => {
    try {
      const { fileId } = req.params;
      if (!fileId) return res.status(400).send("Missing fileId");

      const cfg = await storage.getSettings();
      const token = cfg?.botToken || process.env.TELEGRAM_BOT_TOKEN;
      if (!token) return res.status(503).json({ message: "Bot token not configured. Set it in Admin → Settings." });

      const { downloadUrl, fileSize } = await resolveTelegramUrl(fileId, token);
      const isDownload = req.query.download === "1";
      const { Readable } = await import("stream");

      const rangeHeader = req.headers.range;

      if (rangeHeader && fileSize) {
        const parts = rangeHeader.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunkSize = end - start + 1;

        const upstream = await fetch(downloadUrl, {
          headers: { Range: `bytes=${start}-${end}` },
        });

        if (!upstream.ok || !upstream.body) {
          return res.status(502).send("Upstream error");
        }

        res.writeHead(206, {
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": String(chunkSize),
          "Content-Type": "video/mp4",
          "Cache-Control": "no-store",
          ...(isDownload ? { "Content-Disposition": `attachment; filename="video.mp4"` } : {}),
        });

        const nodeStream = Readable.fromWeb(upstream.body as any);
        nodeStream.pipe(res);
        req.on("close", () => nodeStream.destroy());
      } else {
        const upstream = await fetch(downloadUrl);

        if (!upstream.ok || !upstream.body) {
          return res.status(502).send("Failed to fetch from Telegram");
        }

        const headers: Record<string, string> = {
          "Content-Type": "video/mp4",
          "Accept-Ranges": "bytes",
          "Cache-Control": "no-store",
          ...(isDownload ? { "Content-Disposition": `attachment; filename="video.mp4"` } : {}),
        };
        if (fileSize) headers["Content-Length"] = String(fileSize);

        res.writeHead(200, headers);

        const nodeStream = Readable.fromWeb(upstream.body as any);
        nodeStream.pipe(res);
        req.on("close", () => nodeStream.destroy());
      }
    } catch (err: any) {
      console.error("[Telegram stream]", err);
      if (!res.headersSent) res.status(err.status || 500).send(err.message);
    }
  });

  // ─── TikTok Video Projects ───────────────────────────────────────────────
  app.get("/api/admin/tiktok/projects", requireAdmin, async (_req, res) => {
    try {
      const projects = await storage.getTiktokProjects();
      res.json(projects);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/tiktok/projects/:id", requireAdmin, async (req, res) => {
    try {
      const project = await storage.getTiktokProject(Number(req.params.id));
      if (!project) return res.status(404).json({ message: "Project not found" });
      res.json(project);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/tiktok/projects", requireAdmin, async (req, res) => {
    try {
      const project = await storage.createTiktokProject(req.body);
      res.status(201).json(project);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/admin/tiktok/projects/:id", requireAdmin, async (req, res) => {
    try {
      const { id: _id, createdAt: _ca, updatedAt: _ua, ...updates } = req.body;
      const project = await storage.updateTiktokProject(Number(req.params.id), updates);
      res.json(project);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/tiktok/projects/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deleteTiktokProject(Number(req.params.id));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Manually send TikTok promo for any existing movie
  app.post("/api/admin/tiktok/send-promo/:movieId", requireAdmin, async (req, res) => {
    try {
      const movie = await storage.getMovie(Number(req.params.movieId));
      if (!movie) return res.status(404).json({ message: "Movie not found" });
      const validStyles = ["cinematic", "action", "drama", "mystery"];
      const style = validStyles.includes(req.query.style as string)
        ? (req.query.style as MusicStyle)
        : "cinematic";
      const clipPercent = typeof req.body.clipPercent === "number"
        ? Math.min(Math.max(req.body.clipPercent, 0), 0.90)
        : 0.42;
      const customAudioUrl = typeof req.body.customAudioUrl === "string"
        ? req.body.customAudioUrl.trim()
        : "";
      const channelHandle = typeof req.body.channelHandle === "string"
        ? req.body.channelHandle.trim()
        : "MultiverseMovies_Bot";
      await generateAndSendTikTok(movie, style, {
        clipPercent,
        customAudioUrl: customAudioUrl || undefined,
        channelHandle: channelHandle || "MultiverseMovies_Bot",
      });
      res.json({ success: true, message: `Promo sent for "${movie.title}"` });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  return httpServer;
}
