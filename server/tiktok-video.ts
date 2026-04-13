/**
 * tiktok-video.ts  —  7-Scene 40-Second Premium Cinematic Promo Generator
 * -------------------------------------------------------------------------
 * Scene 1 (0–5 s)  : Hook         — Blurred poster + gold title + vignette
 * Scene 2 (5–9 s)  : Poster Reveal— Clean crisp movie poster showcase
 * Scene 3 (9–15 s) : Clip 1       — Letterbox trailer + "NOW STREAMING" pill
 * Scene 4 (15–21 s): Clip 2       — Letterbox trailer + "WATCH NOW" pill
 * Scene 5 (21–27 s): Clip 3       — Letterbox trailer + "MUST SEE" pill  ← NEW
 * Scene 6 (27–34 s): Highlight    — Glass card with genre / cast / rating
 * Scene 7 (34–40 s): CTA Pro      — Ultra-premium multi-layer CTA
 *
 * Audio: generated music at 30% + real trailer audio at 100% (clips 3,4,5)
 * Video: 720×1280 @ 25 fps · warm grade · cinematic grain · letterbox
 */

import type { Movie } from "@shared/schema";
import { storage }    from "./storage";
import { exec }       from "child_process";
import { promisify }  from "util";
import fs             from "fs";
import path           from "path";
import os             from "os";
import https          from "https";
import FormData       from "form-data";

const execAsync = promisify(exec);

const TMDB_IMG  = "https://image.tmdb.org/t/p/w780";
const TG_BASE   = "https://api.telegram.org/bot";
const FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
const FONT_REG  = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
const GEN_MUSIC = path.resolve("server/gen-music.py");
const YT_DLP    = (() => {
  const candidates = [
    path.resolve("yt-dlp"),
    "/home/runner/workspace/.pythonlibs/bin/yt-dlp",
    "/usr/local/bin/yt-dlp",
    "/usr/bin/yt-dlp",
  ];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  return "yt-dlp";
})();

export type MusicStyle = "cinematic" | "action" | "drama" | "mystery";

const SC1_DUR   = 5;  // Scene 1a: Hook
const SC_POST   = 4;  // Scene 1b: Poster Reveal (merged with Hook = "Scene 1" combined 9s)
const SC2_DUR   = 6;  // Scene 2: Clip 1
const SC3_DUR   = 6;  // Scene 3: Clip 2
const SC_CLIP3  = 6;  // Scene 4: Clip 3
const SC4_DUR   = 7;  // Scene 5: Info/Highlight
const SC5_DUR   = 6;  // Scene 6: CTA Pro
// Transition durations: Hook↔Poster seamless (0.2s), all others (0.5s)
const T_INNER   = 0.2; // Hook→Poster (seamless dissolve, same "Scene 1")
const T_CROSS   = 0.5; // All cross-scene transitions
const TOTAL_DUR = SC1_DUR + SC_POST + SC2_DUR + SC3_DUR + SC_CLIP3 + SC4_DUR + SC5_DUR
                - T_INNER - (5 * T_CROSS); // ≈ 37.3s

const W = 720, H = 1280;
const LB = 108; // letterbox bar height (8.4% of 1280)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function esc(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/'/g,  "\u2019")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/:/g,  "\\:")
    .replace(/%/g,  "\\%");
}

async function downloadImage(url: string, dest: string): Promise<boolean> {
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
    return true;
  } catch { return false; }
}

function wrapTitle(raw: string, maxChars = 14): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const w of raw.toUpperCase().split(" ")) {
    if ((cur + " " + w).trim().length <= maxChars) cur = (cur + " " + w).trim();
    else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}

function handle(raw: string): string {
  const h = raw.trim().replace(/^@/, "");
  return h ? `@${h}` : "@MultiverseMovies_Bot";
}

// ---------------------------------------------------------------------------
// Trailer downloader — fetches raw file then extracts 3 clips + audio (6/6/6)
// ---------------------------------------------------------------------------

interface TrailerMaterial {
  clip1Path:      string;
  clip2Path:      string;
  clip3Path:      string;
  clip1AudioPath: string;
  clip2AudioPath: string;
  clip3AudioPath: string;
}

async function downloadTrailerMaterial(
  tmdbId:      number,
  mediaType:   string,
  tmdbApiKey:  string,
  tmpDir:      string,
  seekPercent: number = 0.42,
): Promise<TrailerMaterial | null> {
  try {
    const vidRes = await fetch(
      `https://api.themoviedb.org/3/${mediaType}/${tmdbId}/videos?api_key=${tmdbApiKey}`
    );
    if (!vidRes.ok) return null;
    const vidData = await vidRes.json() as any;
    const trailer =
      (vidData.results || []).find((v: any) => v.type === "Trailer" && v.site === "YouTube") ||
      (vidData.results || []).find((v: any) => v.site === "YouTube");
    if (!trailer?.key) { console.log("[TikTok] No YouTube trailer found."); return null; }

    if (!fs.existsSync(YT_DLP)) { console.warn("[TikTok] yt-dlp not found."); return null; }

    const ytUrl   = `https://www.youtube.com/watch?v=${trailer.key}`;
    const rawPath = path.join(tmpDir, `trailer_raw_${Date.now()}.mp4`);

    console.log(`[TikTok] Downloading trailer: ${trailer.name}`);
    await execAsync(
      `"${YT_DLP}" -f "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best" ` +
      `--merge-output-format mp4 --no-playlist ` +
      `--extractor-args "youtube:player_client=android,web" ` +
      `-o "${rawPath}" "${ytUrl}"`,
      { timeout: 120_000 },
    );
    if (!fs.existsSync(rawPath)) return null;

    const { stdout: durOut } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${rawPath}"`
    );
    const totalDur = parseFloat(durOut.trim()) || 90;
    const pct1     = Math.min(Math.max(seekPercent, 0), 0.80);
    const pct2     = Math.min(pct1 + 0.20, 0.90);
    const seekPos1 = Math.floor(totalDur * pct1);
    const seekPos2 = Math.floor(totalDur * pct2);

    const pct3     = Math.min(pct2 + 0.15, 0.95);
    const seekPos3 = Math.floor(totalDur * pct3);

    const ts             = Date.now();
    const clip1Path      = path.join(tmpDir, `clip1_${ts}.mp4`);
    const clip2Path      = path.join(tmpDir, `clip2_${ts}.mp4`);
    const clip3Path      = path.join(tmpDir, `clip3_${ts}.mp4`);
    const clip1AudioPath = path.join(tmpDir, `clip1_audio_${ts}.mp3`);
    const clip2AudioPath = path.join(tmpDir, `clip2_audio_${ts}.mp3`);
    const clip3AudioPath = path.join(tmpDir, `clip3_audio_${ts}.mp3`);

    const scaleFilter = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`;

    await execAsync(
      `ffmpeg -y -ss ${seekPos1} -i "${rawPath}" -t ${SC2_DUR} ` +
      `-vf "${scaleFilter}" -c:v libx264 -preset fast -crf 22 -pix_fmt yuv420p -an "${clip1Path}"`,
      { timeout: 60_000 },
    );
    await execAsync(
      `ffmpeg -y -ss ${seekPos2} -i "${rawPath}" -t ${SC3_DUR} ` +
      `-vf "${scaleFilter}" -c:v libx264 -preset fast -crf 22 -pix_fmt yuv420p -an "${clip2Path}"`,
      { timeout: 60_000 },
    );
    await execAsync(
      `ffmpeg -y -ss ${seekPos3} -i "${rawPath}" -t ${SC_CLIP3} ` +
      `-vf "${scaleFilter}" -c:v libx264 -preset fast -crf 22 -pix_fmt yuv420p -an "${clip3Path}"`,
      { timeout: 60_000 },
    );
    await execAsync(
      `ffmpeg -y -ss ${seekPos1} -i "${rawPath}" -t ${SC2_DUR} ` +
      `-vn -c:a libmp3lame -q:a 4 "${clip1AudioPath}"`,
      { timeout: 30_000 },
    );
    await execAsync(
      `ffmpeg -y -ss ${seekPos2} -i "${rawPath}" -t ${SC3_DUR} ` +
      `-vn -c:a libmp3lame -q:a 4 "${clip2AudioPath}"`,
      { timeout: 30_000 },
    );
    await execAsync(
      `ffmpeg -y -ss ${seekPos3} -i "${rawPath}" -t ${SC_CLIP3} ` +
      `-vn -c:a libmp3lame -q:a 4 "${clip3AudioPath}"`,
      { timeout: 30_000 },
    );

    try { fs.unlinkSync(rawPath); } catch {}

    const ok = [clip1Path, clip2Path, clip3Path, clip1AudioPath, clip2AudioPath, clip3AudioPath].every(p => fs.existsSync(p));
    if (!ok) return null;
    return { clip1Path, clip2Path, clip3Path, clip1AudioPath, clip2AudioPath, clip3AudioPath };
  } catch (err: any) {
    console.error("[TikTok] Trailer material error:", err?.stderr?.slice(0, 300) ?? err?.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Custom audio downloader
// ---------------------------------------------------------------------------

async function downloadCustomAudio(audioUrl: string, tmpDir: string): Promise<string | null> {
  const outPath = path.join(tmpDir, `custom_audio_${Date.now()}.mp3`);
  try {
    const isYouTube = /youtube\.com|youtu\.be/.test(audioUrl);
    if (isYouTube) {
      if (!fs.existsSync(YT_DLP)) { console.warn("[TikTok] yt-dlp not found for audio."); return null; }
      await execAsync(
        `"${YT_DLP}" -x --audio-format mp3 --audio-quality 5 --no-playlist -o "${outPath}" "${audioUrl}"`,
        { timeout: 90_000 },
      );
    } else {
      await execAsync(`curl -sL --max-time 60 -o "${outPath}" "${audioUrl}"`, { timeout: 70_000 });
    }
    if (!fs.existsSync(outPath) || fs.statSync(outPath).size < 1000) return null;
    console.log("[TikTok] Custom audio ready.");
    return outPath;
  } catch (err: any) {
    console.error("[TikTok] Custom audio error:", err?.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Music generation
// ---------------------------------------------------------------------------

async function generateMusic(
  tmpDir: string,
  style: MusicStyle = "cinematic",
  durationSec: number = TOTAL_DUR - 1,
): Promise<string | null> {
  const wavPath = path.join(tmpDir, `music_raw_${Date.now()}.wav`);
  const mp3Path = path.join(tmpDir, `music_${Date.now()}.mp3`);
  try {
    await execAsync(`python3 "${GEN_MUSIC}" "${wavPath}" ${style} ${durationSec}`, { timeout: 40_000 });
    if (!fs.existsSync(wavPath)) return null;

    const reverbMap: Record<MusicStyle, string> = {
      cinematic: "aecho=0.75:0.85:80|180|320:0.45|0.30|0.18",
      action:    "aecho=0.65:0.80:40|90:0.40|0.25",
      drama:     "aecho=0.80:0.88:120|240|400:0.50|0.35|0.20",
      mystery:   "aecho=0.82:0.90:200|380|600:0.50|0.38|0.22",
    };

    const fadeOut = durationSec - 2;
    const af = [
      reverbMap[style],
      "chorus=0.45:0.9:45|65:0.38|0.30:0.25|0.28:2|3",
      "volume=0.68",
      "afade=t=in:ss=0:d=1.5",
      `afade=t=out:ss=${fadeOut}:d=2.0`,
    ].join(",");

    await execAsync(`ffmpeg -y -i "${wavPath}" -af "${af}" -b:a 128k "${mp3Path}"`, { timeout: 30_000 });
    return fs.existsSync(mp3Path) ? mp3Path : null;
  } catch (err: any) {
    console.error("[TikTok] Music error:", err?.stderr ?? err?.message);
    return null;
  } finally {
    try { if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath); } catch {}
  }
}

// ---------------------------------------------------------------------------
// Scene 1 (0–5 s): HOOK — Premium
// Deep blur BG · heavy vignette · gold title glow · gold separator line
// "MULTIVERSE PRESENTS" and release year beneath title
// ---------------------------------------------------------------------------

async function buildScene1(
  movie:      Movie,
  posterPath: string,
  tmpDir:     string,
  ch:         string,  // channel handle e.g. "@MULTIVERSE"
): Promise<string | null> {
  const outPath  = path.join(tmpDir, `sc1_${Date.now()}.mp4`);
  const titleLines = wrapTitle(movie.title);
  const FS       = titleLines.length >= 3 ? 58 : titleLines.length === 2 ? 68 : 80;
  const LH       = FS + 14;
  const TITLE_Y  = Math.round(H * 0.30);
  const nLines   = titleLines.length;
  const GOLD     = "0xFFD700";
  const year     = movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : null;

  const vf: string[] = [];

  // Background
  vf.push(`scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`);
  vf.push(`gblur=sigma=30`);
  vf.push(`zoompan=z='min(zoom+0.0007,1.06)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=25`);
  // Subtle camera shake that calms
  vf.push(`crop=w=708:h=1268:x='6+5*sin(2*PI*t*7)*max(0,1-(t/1.2))':y='6+5*cos(2*PI*t*5)*max(0,1-(t/1.2))',scale=${W}:${H}`);
  // Deep cinematic warm grade
  vf.push(`eq=saturation=0.72:contrast=1.18:brightness=-0.05:gamma_r=1.10:gamma_b=0.80`);
  // Heavy vignette
  vf.push(`vignette=angle=PI/2.5`);
  // Dark overlay
  vf.push(`drawbox=x=0:y=0:w=${W}:h=${H}:color=black@0.78:t=fill`);
  // Cinematic grain
  vf.push(`noise=alls=15:allf=t+u`);

  // "PRESENTS" line
  vf.push(
    `drawtext=fontfile='${FONT_BOLD}':text='${esc(ch)}  PRESENTS':` +
    `fontsize=18:fontcolor=${GOLD}@0.65:` +
    `x=(w-text_w)/2:y=${TITLE_Y - 60}:alpha='min(1,t/0.5)'`
  );
  // Gold rule above title
  vf.push(
    `drawbox=x=180:y=${TITLE_Y - 22}:w=360:h=1:color=${GOLD}@0.50:t=fill`
  );

  // Triple-layer glow title
  titleLines.forEach((line, i) => {
    const t0   = 0.15 + i * 0.28;
    const yPos = TITLE_Y + i * LH;
    // Outer halo
    vf.push(
      `drawtext=fontfile='${FONT_BOLD}':text='${esc(line)}':fontsize=${FS}:` +
      `fontcolor=${GOLD}@0.08:bordercolor=${GOLD}@0.18:borderw=20:` +
      `x=(w-text_w)/2:y=${yPos}:alpha='if(gte(t,${t0}),min(1,(t-${t0})/0.22),0)'`
    );
    // Mid glow
    vf.push(
      `drawtext=fontfile='${FONT_BOLD}':text='${esc(line)}':fontsize=${FS}:` +
      `fontcolor=${GOLD}@0.15:bordercolor=${GOLD}@0.38:borderw=9:` +
      `x=(w-text_w)/2:y=${yPos}:alpha='if(gte(t,${t0}),min(1,(t-${t0})/0.22),0)'`
    );
    // Main gold text with white stroke + shadow
    vf.push(
      `drawtext=fontfile='${FONT_BOLD}':text='${esc(line)}':fontsize=${FS}:` +
      `fontcolor=${GOLD}:bordercolor=white:borderw=2:` +
      `shadowcolor=black@0.98:shadowx=5:shadowy=5:` +
      `x=(w-text_w)/2:y=${yPos}:alpha='if(gte(t,${t0}),min(1,(t-${t0})/0.22),0)'`
    );
  });

  // Gold separator line below title
  const sepY = TITLE_Y + nLines * LH + 14;
  vf.push(
    `drawbox=x=180:y=${sepY}:w=360:h=2:color=${GOLD}@0.80:t=fill`
  );

  // Year badge below separator
  if (year) {
    vf.push(
      `drawtext=fontfile='${FONT_REG}':text='${year}':fontsize=22:` +
      `fontcolor=white@0.75:` +
      `x=(w-text_w)/2:y=${sepY + 16}:alpha='if(gte(t,0.6),min(1,(t-0.6)/0.4),0)'`
    );
  }

  // Watermark at bottom
  vf.push(
    `drawtext=fontfile='${FONT_BOLD}':text='${esc(ch)}':fontsize=18:fontcolor=${GOLD}@0.40:` +
    `x=(w-text_w)/2:y=${H - 48}:alpha='min(1,t/0.5)'`
  );

  // Fade in + white flash at end
  vf.push(`fade=t=in:st=0:d=0.5`);
  vf.push(`drawbox=x=0:y=0:w=${W}:h=${H}:color=white@0.90:t=fill:enable='between(t,${SC1_DUR - 0.20},${SC1_DUR})'`);

  const cmd = [
    `ffmpeg -y -loop 1 -r 25 -t ${SC1_DUR} -i "${posterPath}"`,
    `-vf "${vf.join(",")}"`,
    `-an -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p -r 25`,
    `"${outPath}"`,
  ].join(" ");

  try {
    await execAsync(cmd, { timeout: 60_000 });
    return fs.existsSync(outPath) ? outPath : null;
  } catch (err: any) {
    console.error("[TikTok] Scene1 error:", err?.stderr?.slice(0, 800) ?? err?.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Scene 2 (5–9 s): POSTER REVEAL — Clean crisp movie poster showcase
// Real poster fills screen · cinematic borders · title badge · genre pills
// ---------------------------------------------------------------------------

async function buildPosterReveal(
  movie:      Movie,
  posterPath: string,
  tmpDir:     string,
  ch:         string,
): Promise<string | null> {
  const outPath = path.join(tmpDir, `scPoster_${Date.now()}.mp4`);
  const GOLD    = "0xFFD700";

  const title  = esc(movie.title.toUpperCase().slice(0, 28));
  const year   = movie.releaseDate ? new Date(movie.releaseDate).getFullYear().toString() : "";
  const genre  = movie.genre
    ? esc(movie.genre.split(",").map((g: string) => g.trim()).slice(0, 2).join("  ·  ").toUpperCase())
    : "";
  const qual   = esc((movie.quality || "HD").toUpperCase());
  const rating = movie.rating && movie.rating > 0
    ? esc(`★ ${(movie.rating / 10).toFixed(1)} IMDB`)
    : "";

  // Frame inset for poster display
  const FRAME_X = 50;
  const FRAME_Y = 80;
  const FRAME_W = W - 100;
  const FRAME_H = H - 280;

  const BADGE_Y  = FRAME_Y + FRAME_H + 24;
  const BADGE2_Y = BADGE_Y + 48;
  const BADGE3_Y = BADGE2_Y + 42;

  const vf: string[] = [];

  // === Full-screen poster fill with gentle pull-back zoom ===
  // Scale to fill entire canvas first (no padding — simpler/more robust)
  vf.push(`scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`);
  // Gentle zoom-out reveal using 'on' (frame count) — 't' is invalid in zoompan z=
  // At 25fps over 4s = 100 frames: 1.10 - 0.001*100 = 1.0 (lands at 1.0 exactly)
  vf.push(`zoompan=z='max(1.10-0.001*on,1.0)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=25`);
  // Warm cinematic grade
  vf.push(`eq=saturation=1.08:contrast=1.12:brightness=0.01:gamma_r=1.05:gamma_b=0.95`);

  // Semi-dark overlay so overlaid text is readable
  vf.push(`drawbox=x=0:y=0:w=${W}:h=${H}:color=black@0.42:t=fill`);

  // Gold outer frame around the poster area
  vf.push(`drawbox=x=${FRAME_X - 3}:y=${FRAME_Y - 3}:w=${FRAME_W + 6}:h=${FRAME_H + 6}:color=${GOLD}@0.90:t=3`);
  // Corner accent squares
  vf.push(`drawbox=x=${FRAME_X - 3}:y=${FRAME_Y - 3}:w=12:h=12:color=${GOLD}@0.90:t=fill`);
  vf.push(`drawbox=x=${FRAME_X + FRAME_W - 9}:y=${FRAME_Y - 3}:w=12:h=12:color=${GOLD}@0.90:t=fill`);
  vf.push(`drawbox=x=${FRAME_X - 3}:y=${FRAME_Y + FRAME_H - 9}:w=12:h=12:color=${GOLD}@0.90:t=fill`);
  vf.push(`drawbox=x=${FRAME_X + FRAME_W - 9}:y=${FRAME_Y + FRAME_H - 9}:w=12:h=12:color=${GOLD}@0.90:t=fill`);

  // Title pill below frame
  vf.push(`drawbox=x=${FRAME_X}:y=${BADGE_Y}:w=${FRAME_W}:h=42:color=black@0.82:t=fill`);
  vf.push(`drawbox=x=${FRAME_X}:y=${BADGE_Y}:w=${FRAME_W}:h=2:color=${GOLD}@0.90:t=fill`);
  vf.push(
    `drawtext=fontfile='${FONT_BOLD}':text='${title}':fontsize=27:` +
    `fontcolor=${GOLD}:bordercolor=black@0.5:borderw=1:` +
    `x=(w-text_w)/2:y=${BADGE_Y + 8}:alpha='min(1,t/0.4)'`
  );

  // Genre + year row
  if (genre || year) {
    const infoText = esc([genre, year, rating].filter(Boolean).join("   ·   "));
    vf.push(`drawbox=x=${FRAME_X}:y=${BADGE2_Y}:w=${FRAME_W}:h=36:color=black@0.68:t=fill`);
    vf.push(
      `drawtext=fontfile='${FONT_REG}':text='${infoText}':fontsize=19:` +
      `fontcolor=white@0.90:bordercolor=black:borderw=1:` +
      `x=(w-text_w)/2:y=${BADGE2_Y + 9}:alpha='if(gte(t,0.3),min(1,(t-0.3)/0.4),0)'`
    );
  }

  // Quality + channel badge at very bottom
  vf.push(`drawbox=x=${FRAME_X}:y=${BADGE3_Y}:w=${FRAME_W}:h=32:color=0xE50914@0.90:t=fill`);
  vf.push(
    `drawtext=fontfile='${FONT_BOLD}':text='${qual}  •  ${esc(ch)}':fontsize=17:` +
    `fontcolor=white:bordercolor=black@0.3:borderw=1:` +
    `x=(w-text_w)/2:y=${BADGE3_Y + 8}:alpha='if(gte(t,0.5),min(1,(t-0.5)/0.4),0)'`
  );

  // Subtle vignette
  vf.push(`vignette=angle=PI/3.5`);

  // Fade in + white flash at end
  vf.push(`fade=t=in:st=0:d=0.35`);
  vf.push(`drawbox=x=0:y=0:w=${W}:h=${H}:color=white@0.88:t=fill:enable='between(t,${SC_POST - 0.20},${SC_POST})'`);

  const cmd = [
    `ffmpeg -y -loop 1 -r 25 -t ${SC_POST} -i "${posterPath}"`,
    `-vf "${vf.join(",")}"`,
    `-an -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p -r 25`,
    `"${outPath}"`,
  ].join(" ");

  try {
    await execAsync(cmd, { timeout: 60_000 });
    return fs.existsSync(outPath) ? outPath : null;
  } catch (err: any) {
    console.error("[TikTok] PosterReveal error:", err?.stderr?.slice(0, 800) ?? err?.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Shared: build a "letterbox clip" scene
// Cinematic black bars top+bottom, pill-badge overlay, channel watermark
// ---------------------------------------------------------------------------

async function buildClipScene(
  clipNum:    1 | 2 | 3,
  clipPath:   string | null,
  posterPath: string,
  tmpDir:     string,
  ch:         string,
  dur:        number,
  movie:      Movie,
): Promise<string | null> {
  const outPath = path.join(tmpDir, `clip${clipNum}_${Date.now()}.mp4`);
  const GOLD    = "0xFFD700";
  const RED     = "0xFF4444";
  const CYAN    = "0x00D4FF";

  // Text content per clip
  const mainLabel = clipNum === 1 ? "NOW STREAMING" : clipNum === 2 ? "WATCH NOW" : "MUST SEE";
  const mainColor = clipNum === 1 ? RED : clipNum === 2 ? GOLD : CYAN;
  const subLabel  = clipNum === 1
    ? `Watch Free on ${esc(ch)}`
    : clipNum === 2
    ? `Available on ${esc(ch)}`
    : `Join ${esc(ch)} Now`;
  const clipTag   = `CLIP ${clipNum} OF 3`;

  // Safe area: content fits between letterbox bars
  const topBarEnd    = LB;           // 108
  const bottomBarTop = H - LB;       // 1172
  const textAreaH    = bottomBarTop - topBarEnd;

  // Main label Y = in top letterbox strip
  const mainLabelY  = Math.round(topBarEnd / 2) - 16;
  // Sub text Y = above bottom letterbox
  const subY        = bottomBarTop + Math.round(LB / 2) - 18;
  // Clip tag Y = bottom letterbox center
  const clipTagY    = bottomBarTop + Math.round(LB / 2) + 8;

  const vf: string[] = [];

  if (clipPath && fs.existsSync(clipPath)) {
    // Slight zoom on live clip
    vf.push(`zoompan=z='min(1+0.0003*on,1.03)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=25`);
    // Cinematic high contrast warm grade
    vf.push(`eq=saturation=1.12:contrast=1.28:brightness=-0.04:gamma_r=1.10:gamma_b=0.82`);
  } else {
    // Poster fallback
    vf.push(`scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`);
    vf.push(`zoompan=z='min(1+0.0018*on,1.30)':x='iw/2-(iw/zoom/2)+6*sin(on/5)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=25`);
    vf.push(`eq=saturation=1.20:contrast=1.25:brightness=-0.04:gamma_r=1.08:gamma_b=0.85`);
  }

  // Subtle warm vignette on the clip
  vf.push(`vignette=angle=PI/4`);
  // Film grain
  vf.push(`noise=alls=9:allf=t+u`);

  // ── Cinematic letterbox bars ──────────────────────────────────────────────
  // Top bar (solid black)
  vf.push(`drawbox=x=0:y=0:w=${W}:h=${LB}:color=black@1.0:t=fill`);
  // Bottom bar (solid black)
  vf.push(`drawbox=x=0:y=${H - LB}:w=${W}:h=${LB}:color=black@1.0:t=fill`);

  // ── Top bar content — main label ──────────────────────────────────────────
  // Pill background behind main label
  const pillW = clipNum === 1 ? 290 : clipNum === 2 ? 220 : 200;
  const pillX = Math.round((W - pillW) / 2);
  vf.push(
    `drawbox=x=${pillX}:y=${mainLabelY - 10}:w=${pillW}:h=50:color=${mainColor}@0.22:t=fill`
  );
  vf.push(
    `drawbox=x=${pillX}:y=${mainLabelY - 10}:w=${pillW}:h=2:color=${mainColor}@0.90:t=fill`
  );
  // Main label text
  vf.push(
    `drawtext=fontfile='${FONT_BOLD}':text='${mainLabel}':fontsize=28:` +
    `fontcolor=${mainColor}:bordercolor=black:borderw=2:` +
    `shadowcolor=black@0.8:shadowx=2:shadowy=2:` +
    `x=(w-text_w)/2:y='${mainLabelY}+20*max(0,1-t/0.5)':` +
    `alpha='min(1,t/0.4)'`
  );

  // ── Bottom bar content ────────────────────────────────────────────────────
  // Sub text — channel handle
  vf.push(
    `drawtext=fontfile='${FONT_BOLD}':text='${subLabel}':fontsize=22:` +
    `fontcolor=white:bordercolor=black:borderw=2:` +
    `shadowcolor=black@0.7:shadowx=2:shadowy=2:` +
    `x=(w-text_w)/2:y=${subY}:alpha='if(gte(t,0.3),min(1,(t-0.3)/0.4),0)'`
  );
  // Clip tag
  vf.push(
    `drawtext=fontfile='${FONT_REG}':text='${clipTag}':fontsize=16:` +
    `fontcolor=white@0.55:x=(w-text_w)/2:y=${clipTagY}:` +
    `alpha='if(gte(t,0.5),min(1,(t-0.5)/0.4),0)'`
  );

  // Gold dots separator decoration
  vf.push(
    `drawbox=x=${Math.round(W/2)-40}:y=${Math.round((topBarEnd + bottomBarTop)/2 - 1)}:w=80:h=2:color=${GOLD}@0.0:t=fill`
  );

  // Fade in
  vf.push(`fade=t=in:st=0:d=0.30`);

  const inputArgs = clipPath && fs.existsSync(clipPath)
    ? `-t ${dur} -i "${clipPath}"`
    : `-loop 1 -r 25 -t ${dur} -i "${posterPath}"`;

  const cmd = [
    `ffmpeg -y ${inputArgs}`,
    `-vf "${vf.join(",")}"`,
    `-an -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p -r 25`,
    `"${outPath}"`,
  ].join(" ");

  try {
    await execAsync(cmd, { timeout: 90_000 });
    return fs.existsSync(outPath) ? outPath : null;
  } catch (err: any) {
    console.error(`[TikTok] Clip${clipNum} scene error:`, err?.stderr?.slice(0, 800) ?? err?.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Scene 4 (17–24 s): HIGHLIGHT — Premium glass card
// Frosted-glass info card: genre · year · rating stars · cast
// ---------------------------------------------------------------------------

async function buildScene4(
  movie:      Movie,
  posterPath: string,
  tmpDir:     string,
  ch:         string,
): Promise<string | null> {
  const outPath  = path.join(tmpDir, `sc4_${Date.now()}.mp4`);
  const GOLD     = "0xFFD700";

  const genre = movie.genre
    ? esc(movie.genre.toUpperCase().split(",").map((g: string) => g.trim()).slice(0, 3).join("  \u2022  "))
    : "ACTION  \u2022  DRAMA  \u2022  THRILLER";

  const year   = movie.releaseDate ? new Date(movie.releaseDate).getFullYear().toString() : "";
  const ratingNum = movie.rating && movie.rating > 0 ? (movie.rating / 10) : 0;
  const ratingStars = ratingNum > 0
    ? esc("\u2605".repeat(Math.round(ratingNum / 2)) + "\u2606".repeat(5 - Math.round(ratingNum / 2)))
    : "";
  const ratingText  = ratingNum > 0 ? `${ratingNum.toFixed(1)}/10` : "";

  const castNames = Array.isArray(movie.cast) && movie.cast.length > 0
    ? esc(movie.cast.slice(0, 3).map((c: any) => c.name).join("  \u2022  "))
    : "";

  // Glass card dimensions
  const CARD_W = 580;
  const CARD_H = 290;
  const CARD_X = Math.round((W - CARD_W) / 2);
  const CARD_Y = Math.round(H * 0.34);

  const vf: string[] = [];

  // Background
  vf.push(`scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`);
  vf.push(`gblur=sigma=28`);
  vf.push(`zoompan=z='min(zoom+0.0008,1.05)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=25`);
  vf.push(`eq=saturation=0.70:contrast=1.20:brightness=-0.06:gamma_r=1.10:gamma_b=0.80`);
  vf.push(`vignette=angle=PI/2.2`);
  vf.push(`drawbox=x=0:y=0:w=${W}:h=${H}:color=black@0.72:t=fill`);
  vf.push(`noise=alls=12:allf=t+u`);

  // "STREAMING NOW" label above card
  vf.push(
    `drawtext=fontfile='${FONT_BOLD}':text='STREAMING  NOW':fontsize=20:` +
    `fontcolor=${GOLD}@0.90:` +
    `x=(w-text_w)/2:y=${CARD_Y - 50}:alpha='min(1,t/0.4)'`
  );
  // Gold rule above card
  vf.push(`drawbox=x=${CARD_X}:y=${CARD_Y - 20}:w=${CARD_W}:h=1:color=${GOLD}@0.60:t=fill`);

  // ── Glass card ──────────────────────────────────────────────────────────
  // Card background (semi-transparent dark glass)
  vf.push(`drawbox=x=${CARD_X}:y=${CARD_Y}:w=${CARD_W}:h=${CARD_H}:color=black@0.62:t=fill`);
  // Gold top accent border on card
  vf.push(`drawbox=x=${CARD_X}:y=${CARD_Y}:w=${CARD_W}:h=3:color=${GOLD}@0.90:t=fill`);
  // Subtle white right/left borders
  vf.push(`drawbox=x=${CARD_X}:y=${CARD_Y}:w=1:h=${CARD_H}:color=white@0.12:t=fill`);
  vf.push(`drawbox=x=${CARD_X + CARD_W - 1}:y=${CARD_Y}:w=1:h=${CARD_H}:color=white@0.12:t=fill`);

  const row1Y = CARD_Y + 30;
  const row2Y = CARD_Y + 90;
  const row3Y = CARD_Y + 150;
  const row4Y = CARD_Y + 210;

  // Genre row
  vf.push(
    `drawtext=fontfile='${FONT_BOLD}':text='${genre}':fontsize=24:` +
    `fontcolor=white:bordercolor=black@0.5:borderw=1:` +
    `x=(w-text_w)/2:y=${row1Y}:alpha='if(gte(t,0.25),min(1,(t-0.25)/0.5),0)'`
  );

  // Separator
  vf.push(`drawbox=x=${CARD_X + 40}:y=${row1Y + 38}:w=${CARD_W - 80}:h=1:color=white@0.15:t=fill`);

  // Year + rating text
  if (year || ratingText) {
    const infoText = esc([year, ratingText ? `${ratingText} IMDB` : ""].filter(Boolean).join("    "));
    vf.push(
      `drawtext=fontfile='${FONT_BOLD}':text='${infoText}':fontsize=24:` +
      `fontcolor=${GOLD}:bordercolor=black:borderw=1:` +
      `x=(w-text_w)/2:y=${row2Y}:alpha='if(gte(t,0.4),min(1,(t-0.4)/0.5),0)'`
    );
  }

  // Stars
  if (ratingStars) {
    vf.push(
      `drawtext=fontfile='${FONT_REG}':text='${ratingStars}':fontsize=28:` +
      `fontcolor=${GOLD}:x=(w-text_w)/2:y=${row3Y}:` +
      `alpha='if(gte(t,0.5),min(1,(t-0.5)/0.4),0)'`
    );
  }

  // Separator before cast
  vf.push(`drawbox=x=${CARD_X + 40}:y=${row3Y + 40}:w=${CARD_W - 80}:h=1:color=white@0.15:t=fill`);

  // Cast
  if (castNames) {
    vf.push(
      `drawtext=fontfile='${FONT_REG}':text='${castNames}':fontsize=20:` +
      `fontcolor=white@0.82:bordercolor=black:borderw=1:` +
      `x=(w-text_w)/2:y=${row4Y}:alpha='if(gte(t,0.6),min(1,(t-0.6)/0.4),0)'`
    );
  }

  // Gold bottom rule
  vf.push(`drawbox=x=${CARD_X}:y=${CARD_Y + CARD_H - 3}:w=${CARD_W}:h=3:color=${GOLD}@0.60:t=fill`);

  // Channel watermark
  vf.push(
    `drawtext=fontfile='${FONT_BOLD}':text='${esc(ch)}':fontsize=18:fontcolor=${GOLD}@0.45:` +
    `x=(w-text_w)/2:y=${H - 48}:alpha=0.6`
  );

  // Fade in + white flash
  vf.push(`fade=t=in:st=0:d=0.35`);
  vf.push(`drawbox=x=0:y=0:w=${W}:h=${H}:color=white@0.88:t=fill:enable='between(t,${SC4_DUR - 0.20},${SC4_DUR})'`);

  const cmd = [
    `ffmpeg -y -loop 1 -r 25 -t ${SC4_DUR} -i "${posterPath}"`,
    `-vf "${vf.join(",")}"`,
    `-an -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p -r 25`,
    `"${outPath}"`,
  ].join(" ");

  try {
    await execAsync(cmd, { timeout: 60_000 });
    return fs.existsSync(outPath) ? outPath : null;
  } catch (err: any) {
    console.error("[TikTok] Scene4 error:", err?.stderr?.slice(0, 800) ?? err?.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Scene 7 (34–40 s): CTA PRO — Ultra-premium multi-layer Call-To-Action
// Platform header · glowing platform badge · animated watch button · social
// proof bar · FOMO urgency strip · channel watermark + ripple pulse
// ---------------------------------------------------------------------------

async function buildScene5(
  movie:      Movie,
  posterPath: string,
  tmpDir:     string,
  ch:         string,
): Promise<string | null> {
  const outPath = path.join(tmpDir, `sc_cta_${Date.now()}.mp4`);
  const GOLD    = "0xFFD700";
  const RED1    = "0xB50010";
  const RED2    = "0xE50914";

  const movieTitle = esc(movie.title.toUpperCase().slice(0, 22));
  const isTV       = movie.type === "series";
  const typeLabel  = esc(isTV ? "SERIES" : "MOVIE");
  const watchText  = esc(`\u25B6  WATCH FREE NOW`);

  // Layout zones
  const BADGE_Y   = 190;
  const TITLE_Y   = BADGE_Y + 80;
  const DIVIDER_Y = TITLE_Y + 80;
  const BTN_W     = 540;
  const BTN_H     = 86;
  const BTN_X     = Math.round((W - BTN_W) / 2);
  const BTN_Y     = DIVIDER_Y + 50;
  const BTN_TY    = BTN_Y + Math.round((BTN_H - 38) / 2) + 2;
  const PROOF_Y   = BTN_Y + BTN_H + 36;
  const URGENCY_Y = PROOF_Y + 60;
  const SOCIAL_Y  = H - 140;

  const vf: string[] = [];

  // ── Deep cinematic background ──────────────────────────────────────────────
  vf.push(`scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`);
  vf.push(`gblur=sigma=36`);
  vf.push(`zoompan=z='min(zoom+0.0012,1.06)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=25`);
  vf.push(`eq=saturation=0.55:contrast=1.25:brightness=-0.10:gamma_r=1.12:gamma_b=0.75`);
  vf.push(`vignette=angle=PI/2.0`);
  vf.push(`noise=alls=14:allf=t+u`);
  // Dark scrim
  vf.push(`drawbox=x=0:y=0:w=${W}:h=${H}:color=black@0.72:t=fill`);
  // Subtle scan-line effect (horizontal dark stripes every 4px)
  vf.push(`drawbox=x=0:y=0:w=${W}:h=2:color=black@0.15:t=fill`);

  // ── Platform header badge ──────────────────────────────────────────────────
  // Full-width top banner
  vf.push(`drawbox=x=0:y=0:w=${W}:h=76:color=black@0.90:t=fill`);
  vf.push(`drawbox=x=0:y=74:w=${W}:h=3:color=${GOLD}@0.95:t=fill`);
  vf.push(
    `drawtext=fontfile='${FONT_BOLD}':text='MULTIVERSE  STREAMING':fontsize=24:` +
    `fontcolor=${GOLD}:bordercolor=black@0.4:borderw=2:` +
    `x=(w-text_w)/2:y=24:alpha='min(1,t/0.30)'`
  );

  // ── Glowing platform circle badge ─────────────────────────────────────────
  // Outer pulsing ring
  const CIRC_CX = Math.round(W / 2);
  const CIRC_CY = BADGE_Y + 32;
  const CIRC_R  = 32;
  const CIRC_X  = CIRC_CX - CIRC_R;
  const CIRC_Y  = CIRC_CY - CIRC_R;
  const CIRC_W  = CIRC_R * 2;
  // Outer glow ring (pulsing)
  vf.push(
    `drawbox=x=${CIRC_X - 8}:y='${CIRC_Y - 8}+3*sin(2*PI*t*1.8)':` +
    `w=${CIRC_W + 16}:h=${CIRC_W + 16}:color=${GOLD}@0.25:t=4`
  );
  vf.push(
    `drawbox=x=${CIRC_X - 4}:y='${CIRC_Y - 4}+3*sin(2*PI*t*1.8)':` +
    `w=${CIRC_W + 8}:h=${CIRC_W + 8}:color=${GOLD}@0.60:t=3`
  );
  // Badge fill
  vf.push(
    `drawbox=x=${CIRC_X}:y='${CIRC_Y}+3*sin(2*PI*t*1.8)':` +
    `w=${CIRC_W}:h=${CIRC_W}:color=0xC8000A@1.0:t=fill`
  );
  // ▶ play icon inside badge
  vf.push(
    `drawtext=fontfile='${FONT_BOLD}':text='\u25B6':fontsize=30:` +
    `fontcolor=white:x='${Math.round(W/2 - 10)}':y='${CIRC_CY - 17}+3*sin(2*PI*t*1.8)':` +
    `alpha='min(1,t/0.35)'`
  );

  // ── Type pill ─────────────────────────────────────────────────────────────
  const PILL_W = 120;
  const PILL_X = Math.round((W - PILL_W) / 2);
  const PILL_Y = BADGE_Y + 76;
  vf.push(`drawbox=x=${PILL_X}:y=${PILL_Y}:w=${PILL_W}:h=30:color=${GOLD}@0.18:t=fill`);
  vf.push(`drawbox=x=${PILL_X}:y=${PILL_Y}:w=${PILL_W}:h=2:color=${GOLD}@0.90:t=fill`);
  vf.push(
    `drawtext=fontfile='${FONT_BOLD}':text='${typeLabel}':fontsize=18:` +
    `fontcolor=${GOLD}:x=(w-text_w)/2:y=${PILL_Y + 6}:` +
    `alpha='if(gte(t,0.20),min(1,(t-0.20)/0.40),0)'`
  );

  // ── Movie title ───────────────────────────────────────────────────────────
  vf.push(
    `drawtext=fontfile='${FONT_BOLD}':text='${movieTitle}':fontsize=42:` +
    `fontcolor=white:bordercolor=black:borderw=3:` +
    `shadowcolor=black@0.95:shadowx=4:shadowy=4:` +
    `x=(w-text_w)/2:y=${TITLE_Y}:alpha='if(gte(t,0.30),min(1,(t-0.30)/0.40),0)'`
  );

  // Gold divider rule
  vf.push(`drawbox=x=80:y=${DIVIDER_Y}:w=${W - 160}:h=1:color=${GOLD}@0.60:t=fill`);

  // ── Main CTA button ───────────────────────────────────────────────────────
  // Outer glow (pulsing)
  vf.push(
    `drawbox=x=${BTN_X - 12}:y='${BTN_Y - 12}+5*sin(2*PI*t*1.6)':` +
    `w=${BTN_W + 24}:h=${BTN_H + 24}:color=${GOLD}@0.22:t=5`
  );
  vf.push(
    `drawbox=x=${BTN_X - 6}:y='${BTN_Y - 6}+5*sin(2*PI*t*1.6)':` +
    `w=${BTN_W + 12}:h=${BTN_H + 12}:color=${GOLD}@0.65:t=4`
  );
  // Button body left third (darkest red)
  vf.push(
    `drawbox=x=${BTN_X}:y='${BTN_Y}+5*sin(2*PI*t*1.6)':` +
    `w=${Math.round(BTN_W * 0.33)}:h=${BTN_H}:color=0x8B0000@1.0:t=fill`
  );
  // Button body middle third (mid red)
  vf.push(
    `drawbox=x=${BTN_X + Math.round(BTN_W * 0.33)}:y='${BTN_Y}+5*sin(2*PI*t*1.6)':` +
    `w=${Math.round(BTN_W * 0.34)}:h=${BTN_H}:color=${RED1}@1.0:t=fill`
  );
  // Button body right third (bright red)
  vf.push(
    `drawbox=x=${BTN_X + Math.round(BTN_W * 0.67)}:y='${BTN_Y}+5*sin(2*PI*t*1.6)':` +
    `w=${Math.round(BTN_W * 0.33)}:h=${BTN_H}:color=${RED2}@1.0:t=fill`
  );
  // Top shimmer line
  vf.push(
    `drawbox=x=${BTN_X}:y='${BTN_Y}+5*sin(2*PI*t*1.6)':` +
    `w=${BTN_W}:h=4:color=${GOLD}@0.98:t=fill`
  );
  // Bottom accent line
  vf.push(
    `drawbox=x=${BTN_X}:y='${BTN_Y + BTN_H - 3}+5*sin(2*PI*t*1.6)':` +
    `w=${BTN_W}:h=3:color=${GOLD}@0.55:t=fill`
  );
  // Inner highlight (top edge shimmer)
  vf.push(
    `drawbox=x=${BTN_X + 4}:y='${BTN_Y + 4}+5*sin(2*PI*t*1.6)':` +
    `w=${BTN_W - 8}:h=1:color=white@0.22:t=fill`
  );
  // Button label — bouncing
  vf.push(
    `drawtext=fontfile='${FONT_BOLD}':text='${watchText}':fontsize=30:` +
    `fontcolor=white:bordercolor=black@0.35:borderw=1:` +
    `shadowcolor=black@0.65:shadowx=2:shadowy=2:` +
    `x=(w-text_w)/2:y='${BTN_TY}+5*sin(2*PI*t*1.6)':alpha='min(1,t/0.22)'`
  );

  // ── Social proof bar ──────────────────────────────────────────────────────
  vf.push(`drawbox=x=60:y=${PROOF_Y}:w=${W - 120}:h=50:color=white@0.06:t=fill`);
  vf.push(`drawbox=x=60:y=${PROOF_Y}:w=${W - 120}:h=1:color=white@0.25:t=fill`);
  vf.push(`drawbox=x=60:y=${PROOF_Y + 49}:w=${W - 120}:h=1:color=white@0.25:t=fill`);
  vf.push(
    `drawtext=fontfile='${FONT_REG}':text='Free  \u2022  HD Quality  \u2022  No Signup Required':fontsize=20:` +
    `fontcolor=white@0.80:bordercolor=black:borderw=1:` +
    `x=(w-text_w)/2:y=${PROOF_Y + 14}:` +
    `alpha='if(gte(t,0.45),min(1,(t-0.45)/0.40),0)'`
  );

  // ── FOMO urgency strip ────────────────────────────────────────────────────
  vf.push(`drawbox=x=0:y=${URGENCY_Y}:w=${W}:h=44:color=0xC8000A@0.95:t=fill`);
  vf.push(`drawbox=x=0:y=${URGENCY_Y}:w=${W}:h=2:color=${GOLD}@0.85:t=fill`);
  vf.push(`drawbox=x=0:y=${URGENCY_Y + 42}:w=${W}:h=2:color=${GOLD}@0.85:t=fill`);
  vf.push(
    `drawtext=fontfile='${FONT_BOLD}':text='\u26A1  LIMITED TIME  \u2022  WATCH BEFORE IT\u2019S GONE  \u26A1':fontsize=19:` +
    `fontcolor=white:bordercolor=black@0.3:borderw=1:` +
    `x=(w-text_w)/2:y=${URGENCY_Y + 12}:` +
    `alpha='if(gte(t,0.55),min(1,(t-0.55)/0.35),0)'`
  );

  // ── Bottom social strip ───────────────────────────────────────────────────
  vf.push(`drawbox=x=0:y=${SOCIAL_Y - 10}:w=${W}:h=80:color=black@0.85:t=fill`);
  vf.push(`drawbox=x=0:y=${SOCIAL_Y - 10}:w=${W}:h=2:color=${GOLD}@0.70:t=fill`);
  vf.push(
    `drawtext=fontfile='${FONT_BOLD}':text='FOLLOW  ${esc(ch)}  FOR MORE':fontsize=22:` +
    `fontcolor=${GOLD}:bordercolor=black@0.4:borderw=1:` +
    `x=(w-text_w)/2:y=${SOCIAL_Y + 6}:alpha=0.90`
  );
  vf.push(
    `drawtext=fontfile='${FONT_REG}':text='1000+  MOVIES  \u2022  FREE  \u2022  HD':fontsize=18:` +
    `fontcolor=white@0.65:x=(w-text_w)/2:y=${SOCIAL_Y + 36}:alpha=0.80`
  );

  // Fade in + final fade out
  vf.push(`fade=t=in:st=0:d=0.45,fade=t=out:st=${SC5_DUR - 1.5}:d=1.5`);

  const cmd = [
    `ffmpeg -y -loop 1 -r 25 -t ${SC5_DUR} -i "${posterPath}"`,
    `-vf "${vf.join(",")}"`,
    `-an -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p -r 25`,
    `"${outPath}"`,
  ].join(" ");

  try {
    await execAsync(cmd, { timeout: 60_000 });
    return fs.existsSync(outPath) ? outPath : null;
  } catch (err: any) {
    console.error("[TikTok] CTA Pro error:", err?.stderr?.slice(0, 800) ?? err?.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Master builder — 6 scenes + xfade transitions → audio mix
// Scene 1 = Hook(5s) + PosterReveal(4s) seamlessly merged (0.2s dissolve)
// Scene 2/3/4 = trailer clips (6s each)
// Scene 5 = Info/Highlight (7s)
// Scene 6 = CTA Pro (6s)
// Between every scene: cinematic xfade transition (0.5s)
// ---------------------------------------------------------------------------

async function buildPromoVideo(
  movie:       Movie,
  posterPath:  string,
  trailerMat:  TrailerMaterial | null,
  musicPath:   string | null,
  outPath:     string,
  ch:          string,
): Promise<boolean> {
  const tmpDir = path.dirname(outPath);

  console.log("[TikTok] Scene 1a: Hook (5 s)…");
  const sc1 = await buildScene1(movie, posterPath, tmpDir, ch);

  console.log("[TikTok] Scene 1b: Poster Reveal (4 s)…");
  const scPoster = await buildPosterReveal(movie, posterPath, tmpDir, ch);

  console.log("[TikTok] Scene 2: Trailer Clip 1 (6 s)…");
  const sc2 = await buildClipScene(1, trailerMat?.clip1Path ?? null, posterPath, tmpDir, ch, SC2_DUR, movie);

  console.log("[TikTok] Scene 3: Trailer Clip 2 (6 s)…");
  const sc3 = await buildClipScene(2, trailerMat?.clip2Path ?? null, posterPath, tmpDir, ch, SC3_DUR, movie);

  console.log("[TikTok] Scene 4: Trailer Clip 3 (6 s)…");
  const scClip3 = await buildClipScene(3, trailerMat?.clip3Path ?? null, posterPath, tmpDir, ch, SC_CLIP3, movie);

  console.log("[TikTok] Scene 5: Info/Highlight (7 s)…");
  const sc4 = await buildScene4(movie, posterPath, tmpDir, ch);

  console.log("[TikTok] Scene 6: CTA Pro (6 s)…");
  const sc5 = await buildScene5(movie, posterPath, tmpDir, ch);

  if (!sc1 || !scPoster || !sc2 || !sc3 || !scClip3 || !sc4 || !sc5) {
    console.error("[TikTok] One or more scenes failed.");
    for (const f of [sc1, scPoster, sc2, sc3, scClip3, sc4, sc5]) {
      if (f) try { fs.unlinkSync(f); } catch {}
    }
    return false;
  }

  // ── XFade transition concat (re-encodes with cinematic transitions) ─────────
  // Offsets are cumulative; each scene adds (duration - transition_overlap) to the offset.
  // Hook→Poster: seamless 0.2s dissolve (same "Scene 1")
  // All other scene boundaries: 0.5s cinematic transitions
  //
  // offset formula: previous_offset + previous_clip_duration - transition_duration
  //   off01 = 5   - 0.2  = 4.8   (Hook → Poster Reveal, seamless)
  //   off12 = 4.8 + 4    - 0.5   = 8.3   (Poster → Clip 1, fadeblack)
  //   off23 = 8.3 + 6    - 0.5   = 13.8  (Clip 1 → Clip 2, slideleft)
  //   off34 = 13.8 + 6   - 0.5   = 19.3  (Clip 2 → Clip 3, slideright)
  //   off45 = 19.3 + 6   - 0.5   = 24.8  (Clip 3 → Info, smoothleft)
  //   off56 = 24.8 + 7   - 0.5   = 31.3  (Info → CTA, circleopen)

  const ts           = Date.now();
  const videoOnlyOut = path.join(tmpDir, `video_only_${ts}.mp4`);
  const scenes = [sc1, scPoster, sc2, sc3, scClip3, sc4, sc5];

  const filterComplex = [
    `[0:v][1:v]xfade=transition=fade:duration=${T_INNER}:offset=4.8[v01]`,
    `[v01][2:v]xfade=transition=fadeblack:duration=${T_CROSS}:offset=8.3[v02]`,
    `[v02][3:v]xfade=transition=slideleft:duration=${T_CROSS}:offset=13.8[v03]`,
    `[v03][4:v]xfade=transition=slideright:duration=${T_CROSS}:offset=19.3[v04]`,
    `[v04][5:v]xfade=transition=smoothleft:duration=${T_CROSS}:offset=24.8[v05]`,
    `[v05][6:v]xfade=transition=circleopen:duration=${T_CROSS}:offset=31.3[vout]`,
  ].join(";");

  const inputFlags = scenes.map(s => `-i "${s}"`).join(" ");
  const xfadeCmd = [
    `ffmpeg -y ${inputFlags}`,
    `-filter_complex "${filterComplex}"`,
    `-map "[vout]" -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p -r 25 -an`,
    `"${videoOnlyOut}"`,
  ].join(" ");

  try {
    console.log("[TikTok] Applying xfade transitions between scenes…");
    await execAsync(xfadeCmd, { timeout: 120_000 });
  } catch (err: any) {
    console.error("[TikTok] XFade error:", err?.stderr?.slice(0, 1500) ?? err?.message);
    return false;
  } finally {
    for (const f of scenes) {
      try { if (f && fs.existsSync(f)) fs.unlinkSync(f); } catch {}
    }
  }

  if (!fs.existsSync(videoOnlyOut)) return false;

  // Audio delays account for xfade overlap:
  //   clip1 starts at: Hook(5s) + Poster(4s) - T_INNER(0.2) - T_CROSS(0.5) ≈ 8.3s
  //   clip2 starts at: 8.3 + Clip1(6s) - T_CROSS(0.5) ≈ 13.8s
  //   clip3 starts at: 13.8 + Clip2(6s) - T_CROSS(0.5) ≈ 19.3s
  const clip1Delay = Math.round((SC1_DUR + SC_POST - T_INNER - T_CROSS) * 1000); // ~8300ms
  const clip2Delay = Math.round((clip1Delay / 1000 + SC2_DUR - T_CROSS) * 1000); // ~13800ms
  const clip3Delay = Math.round((clip2Delay / 1000 + SC3_DUR - T_CROSS) * 1000); // ~19300ms
  const fadeOutAt  = TOTAL_DUR - 2;
  let finalCmd: string;

  if (musicPath && trailerMat?.clip1AudioPath && trailerMat?.clip2AudioPath && trailerMat?.clip3AudioPath) {
    const c1a = trailerMat.clip1AudioPath;
    const c2a = trailerMat.clip2AudioPath;
    const c3a = trailerMat.clip3AudioPath;
    finalCmd = [
      `ffmpeg -y`,
      `-i "${videoOnlyOut}" -i "${musicPath}" -i "${c1a}" -i "${c2a}" -i "${c3a}"`,
      `-filter_complex`,
      `"[1:a]volume=0.28,afade=t=in:ss=0:d=1.5,afade=t=out:ss=${fadeOutAt}:d=2.0[music];`,
      `[2:a]adelay=${clip1Delay}|${clip1Delay},volume=1.0[ca1];`,
      `[3:a]adelay=${clip2Delay}|${clip2Delay},volume=1.0[ca2];`,
      `[4:a]adelay=${clip3Delay}|${clip3Delay},volume=1.0[ca3];`,
      `[music][ca1][ca2][ca3]amix=inputs=4:duration=first:normalize=0[aout]"`,
      `-map 0:v -map "[aout]" -c:v copy -c:a aac -b:a 128k -movflags +faststart`,
      `"${outPath}"`,
    ].join(" ");
  } else if (musicPath && trailerMat?.clip1AudioPath && trailerMat?.clip2AudioPath) {
    const c1a = trailerMat.clip1AudioPath;
    const c2a = trailerMat.clip2AudioPath;
    finalCmd = [
      `ffmpeg -y`,
      `-i "${videoOnlyOut}" -i "${musicPath}" -i "${c1a}" -i "${c2a}"`,
      `-filter_complex`,
      `"[1:a]volume=0.28,afade=t=in:ss=0:d=1.5,afade=t=out:ss=${fadeOutAt}:d=2.0[music];`,
      `[2:a]adelay=${clip1Delay}|${clip1Delay},volume=1.0[ca1];`,
      `[3:a]adelay=${clip2Delay}|${clip2Delay},volume=1.0[ca2];`,
      `[music][ca1][ca2]amix=inputs=3:duration=first:normalize=0[aout]"`,
      `-map 0:v -map "[aout]" -c:v copy -c:a aac -b:a 128k -movflags +faststart`,
      `"${outPath}"`,
    ].join(" ");
  } else if (musicPath && trailerMat?.clip1AudioPath) {
    const c1a = trailerMat.clip1AudioPath;
    finalCmd = [
      `ffmpeg -y -i "${videoOnlyOut}" -i "${musicPath}" -i "${c1a}"`,
      `-filter_complex`,
      `"[1:a]volume=0.28,afade=t=in:ss=0:d=1.5,afade=t=out:ss=${fadeOutAt}:d=2.0[music];`,
      `[2:a]adelay=${clip1Delay}|${clip1Delay},volume=1.0[ca1];`,
      `[music][ca1]amix=inputs=2:duration=first:normalize=0[aout]"`,
      `-map 0:v -map "[aout]" -c:v copy -c:a aac -b:a 128k -movflags +faststart`,
      `"${outPath}"`,
    ].join(" ");
  } else if (musicPath) {
    finalCmd = [
      `ffmpeg -y -i "${videoOnlyOut}" -i "${musicPath}"`,
      `-c:v copy -af "volume=0.70,afade=t=in:ss=0:d=1.5,afade=t=out:ss=${fadeOutAt}:d=2.0"`,
      `-c:a aac -b:a 128k -movflags +faststart`,
      `"${outPath}"`,
    ].join(" ");
  } else {
    finalCmd = `ffmpeg -y -i "${videoOnlyOut}" -c:v copy -an -movflags +faststart "${outPath}"`;
  }

  try {
    await execAsync(finalCmd, { timeout: 90_000 });
    return fs.existsSync(outPath) && fs.statSync(outPath).size > 10_000;
  } catch (err: any) {
    console.error("[TikTok] Audio mix error:", err?.stderr?.slice(0, 800) ?? err?.message);
    return false;
  } finally {
    try { if (fs.existsSync(videoOnlyOut)) fs.unlinkSync(videoOnlyOut); } catch {}
  }
}

// ---------------------------------------------------------------------------
// Telegram senders
// ---------------------------------------------------------------------------

async function sendVideoToTelegram(
  botToken: string, chatId: string, caption: string, videoPath: string,
): Promise<void> {
  const form = new FormData();
  form.append("chat_id",            chatId);
  form.append("caption",            caption);
  form.append("parse_mode",         "HTML");
  form.append("supports_streaming", "true");
  form.append("video", fs.createReadStream(videoPath), {
    filename: path.basename(videoPath), contentType: "video/mp4",
  });
  await new Promise<void>((resolve, reject) => {
    const req = https.request(
      { hostname: "api.telegram.org", path: `/bot${botToken}/sendVideo`, method: "POST", headers: form.getHeaders() },
      (res) => {
        let body = "";
        res.on("data", (c) => { body += c; });
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) resolve();
          else reject(new Error(`sendVideo ${res.statusCode}: ${body}`));
        });
      },
    );
    req.on("error", reject);
    form.pipe(req);
  });
}

async function sendPhotoToTelegram(
  botToken: string, chatId: string, caption: string, photoUrl: string | null,
): Promise<void> {
  const base = `${TG_BASE}${botToken}`;
  const pay  = { chat_id: chatId, caption, parse_mode: "HTML" } as Record<string, unknown>;
  if (photoUrl) {
    pay["photo"] = photoUrl;
    const r = await fetch(`${base}/sendPhoto`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pay),
    });
    if (!r.ok) throw new Error(`sendPhoto ${r.status}: ${await r.text()}`);
  } else {
    const r = await fetch(`${base}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: caption }),
    });
    if (!r.ok) throw new Error(`sendMessage ${r.status}: ${await r.text()}`);
  }
}

// ---------------------------------------------------------------------------
// Caption builder
// ---------------------------------------------------------------------------

function buildCaption(movie: Movie, ch: string): string {
  const title  = movie.title;
  const year   = movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : null;
  const rating = movie.rating && movie.rating > 0 ? (movie.rating / 10).toFixed(1) : null;
  const genre  = movie.genre || null;
  const qual   = movie.quality || null;
  const isTV   = movie.type === "series";

  const hook = `🔥 ${title.toUpperCase()} — You NEED to watch this ${isTV ? "series" : "movie"}!`;
  const pts  = [] as string[];
  if (genre)  pts.push(`🎬 Genre: ${genre}`);
  if (year)   pts.push(`📅 Year: ${year}`);
  if (rating) pts.push(`⭐ Rating: ${rating}/10`);
  if (qual)   pts.push(`📺 Quality: ${qual}`);
  if (movie.overview && movie.overview.length < 200)
    pts.push(`📖 ${movie.overview.split(".")[0]}.`);

  const tag  = title.replace(/[^a-zA-Z0-9]/g, "");
  const cta  = `💫 Follow ${ch} for more!`;
  const tags = `#${tag} #${isTV ? "TVSeries" : "Movie"} #Multiverse #Streaming #MustWatch`;

  let text = [hook, "", ...pts.map((p, i) => `${i + 1}. ${p}`), "", cta, "", tags].join("\n");
  if (text.length > 1024) text = text.slice(0, 1021) + "...";
  return text;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function generateAndSendTikTok(
  movie:      Movie,
  musicStyle: MusicStyle = "cinematic",
  options: {
    clipPercent?:    number;
    customAudioUrl?: string;
    channelHandle?:  string;
  } = {},
): Promise<void> {
  const s        = await storage.getSettings();
  const botToken = s?.botToken?.trim()          ?? "";
  const chatId   = s?.tiktokAdminChatId?.trim() ?? "";

  if (!botToken) { console.log("[TikTok] Skipped — no bot token."); return; }
  if (!chatId)   { console.log("[TikTok] Skipped — no TikTok admin chat ID."); return; }

  const ch = handle(options.channelHandle || "MultiverseMovies_Bot");

  let photoUrl: string | null = null;
  if (movie.posterPath) {
    photoUrl = movie.posterPath.startsWith("http")
      ? movie.posterPath
      : `${TMDB_IMG}${movie.posterPath}`;
  }

  const caption    = buildCaption(movie, ch);
  const tmpDir     = os.tmpdir();
  const safe       = movie.title.replace(/[^a-z0-9]/gi, "_").slice(0, 28);
  const ts         = Date.now();
  const posterTmp  = path.join(tmpDir, `mv_poster_${safe}_${ts}.jpg`);
  const videoTmp   = path.join(tmpDir, `mv_promo_${safe}_${ts}.mp4`);
  let   musicTmp:   string | null = null;
  let   trailerMat: TrailerMaterial | null = null;
  let   videoSent  = false;

  try {
    if (photoUrl) {
      console.log(`[TikTok] Downloading poster for "${movie.title}"…`);
      const ok = await downloadImage(photoUrl, posterTmp);

      if (ok) {
        if (movie.tmdbId && s?.tmdbApiKey) {
          const seekPct  = typeof options.clipPercent === "number" ? options.clipPercent : 0.42;
          const seekPct2 = Math.min(seekPct + 0.20, 0.90);
          const seekPct3 = Math.min(seekPct2 + 0.15, 0.95);
          console.log(`[TikTok] Fetching 3×6s clips (6/6/6) @ ${Math.round(seekPct * 100)}%, ${Math.round(seekPct2 * 100)}%, ${Math.round(seekPct3 * 100)}%…`);
          const mediaType = movie.type === "series" ? "tv" : "movie";
          trailerMat = await downloadTrailerMaterial(movie.tmdbId, mediaType, s.tmdbApiKey, tmpDir, seekPct);
          if (trailerMat) console.log("[TikTok] 3 clips + audio ready (6/6/6 format).");
          else            console.warn("[TikTok] Trailer unavailable — using poster animation.");
        }

        if (options.customAudioUrl?.trim()) {
          console.log(`[TikTok] Downloading custom audio…`);
          musicTmp = await downloadCustomAudio(options.customAudioUrl.trim(), tmpDir);
          if (!musicTmp) {
            console.warn("[TikTok] Custom audio failed — using generated music.");
            musicTmp = await generateMusic(tmpDir, musicStyle);
          }
        } else {
          console.log(`[TikTok] Generating ${musicStyle} music (${TOTAL_DUR} s)…`);
          musicTmp = await generateMusic(tmpDir, musicStyle);
          if (musicTmp) console.log("[TikTok] Music ready.");
          else          console.warn("[TikTok] Music failed — silent video.");
        }

        console.log(`[TikTok] Rendering premium 7-scene 40s promo for ${ch}…`);
        const built = await buildPromoVideo(movie, posterTmp, trailerMat, musicTmp, videoTmp, ch);

        if (built) {
          const sizeMB = (fs.statSync(videoTmp).size / 1_048_576).toFixed(1);
          console.log(`[TikTok] Uploading ${sizeMB} MB → Telegram…`);
          await sendVideoToTelegram(botToken, chatId, caption, videoTmp);
          videoSent = true;
          console.log(`[TikTok] ✓ Premium video sent for "${movie.title}"`);
        } else {
          console.warn("[TikTok] Render failed — sending photo fallback.");
        }
      }
    }

    if (!videoSent) {
      await sendPhotoToTelegram(botToken, chatId, caption, photoUrl);
      console.log(`[TikTok] ✓ Photo (fallback) sent for "${movie.title}"`);
    }
  } catch (err: any) {
    console.error(`[TikTok] Error for "${movie.title}":`, err?.message ?? err);
  } finally {
    const audioFiles = trailerMat
      ? [
          trailerMat.clip1Path, trailerMat.clip2Path, trailerMat.clip3Path,
          trailerMat.clip1AudioPath, trailerMat.clip2AudioPath, trailerMat.clip3AudioPath,
        ]
      : [];
    for (const f of [posterTmp, videoTmp, musicTmp, ...audioFiles]) {
      if (f) try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
    }
  }
}
