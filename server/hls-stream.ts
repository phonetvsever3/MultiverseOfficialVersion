/**
 * HLS Streaming
 *
 * Priority:
 *  1. If the movie/episode has a stored streamUrl (File Stream Bot), use it
 *     directly for byte-range chunk requests — no Telegram API call needed.
 *  2. Fallback to Telegram Bot API getFile (only works for files ≤ 20 MB).
 *
 * Routes:
 *   GET /api/hls/:type/:id/playlist.m3u8
 *   GET /api/hls/:type/:id/chunk/:index.ts
 */

import type { Express, Request, Response } from "express";
import https from "https";
import http from "http";
import { storage } from "./storage";

const CHUNK_SIZE = 1 * 1024 * 1024; // 1 MB per segment

// --------------------------------------------------------------------------
// Source resolution
// --------------------------------------------------------------------------

/** Try a HEAD request to get file size from a URL */
function getRemoteFileSize(url: string): Promise<number> {
  return new Promise((resolve) => {
    const protocol = url.startsWith("https") ? https : http;
    const req = protocol.request(url, { method: "HEAD" }, (res) => {
      const cl = res.headers["content-length"];
      resolve(cl ? parseInt(cl, 10) : 0);
      res.resume();
    });
    req.on("error", () => resolve(0));
    req.setTimeout(8000, () => { req.destroy(); resolve(0); });
    req.end();
  });
}

function fetchJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on("error", reject);
  });
}

/** Get Telegram CDN URL via Bot API — only works for files ≤ 20 MB */
async function getTelegramFileUrl(token: string, fileId: string): Promise<{ url: string; fileSize: number }> {
  const apiBase = `https://api.telegram.org/bot${token}`;
  const meta: any = await fetchJson(`${apiBase}/getFile?file_id=${encodeURIComponent(fileId)}`);
  if (!meta.ok) throw new Error(`Telegram getFile failed: ${JSON.stringify(meta)}`);
  return {
    url: `https://api.telegram.org/file/bot${token}/${meta.result.file_path}`,
    fileSize: meta.result.file_size ?? 0,
  };
}

interface SourceInfo {
  url: string;
  fileSize: number;
}

async function resolveSource(
  token: string,
  fileId: string,
  streamUrl: string | null | undefined,
  storedSize: number | null | undefined
): Promise<SourceInfo> {
  // ── Path 1: File Stream Bot URL ──────────────────────────────────────────
  if (streamUrl) {
    let size = storedSize ?? 0;
    if (!size) size = await getRemoteFileSize(streamUrl);
    if (size > 0) return { url: streamUrl, fileSize: size };
    // If HEAD failed, fall through to Bot API
  }

  // ── Path 2: Telegram Bot API (≤ 20 MB files) ────────────────────────────
  if (storedSize && storedSize > 20 * 1024 * 1024) {
    throw new Error(
      "File is larger than 20 MB and has no stream URL configured. " +
      "Enable the File Stream Bot in Admin → Settings → FileStreamBot to stream large files."
    );
  }

  return getTelegramFileUrl(token, fileId);
}

// --------------------------------------------------------------------------
// M3U8 builder
// --------------------------------------------------------------------------

function buildM3U8(baseChunkUrl: string, fileSize: number, totalDurationSec: number | null): string {
  const chunkCount = Math.ceil(fileSize / CHUNK_SIZE);
  const segDuration = totalDurationSec && totalDurationSec > 0
    ? totalDurationSec / chunkCount
    : 10;
  const targetDuration = Math.ceil(segDuration);

  const lines: string[] = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    `#EXT-X-TARGETDURATION:${targetDuration}`,
    "#EXT-X-MEDIA-SEQUENCE:0",
    "#EXT-X-PLAYLIST-TYPE:VOD",
  ];

  for (let i = 0; i < chunkCount; i++) {
    const chunkStart = i * CHUNK_SIZE;
    const actualBytes = Math.min(CHUNK_SIZE, fileSize - chunkStart);
    const actualDuration = totalDurationSec && totalDurationSec > 0
      ? (actualBytes / fileSize) * totalDurationSec
      : segDuration;
    lines.push(`#EXTINF:${actualDuration.toFixed(6)},`);
    lines.push(`${baseChunkUrl}/${i}.ts`);
  }

  lines.push("#EXT-X-ENDLIST");
  return lines.join("\n");
}

// --------------------------------------------------------------------------
// Chunk proxy
// --------------------------------------------------------------------------

function proxyByteRange(cdnUrl: string, start: number, end: number, res: Response): Promise<void> {
  return new Promise((resolve, reject) => {
    const rangeHeader = `bytes=${start}-${end}`;
    const protocol = cdnUrl.startsWith("https") ? https : http;

    const req = protocol.get(cdnUrl, { headers: { Range: rangeHeader } }, (upstream) => {
      if (upstream.statusCode !== 206 && upstream.statusCode !== 200) {
        res.status(502).end(`Upstream error ${upstream.statusCode}`);
        resolve();
        return;
      }
      res.setHeader("Content-Type", "video/mp2t");
      res.setHeader("Content-Length", end - start + 1);
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.setHeader("Accept-Ranges", "bytes");
      res.status(206);
      upstream.pipe(res);
      upstream.on("end", resolve);
      upstream.on("error", reject);
    });
    req.on("error", reject);
  });
}

// --------------------------------------------------------------------------
// Route registration
// --------------------------------------------------------------------------

export function registerHlsRoutes(app: Express) {

  // ── Playlist ──────────────────────────────────────────────────────────────
  app.get("/api/hls/:type/:id/playlist.m3u8", async (req: Request, res: Response) => {
    const { type, id } = req.params;
    const numId = parseInt(id, 10);
    if (!["movie", "episode"].includes(type) || isNaN(numId)) {
      return res.status(400).json({ message: "Invalid type or id" });
    }

    try {
      const settings = await storage.getSettings();
      const token = settings?.botToken || process.env.TELEGRAM_BOT_TOKEN;
      if (!token) return res.status(503).json({ message: "Bot token not configured" });

      let fileId: string | null = null;
      let fileSize: number | null = null;
      let duration: number | null = null;
      let streamUrl: string | null = null;

      if (type === "movie") {
        const movie = await storage.getMovie(numId);
        if (!movie) return res.status(404).json({ message: "Movie not found" });
        if (!movie.fileId) return res.status(404).json({ message: "No file attached" });
        fileId = movie.fileId;
        fileSize = movie.fileSize ?? null;
        duration = movie.duration ?? null;
        streamUrl = movie.streamUrl ?? null;
      } else {
        const episode = await storage.getEpisode(numId);
        if (!episode) return res.status(404).json({ message: "Episode not found" });
        fileId = episode.fileId;
        fileSize = episode.fileSize ?? null;
        streamUrl = episode.streamUrl ?? null;
      }

      const { url: cdnUrl, fileSize: resolvedSize } = await resolveSource(token, fileId!, streamUrl, fileSize);
      if (!resolvedSize) {
        return res.status(422).json({ message: "File size unknown — cannot build playlist" });
      }

      const m3u8 = buildM3U8(`/api/hls/${type}/${id}/chunk`, resolvedSize, duration);

      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Access-Control-Allow-Origin", "*");
      return res.send(m3u8);
    } catch (err: any) {
      console.error("[HLS] playlist error:", err?.message || err);
      return res.status(500).json({ message: err?.message || "Failed to generate playlist" });
    }
  });

  // ── Chunk ─────────────────────────────────────────────────────────────────
  app.get("/api/hls/:type/:id/chunk/:index.ts", async (req: Request, res: Response) => {
    const { type, id, index } = req.params;
    const numId = parseInt(id, 10);
    const chunkIndex = parseInt(index, 10);
    if (!["movie", "episode"].includes(type) || isNaN(numId) || isNaN(chunkIndex) || chunkIndex < 0) {
      return res.status(400).json({ message: "Invalid parameters" });
    }

    try {
      const settings = await storage.getSettings();
      const token = settings?.botToken || process.env.TELEGRAM_BOT_TOKEN;
      if (!token) return res.status(503).json({ message: "Bot token not configured" });

      let fileId: string | null = null;
      let fileSize: number | null = null;
      let streamUrl: string | null = null;

      if (type === "movie") {
        const movie = await storage.getMovie(numId);
        if (!movie || !movie.fileId) return res.status(404).json({ message: "Movie/file not found" });
        fileId = movie.fileId;
        fileSize = movie.fileSize ?? null;
        streamUrl = movie.streamUrl ?? null;
      } else {
        const episode = await storage.getEpisode(numId);
        if (!episode) return res.status(404).json({ message: "Episode not found" });
        fileId = episode.fileId;
        fileSize = episode.fileSize ?? null;
        streamUrl = episode.streamUrl ?? null;
      }

      const { url: cdnUrl, fileSize: resolvedSize } = await resolveSource(token, fileId!, streamUrl, fileSize);
      if (!resolvedSize) return res.status(422).json({ message: "File size unknown" });

      const start = chunkIndex * CHUNK_SIZE;
      if (start >= resolvedSize) return res.status(416).json({ message: "Chunk index out of range" });
      const end = Math.min(start + CHUNK_SIZE - 1, resolvedSize - 1);

      await proxyByteRange(cdnUrl, start, end, res);
    } catch (err: any) {
      console.error("[HLS] chunk error:", err?.message || err);
      if (!res.headersSent) {
        return res.status(500).json({ message: err?.message || "Failed to fetch chunk" });
      }
    }
  });
}
