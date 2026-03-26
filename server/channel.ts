import { storage } from "./storage";
import type { Movie } from "@shared/schema";
import { translateToMyanmar } from "./translate";

const TG = (token: string) => `https://api.telegram.org/bot${token}`;

async function tgCall(token: string, method: string, body: object) {
  const res = await fetch(`${TG(token)}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json() as any;
  if (!data.ok) throw new Error(data.description || "Telegram API error");
  return data.result;
}

async function getBotUsername(token: string): Promise<string | null> {
  try {
    const res = await fetch(`${TG(token)}/getMe`);
    const data = await res.json() as any;
    return data.ok ? data.result.username : null;
  } catch {
    return null;
  }
}

function botDeepLink(username: string, movieId: number): string {
  return `https://t.me/${username}?start=movie_${movieId}`;
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function getConfig() {
  const settings = await storage.getSettings();
  const token = settings?.botToken || process.env.TELEGRAM_BOT_TOKEN;
  const channel = settings?.telegramChannelUsername?.trim() || "";
  return { token, channel, settings };
}

// ─── Movie / Series ───────────────────────────────────────────────────────────

export async function postMovieToChannel(movieId: number): Promise<{ ok: boolean; message?: string }> {
  try {
    const { token, channel } = await getConfig();
    if (!token) return { ok: false, message: "Bot token not configured" };
    if (!channel) return { ok: false, message: "Telegram channel username not configured in Settings" };

    const movie = await storage.getMovie(movieId);
    if (!movie) return { ok: false, message: "Movie not found" };

    const botUsername = await getBotUsername(token);
    const emoji = movie.type === "series" ? "📺" : "🎬";
    const label = movie.type === "series" ? "စီးရီး" : "ရုပ်ရှင်";
    const year = movie.releaseDate ? ` (${movie.releaseDate.split("-")[0]})` : "";
    const rating = movie.rating ? `⭐ ${(movie.rating / 10).toFixed(1)}` : "";
    const genre = movie.genre ? movie.genre : "";
    const rawOverview = movie.overview
      ? movie.overview.slice(0, 220)
      : "";
    const overview = rawOverview ? await translateToMyanmar(rawOverview) : "";

    const lines = [
      `${emoji} <b>${escHtml(movie.title)}${year}</b>`,
      [rating, genre].filter(Boolean).join("  ·  "),
      overview ? `\n${escHtml(overview)}` : "",
    ].filter(Boolean).join("\n");

    const deepLink = botUsername ? botDeepLink(botUsername, movie.id) : null;
    const keyboard = deepLink
      ? { inline_keyboard: [[{ text: `${emoji} Bot တွင် ရယူရန်`, url: deepLink }]] }
      : undefined;

    if (movie.posterPath) {
      const poster = movie.posterPath.startsWith("http")
        ? movie.posterPath
        : `https://image.tmdb.org/t/p/w500${movie.posterPath}`;
      try {
        await tgCall(token, "sendPhoto", { chat_id: channel, photo: poster, caption: lines, parse_mode: "HTML", reply_markup: keyboard });
        return { ok: true };
      } catch {
        // If photo fails, fall through to sendMessage
      }
    }

    await tgCall(token, "sendMessage", { chat_id: channel, text: lines, parse_mode: "HTML", reply_markup: keyboard });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, message: e.message };
  }
}

// ─── Football Match ───────────────────────────────────────────────────────────

export interface ChannelFootballMatch {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  status: "live" | "upcoming" | "finished";
  statusDetail?: string;
  leagueName?: string;
  kickoffMMT?: string;
  round?: string;
}

export async function postFootballToChannel(match: ChannelFootballMatch): Promise<{ ok: boolean; message?: string }> {
  try {
    const { token, channel } = await getConfig();
    if (!token) return { ok: false, message: "Bot token not configured" };
    if (!channel) return { ok: false, message: "Telegram channel username not configured in Settings" };

    const url = appUrl("/app/football");

    let header = "";
    let score = "";
    if (match.status === "live") {
      header = `⚽ <b>LIVE NOW</b>`;
      score = `🔴 <b>${match.homeScore} – ${match.awayScore}</b>  (${match.statusDetail || "Live"})`;
    } else if (match.status === "upcoming") {
      header = `📅 <b>UPCOMING</b>`;
      score = match.kickoffMMT ? `🕐 Kickoff: <b>${match.kickoffMMT}</b>` : "🕐 Starting soon";
    } else {
      header = `✅ <b>RESULT</b>`;
      score = `🏁 <b>${match.homeScore} – ${match.awayScore}</b>  (${match.statusDetail || "FT"})`;
    }

    const lines = [
      header,
      `${escHtml(match.homeTeam)}  vs  ${escHtml(match.awayTeam)}`,
      match.leagueName ? `🏆 ${escHtml(match.leagueName)}${match.round ? ` · ${escHtml(match.round)}` : ""}` : "",
      score,
    ].filter(Boolean).join("\n");

    const btnLabel =
      match.status === "live" ? "⚽ Watch Live" :
      match.status === "upcoming" ? "📅 View Match" : "📊 See Result";

    const keyboard = url ? { inline_keyboard: [[{ text: btnLabel, url }]] } : undefined;

    await tgCall(token, "sendMessage", { chat_id: channel, text: lines, parse_mode: "HTML", reply_markup: keyboard });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, message: e.message };
  }
}
