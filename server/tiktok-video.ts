/**
 * tiktok-video.ts  —  5-Scene 30-Second Premium Cinematic Promo Generator
 * -------------------------------------------------------------------------
 * Scene 1 (0–5 s)  : Hook      — Blurred poster + gold title + vignette
 * Scene 2 (5–11 s) : Clip 1    — Letterbox trailer + "NOW STREAMING" pill
 * Scene 3 (11–17 s): Clip 2    — Letterbox trailer + "WATCH NOW" pill
 * Scene 4 (17–24 s): Highlight — Glass card with genre / cast / rating
 * Scene 5 (24–30 s): CTA       — Premium gradient button + gold border
 *
 * Audio: generated music at 30% + real trailer audio at 100% (clips 2 & 3)
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

const SC1_DUR   = 5;
const SC2_DUR   = 6;
const SC3_DUR   = 6;
const SC4_DUR   = 7;
const SC5_DUR   = 6;
const TOTAL_DUR = SC1_DUR + SC2_DUR + SC3_DUR + SC4_DUR + SC5_DUR; // 30

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
// Trailer downloader — fetches raw file then extracts 2 clips + audio
// ---------------------------------------------------------------------------

interface TrailerMaterial {
  clip1Path:      string;
  clip2Path:      string;
  clip1AudioPath: string;
  clip2AudioPath: string;
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
      `--merge-output-format mp4 --no-playlist -o "${rawPath}" "${ytUrl}"`,
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

    const ts             = Date.now();
    const clip1Path      = path.join(tmpDir, `clip1_${ts}.mp4`);
    const clip2Path      = path.join(tmpDir, `clip2_${ts}.mp4`);
    const clip1AudioPath = path.join(tmpDir, `clip1_audio_${ts}.mp3`);
    const clip2AudioPath = path.join(tmpDir, `clip2_audio_${ts}.mp3`);

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
      `ffmpeg -y -ss ${seekPos1} -i "${rawPath}" -t ${SC2_DUR} ` +
      `-vn -c:a libmp3lame -q:a 4 "${clip1AudioPath}"`,
      { timeout: 30_000 },
    );
    await execAsync(
      `ffmpeg -y -ss ${seekPos2} -i "${rawPath}" -t ${SC3_DUR} ` +
      `-vn -c:a libmp3lame -q:a 4 "${clip2AudioPath}"`,
      { timeout: 30_000 },
    );

    try { fs.unlinkSync(rawPath); } catch {}

    const ok = [clip1Path, clip2Path, clip1AudioPath, clip2AudioPath].every(p => fs.existsSync(p));
    if (!ok) return null;
    return { clip1Path, clip2Path, clip1AudioPath, clip2AudioPath };
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
// Shared: build a "letterbox clip" scene
// Cinematic black bars top+bottom, pill-badge overlay, channel watermark
// ---------------------------------------------------------------------------

async function buildClipScene(
  clipNum:    1 | 2,
  clipPath:   string | null,
  posterPath: string,
  tmpDir:     string,
  ch:         string,
  dur:        number,
  movie:      Movie,
): Promise<string | null> {
  const outPath = path.join(tmpDir, `sc${clipNum + 1}_${Date.now()}.mp4`);
  const GOLD    = "0xFFD700";
  const isClip1 = clipNum === 1;

  // Text content
  const mainLabel = isClip1 ? "NOW STREAMING" : "WATCH NOW";
  const mainColor = isClip1 ? "0xFF4444" : GOLD;
  const subLabel  = isClip1
    ? `Watch Free on ${esc(ch)}`
    : `Available on ${esc(ch)}`;
  const clipTag   = isClip1 ? "CLIP 1 OF 2" : "CLIP 2 OF 2";

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
  const pillW = isClip1 ? 290 : 210;
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
    console.error(`[TikTok] Scene${clipNum + 1} error:`, err?.stderr?.slice(0, 800) ?? err?.message);
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
// Scene 5 (24–30 s): CTA — Premium gradient button + gold accent border
// ---------------------------------------------------------------------------

async function buildScene5(
  movie:      Movie,
  posterPath: string,
  tmpDir:     string,
  ch:         string,
): Promise<string | null> {
  const outPath = path.join(tmpDir, `sc5_${Date.now()}.mp4`);
  const GOLD    = "0xFFD700";

  const BOX_W   = 500;
  const BOX_H   = 82;
  const BOX_X   = Math.round((W - BOX_W) / 2);
  const BOX_Y   = Math.round(H * 0.56);
  const TEXT_Y  = BOX_Y + Math.round((BOX_H - 38) / 2) + 1;

  const watchText = esc(`\u25B6  WATCH ON ${ch}`);

  const vf: string[] = [];

  // Background
  vf.push(`scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`);
  vf.push(`gblur=sigma=32`);
  vf.push(`zoompan=z='min(zoom+0.0018,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=25`);
  vf.push(`eq=saturation=0.70:contrast=1.20:brightness=-0.05:gamma_r=1.10:gamma_b=0.80`);
  vf.push(`vignette=angle=PI/2.2`);
  vf.push(`noise=alls=12:allf=t+u`);
  vf.push(`drawbox=x=0:y=0:w=${W}:h=${H}:color=black@0.55:t=fill`);

  // "DON'T MISS IT" premium header
  vf.push(
    `drawtext=fontfile='${FONT_BOLD}':text='DON\u2019T MISS IT':fontsize=30:` +
    `fontcolor=white@0.95:bordercolor=black:borderw=2:` +
    `shadowcolor=black@0.9:shadowx=3:shadowy=3:` +
    `x=(w-text_w)/2:y=${BOX_Y - 80}:alpha='min(1,t/0.35)'`
  );
  // Gold accent rule above CTA
  vf.push(`drawbox=x=${BOX_X + 40}:y=${BOX_Y - 42}:w=${BOX_W - 80}:h=2:color=${GOLD}@0.75:t=fill`);

  // ── Premium gradient button ────────────────────────────────────────────
  // Outer gold glow ring (pulsing)
  vf.push(
    `drawbox=x=${BOX_X - 10}:y='${BOX_Y - 10}+4*sin(2*PI*t*2.0)':` +
    `w=${BOX_W + 20}:h=${BOX_H + 20}:color=${GOLD}@0.30:t=4`
  );
  vf.push(
    `drawbox=x=${BOX_X - 5}:y='${BOX_Y - 5}+4*sin(2*PI*t*2.0)':` +
    `w=${BOX_W + 10}:h=${BOX_H + 10}:color=${GOLD}@0.70:t=3`
  );
  // Button body — deep red left 2/3
  vf.push(
    `drawbox=x=${BOX_X}:y='${BOX_Y}+4*sin(2*PI*t*2.0)':` +
    `w=${Math.round(BOX_W * 0.66)}:h=${BOX_H}:color=0xB50010@1.0:t=fill`
  );
  // Button body — brighter red right 1/3 (gradient simulation)
  vf.push(
    `drawbox=x=${BOX_X + Math.round(BOX_W * 0.66)}:y='${BOX_Y}+4*sin(2*PI*t*2.0)':` +
    `w=${Math.round(BOX_W * 0.34)}:h=${BOX_H}:color=0xE50914@1.0:t=fill`
  );
  // Gold top accent line on button
  vf.push(
    `drawbox=x=${BOX_X}:y='${BOX_Y}+4*sin(2*PI*t*2.0)':` +
    `w=${BOX_W}:h=3:color=${GOLD}@0.95:t=fill`
  );
  // Gold bottom accent line on button
  vf.push(
    `drawbox=x=${BOX_X}:y='${BOX_Y + BOX_H - 3}+4*sin(2*PI*t*2.0)':` +
    `w=${BOX_W}:h=3:color=${GOLD}@0.60:t=fill`
  );

  // Button text with bounce
  vf.push(
    `drawtext=fontfile='${FONT_BOLD}':text='${watchText}':fontsize=28:` +
    `fontcolor=white:bordercolor=black@0.40:borderw=1:` +
    `shadowcolor=black@0.6:shadowx=2:shadowy=2:` +
    `x=(w-text_w)/2:y='${TEXT_Y}+4*sin(2*PI*t*2.0)':alpha='min(1,t/0.25)'`
  );

  // Sub-label below button
  vf.push(
    `drawtext=fontfile='${FONT_REG}':text='Free  \u2022  HD Quality  \u2022  No Signup':fontsize=20:` +
    `fontcolor=white@0.70:bordercolor=black:borderw=1:` +
    `x=(w-text_w)/2:y=${BOX_Y + BOX_H + 24}:` +
    `alpha='if(gte(t,0.40),min(1,(t-0.40)/0.40),0)'`
  );

  // Gold watermark
  vf.push(
    `drawtext=fontfile='${FONT_BOLD}':text='${esc(ch)}':fontsize=18:fontcolor=${GOLD}@0.55:` +
    `x=(w-text_w)/2:y=${H - 48}:alpha=0.65`
  );

  // Fade in + fade out
  vf.push(`fade=t=in:st=0:d=0.40,fade=t=out:st=${SC5_DUR - 1.2}:d=1.2`);

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
    console.error("[TikTok] Scene5 error:", err?.stderr?.slice(0, 800) ?? err?.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Master builder — 5 scenes → concat → audio mix
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

  console.log("[TikTok] Scene 1: Hook (5 s)…");
  const sc1 = await buildScene1(movie, posterPath, tmpDir, ch);

  console.log("[TikTok] Scene 2: Clip 1 (6 s)…");
  const sc2 = await buildClipScene(1, trailerMat?.clip1Path ?? null, posterPath, tmpDir, ch, SC2_DUR, movie);

  console.log("[TikTok] Scene 3: Clip 2 (6 s)…");
  const sc3 = await buildClipScene(2, trailerMat?.clip2Path ?? null, posterPath, tmpDir, ch, SC3_DUR, movie);

  console.log("[TikTok] Scene 4: Highlight (7 s)…");
  const sc4 = await buildScene4(movie, posterPath, tmpDir, ch);

  console.log("[TikTok] Scene 5: CTA (6 s)…");
  const sc5 = await buildScene5(movie, posterPath, tmpDir, ch);

  if (!sc1 || !sc2 || !sc3 || !sc4 || !sc5) {
    console.error("[TikTok] One or more scenes failed.");
    for (const f of [sc1, sc2, sc3, sc4, sc5]) { if (f) try { fs.unlinkSync(f); } catch {} }
    return false;
  }

  // Concat scenes (video only)
  const ts           = Date.now();
  const listPath     = path.join(tmpDir, `concat_${ts}.txt`);
  const videoOnlyOut = path.join(tmpDir, `video_only_${ts}.mp4`);
  fs.writeFileSync(listPath,
    `file '${sc1}'\nfile '${sc2}'\nfile '${sc3}'\nfile '${sc4}'\nfile '${sc5}'\n`
  );

  try {
    await execAsync(
      `ffmpeg -y -f concat -safe 0 -i "${listPath}" -c:v copy -an "${videoOnlyOut}"`,
      { timeout: 60_000 },
    );
  } catch (err: any) {
    console.error("[TikTok] Concat error:", err?.stderr?.slice(0, 800) ?? err?.message);
    return false;
  } finally {
    for (const f of [sc1, sc2, sc3, sc4, sc5, listPath]) {
      try { if (f && fs.existsSync(f)) fs.unlinkSync(f); } catch {}
    }
  }

  if (!fs.existsSync(videoOnlyOut)) return false;

  // Audio mix
  const clip1Delay = SC1_DUR * 1000;
  const clip2Delay = (SC1_DUR + SC2_DUR) * 1000;
  const fadeOutAt  = TOTAL_DUR - 2;
  let finalCmd: string;

  if (musicPath && trailerMat?.clip1AudioPath && trailerMat?.clip2AudioPath) {
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
          const seekPct = typeof options.clipPercent === "number" ? options.clipPercent : 0.42;
          const seekPct2 = Math.min(seekPct + 0.20, 0.90);
          console.log(`[TikTok] Fetching 2×6s clips @ ${Math.round(seekPct * 100)}% & ${Math.round(seekPct2 * 100)}%…`);
          const mediaType = movie.type === "series" ? "tv" : "movie";
          trailerMat = await downloadTrailerMaterial(movie.tmdbId, mediaType, s.tmdbApiKey, tmpDir, seekPct);
          if (trailerMat) console.log("[TikTok] Clips + audio ready.");
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

        console.log(`[TikTok] Rendering premium 5-scene 30s promo for ${ch}…`);
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
      ? [trailerMat.clip1Path, trailerMat.clip2Path, trailerMat.clip1AudioPath, trailerMat.clip2AudioPath]
      : [];
    for (const f of [posterTmp, videoTmp, musicTmp, ...audioFiles]) {
      if (f) try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
    }
  }
}
