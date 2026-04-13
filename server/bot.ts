import TelegramBot from 'node-telegram-bot-api';
import { storage } from './storage';
import { translateToMyanmar } from './translate';

let botInstance: TelegramBot | null = null;

function buildKeyboard(webAppUrl: string) {
  return {
    keyboard: [
      [{ text: "🌐 Open App", web_app: { url: webAppUrl } }],
      [{ text: "🎬 Movies" }, { text: "📺 Series" }],
      [{ text: "🔥 Trending" }, { text: "⭐️ Top Rated" }],
      [{ text: "🔎 Search" }, { text: "🆕 Latest" }],
    ],
    resize_keyboard: true,
    persistent: true,
  };
}

const FALLBACK_KEYBOARD = {
  keyboard: [
    [{ text: "🎬 Movies" }, { text: "📺 Series" }],
    [{ text: "🔥 Trending" }, { text: "⭐️ Top Rated" }],
    [{ text: "🔎 Search" }, { text: "🆕 Latest" }],
  ],
  resize_keyboard: true,
  persistent: true,
};

export async function startBot() {
  // Bot polling ONLY starts if TELEGRAM_BOT_TOKEN env var is set.
  // This prevents double-replies when a second Replit shares the same database
  // but should NOT poll Telegram (it still streams using the token from Settings).
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    console.log("[Bot] TELEGRAM_BOT_TOKEN env var not set — bot polling disabled on this instance.");
    return;
  }

  // Stop any previous instance cleanly
  if (botInstance) {
    try {
      await botInstance.stopPolling({ cancel: true });
      botInstance.removeAllListeners();
      botInstance = null;
    } catch (e) {
      console.error("[Bot] Error stopping previous instance:", e);
    }
  }

  // Delete any existing webhook first — this is the #1 cause of polling not working
  try {
    const tempBot = new TelegramBot(token);
    await tempBot.deleteWebHook();
    console.log("[Bot] Webhook cleared.");
  } catch (e: any) {
    console.log("[Bot] Could not clear webhook:", e?.message);
  }

  // Small delay to let Telegram process the webhook deletion
  await new Promise(r => setTimeout(r, 1500));

  botInstance = new TelegramBot(token, {
    polling: {
      interval: 1000,
      autoStart: true,
      params: { timeout: 10 },
    },
  });

  const domain = process.env.REPLIT_DEV_DOMAIN || process.env.VITE_DEV_SERVER_HOSTNAME;
  const webAppBase = domain ? `https://${domain}` : "";
  const webAppHome = webAppBase ? `${webAppBase}/app` : "";

  async function getRotatedUrl(fallbackUrl: string): Promise<string> {
    try {
      const cfg = await storage.getSettings();
      if (cfg?.urlRotationEnabled) {
        const randomUrl = await storage.getRandomActiveAppUrl();
        if (randomUrl) {
          await storage.incrementAppUrlVisitCount(randomUrl.id);
          return randomUrl.url;
        }
      }
    } catch {}
    return fallbackUrl;
  }

  async function getMainKeyboard() {
    if (!webAppHome) return FALLBACK_KEYBOARD;
    const url = await getRotatedUrl(webAppHome);
    return buildKeyboard(url);
  }

  const MAIN_KEYBOARD = webAppHome ? buildKeyboard(webAppHome) : FALLBACK_KEYBOARD;

  // Track conflict back-off so we don't spam restarts
  let conflictBackoffTimer: ReturnType<typeof setTimeout> | null = null;

  // Handle polling errors (conflict, network issues, etc.)
  botInstance.on('polling_error', (err: any) => {
    const msg = err?.message || String(err);
    if (msg.includes('409') || msg.includes('Conflict')) {
      // Another instance is polling — stop THIS instance immediately so it
      // doesn't process and duplicate-reply to any messages.
      if (botInstance) {
        botInstance.stopPolling({ cancel: true }).catch(() => {});
      }
      if (!conflictBackoffTimer) {
        console.log("[Bot] Conflict — pausing polling for 30 s to let other instance take over.");
        conflictBackoffTimer = setTimeout(async () => {
          conflictBackoffTimer = null;
          // Only restart if this module's instance hasn't been replaced
          if (botInstance) {
            console.log("[Bot] Attempting to resume polling…");
            try { await botInstance.startPolling(); } catch (_) {}
          }
        }, 30_000);
      }
    } else if (msg.includes('ETELEGRAM') || msg.includes('EFATAL')) {
      console.error("[Bot] Fatal polling error:", msg);
    } else {
      console.warn("[Bot] Polling error:", msg);
    }
  });

  botInstance.on('error', (err) => {
    console.error("[Bot] General error:", err?.message || err);
  });

  let botUsername = "";
  try {
    const me = await botInstance.getMe();
    botUsername = me.username || "";
    console.log(`Bot started! Username: @${me.username}, ID: ${me.id}`);
  } catch (e) {
    console.log("[Bot] Started, but could not fetch info.");
  }

  // Set Telegram menu button
  if (webAppHome) {
    try {
      await (botInstance as any).setChatMenuButton({
        menu_button: {
          type: 'web_app',
          text: '🌐 Open App',
          web_app: { url: webAppHome },
        },
      });
      console.log("[Bot] Menu button set to web app:", webAppHome);
    } catch (e: any) {
      console.log("[Bot] Could not set menu button:", e?.message);
    }
  }

  // Set bot commands — only /start is shown in the menu
  try {
    await botInstance.setMyCommands([
      { command: 'start', description: '🏠 Start the bot' },
    ]);
    console.log("[Bot] Commands registered.");
  } catch (e) {
    console.log("[Bot] Could not set commands.");
  }

  // --- HELPERS ---

  function formatSize(bytes: number | null | undefined): string {
    if (!bytes || bytes === 0) return 'N/A';
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(2)} GB`;
    const mb = bytes / (1024 * 1024);
    return `${Math.round(mb)} MB`;
  }

  async function sendMovieCard(chatId: number, movie: any) {
    const domain = process.env.REPLIT_DEV_DOMAIN || process.env.VITE_DEV_SERVER_HOSTNAME;
    const baseMovieUrl = domain ? `https://${domain}/app/movie/${movie.id}` : "";
    const rotatedBase = baseMovieUrl ? await getRotatedUrl(webAppHome) : "";
    const webAppUrl = rotatedBase ? `${rotatedBase.replace(/\/app$/, "")}/app/movie/${movie.id}` : baseMovieUrl;

    const year = movie.releaseDate ? movie.releaseDate.split('-')[0] : 'N/A';
    const size = formatSize(movie.fileSize);
    const genre = movie.genre || 'N/A';
    let castList = 'N/A';
    if (Array.isArray(movie.cast) && movie.cast.length > 0) {
      castList = movie.cast.slice(0, 4).map((c: any) =>
        typeof c === 'string' ? c : c.name
      ).filter(Boolean).join(', ');
    }
    const isMovie = movie.type === 'movie';
    const rawOverview = (movie.overview || '').slice(0, 250);
    const overview = rawOverview ? await translateToMyanmar(rawOverview) : 'ဖော်ပြချက် မရှိပါ။';
    const caption = [
      `${isMovie ? '🎬' : '📺'} *${movie.title}* (${year})`,
      ``,
      `🎭 ဇာတ်လမ်းအမျိုးအစား: ${genre}`,
      `🎞 အရည်အသွေး: ${movie.quality || 'HD'}`,
      `📦 ဖိုင်အရွယ်အစား: ${size}`,
      `🎤 သရုပ်ဆောင်များ: ${castList}`,
      ``,
      overview,
    ].join('\n');

    const buttonRow: any[] = [];
    if (webAppUrl) {
      buttonRow.push({ text: "▶️ Watch / Stream", web_app: { url: webAppUrl } });
    }

    const keyboard = buttonRow.length ? { inline_keyboard: [buttonRow] } : undefined;

    try {
      if (movie.posterPath) {
        const posterUrl = `https://image.tmdb.org/t/p/w342${movie.posterPath}`;
        await botInstance?.sendPhoto(chatId, posterUrl, {
          caption,
          parse_mode: 'Markdown',
          reply_markup: keyboard,
        });
        return;
      }
    } catch (e) {}

    await botInstance?.sendMessage(chatId, caption, {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    });
  }

  async function sendMovieList(chatId: number, items: any[], title: string) {
    if (items.length === 0) {
      await botInstance?.sendMessage(chatId, `❌ No results found.`, { reply_markup: await getMainKeyboard() });
      return;
    }
    await botInstance?.sendMessage(chatId, `*${title}* — showing ${items.length} result(s):`, { parse_mode: 'Markdown' });
    for (const m of items.slice(0, 5)) await sendMovieCard(chatId, m);
  }

  function buildStreamWebAppUrl(type: "movie" | "episode", id: number): string | null {
    const domain = process.env.REPLIT_DEV_DOMAIN || process.env.VITE_DEV_SERVER_HOSTNAME;
    if (!domain) return null;
    return `https://${domain}/app/stream/${type}/${id}`;
  }

  async function handleMovieDownload(chatId: number, id: number) {
    console.log(`[Bot] Delivery request — ID: ${id}, Chat: ${chatId}`);
    const movie = await storage.getMovie(id);
    if (movie && movie.fileId && movie.fileId !== 'placeholder_file_id') {
      const streamUrl = buildStreamWebAppUrl("movie", movie.id);
      const inlineKeyboard = streamUrl
        ? { inline_keyboard: [[{ text: "▶️ Watch in App", web_app: { url: streamUrl } }]] }
        : undefined;
      try {
        await botInstance?.sendVideo(chatId, movie.fileId, {
          caption: `✅ *${movie.title}*\nQuality: ${movie.quality}\n\nEnjoy! 📥`,
          parse_mode: 'Markdown',
          reply_markup: inlineKeyboard,
        });
        await storage.incrementMovieViews(movie.id);
        return;
      } catch (err: any) {
        try {
          await botInstance?.sendDocument(chatId, movie.fileId, {
            caption: `✅ *${movie.title}*\n\nDelivered as file. 📥`,
            parse_mode: 'Markdown',
            reply_markup: inlineKeyboard,
          });
          return;
        } catch (e) {}
      }
    }

    const episode = await storage.getEpisode(id);
    if (episode?.fileId) {
      try {
        const parent = await storage.getMovie(episode.movieId);
        const streamUrl = buildStreamWebAppUrl("episode", episode.id);
        const inlineKeyboard = streamUrl
          ? { inline_keyboard: [[{ text: "▶️ Watch in App", web_app: { url: streamUrl } }]] }
          : undefined;
        await botInstance?.sendVideo(chatId, episode.fileId, {
          caption: `✅ *${parent?.title || 'Series'}*\nS${episode.seasonNumber} E${episode.episodeNumber}: ${episode.title}\n\nEnjoy! 📥`,
          parse_mode: 'Markdown',
          reply_markup: inlineKeyboard,
        });
        return;
      } catch (e) {}
    }

    const { items: syncedFiles } = await storage.getSyncedFiles({ limit: 10000 });
    const sf = syncedFiles.find(f => f.id === id);
    if (sf?.fileId) {
      try {
        await botInstance?.sendDocument(chatId, sf.fileId, {
          caption: `✅ *${sf.fileName}*\n\nFile synced from channel. 📥`,
          parse_mode: 'Markdown',
        });
        return;
      } catch (e) {}
    }

    // File can't be delivered directly — fall back to movie card with stream link
    const fallbackMovie = await storage.getMovie(id);
    if (fallbackMovie) {
      await sendMovieCard(chatId, fallbackMovie);
      return;
    }

    // Nothing found at all
    await botInstance?.sendMessage(chatId, `❌ Content with ID ${id} was not found.`, {
      reply_markup: await getMainKeyboard(),
    });
  }

  async function trackUser(from: TelegramBot.User | undefined) {
    if (!from) return;
    const exists = await storage.getUser(String(from.id));
    if (!exists) {
      await storage.createUser({
        telegramId: String(from.id),
        username: from.username,
        firstName: from.first_name,
      });
    } else {
      await storage.updateUserActivity(String(from.id));
    }
  }

  // ─── /start ────────────────────────────────────────────────────────────────
  botInstance.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    await trackUser(msg.from);

    const startParam = match?.[1];
    if (startParam) {
      // movie_ prefix → show detail card (poster + info + watch button)
      if (startParam.startsWith('movie_') || startParam.startsWith('series_')) {
        const id = parseInt(startParam.replace(/^(movie_|series_)/, ''));
        if (!isNaN(id)) {
          const movie = await storage.getMovie(id);
          if (movie) {
            await sendMovieCard(chatId, movie);
          } else {
            await botInstance?.sendMessage(chatId, `❌ Content not found.`, { reply_markup: await getMainKeyboard() });
          }
          return;
        }
      }
      // ep_ prefix → direct episode delivery (bypasses movie lookup)
      if (startParam.startsWith('ep_')) {
        const epId = parseInt(startParam.replace('ep_', ''));
        if (!isNaN(epId)) {
          const episode = await storage.getEpisode(epId);
          if (episode?.fileId) {
            const parent = await storage.getMovie(episode.movieId);
            const s = String(episode.seasonNumber ?? 1).padStart(2, '0');
            const e = String(episode.episodeNumber ?? 1).padStart(2, '0');
            try {
              await botInstance?.sendVideo(chatId, episode.fileId, {
                caption: `✅ *${parent?.title || 'Series'}*\nS${s}E${e}${episode.title ? `: ${episode.title}` : ''}\n\nEnjoy! 📥`,
                parse_mode: 'Markdown',
              });
            } catch {
              await botInstance?.sendDocument(chatId, episode.fileId, {
                caption: `✅ *${parent?.title || 'Series'}* S${s}E${e}\n\nDelivered as file. 📥`,
                parse_mode: 'Markdown',
              });
            }
          } else {
            await botInstance?.sendMessage(chatId, `❌ Episode not found.`, { reply_markup: await getMainKeyboard() });
          }
          return;
        }
      }
      // Other prefixes (dl_, watch_, id_, plain number) → direct file delivery
      const cleanParam = startParam.replace(/^(watch_|dl_|start_|id_)/, '');
      const id = parseInt(cleanParam);
      if (!isNaN(id)) {
        await handleMovieDownload(chatId, id);
        return;
      }
    }

    const firstName = msg.from?.first_name || 'there';
    await botInstance?.sendMessage(
      chatId,
      `🎬 *MULTIVERSE MOVIE BOT* 🌌\n\nWelcome to Multiverse Movie Bot 🚀\nYour ultimate destination for Movies, Series, and Live Sports — all in one place!\n\n✨ *Features:*\n• 🎥 Watch latest Movies & Series\n• ⚽ Live Sports Streaming\n• 🔎 Fast Search System\n• 🌐 Open App (Mini WebView Experience)\n• ⚡ Smooth & Fast Streaming\n• 🔄 Regular Updates\n\n🔥 *Why choose Multiverse?*\n• All content organized in one universe 🌌\n• Easy to use & mobile friendly\n• High-quality streaming experience\n\n📲 Just click 🌐 *Open App* and enjoy unlimited entertainment!\n\n🚀 Powered by Multiverse System`,
      { parse_mode: 'Markdown', reply_markup: await getMainKeyboard() }
    );
  });

  // ─── /search ───────────────────────────────────────────────────────────────
  botInstance.onText(/\/search(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const query = match?.[1]?.trim() || "";

    if (!query) {
      await botInstance?.sendMessage(
        chatId,
        "🔎 *Search*\n\nType a movie or series name, actor, or genre.\n\nExamples:\n`/search Oppenheimer`\n`/search Jason Statham`\n`/search Action 2024`",
        { parse_mode: 'Markdown', reply_markup: await getMainKeyboard() }
      );
      return;
    }

    const { items } = await storage.getMovies({ search: query.toLowerCase(), limit: 5 });
    if (items.length > 0) {
      await sendMovieList(chatId, items, `🔎 Results for "${query}"`);
    } else {
      await botInstance?.sendMessage(chatId, `❌ No results for *"${query}"*. Try a different keyword.`, {
        parse_mode: 'Markdown',
        reply_markup: await getMainKeyboard(),
      });
    }
  });

  // ─── /movies → redirect to /search ────────────────────────────────────────
  botInstance.onText(/\/movies/, async (msg) => {
    const chatId = msg.chat.id;
    await botInstance?.sendMessage(
      chatId,
      "🔎 *Search Movies & Series*\n\nType `/search <name>` or just type a movie name to find it!\n\nExamples:\n`/search Oppenheimer`\n`/search Action`",
      { parse_mode: 'Markdown', reply_markup: await getMainKeyboard() }
    );
  });

  // ─── /series ───────────────────────────────────────────────────────────────
  botInstance.onText(/\/series/, async (msg) => {
    const chatId = msg.chat.id;
    const { items } = await storage.getMovies({ type: 'series', limit: 8 });
    await sendMovieList(chatId, items, "📺 Series");
  });

  // ─── /trending ─────────────────────────────────────────────────────────────
  botInstance.onText(/\/trending/, async (msg) => {
    const chatId = msg.chat.id;
    const { items } = await storage.getMovies({ limit: 20 });
    const sorted = [...items].sort((a, b) => (b.views || 0) - (a.views || 0));
    await sendMovieList(chatId, sorted.slice(0, 8), "🔥 Trending");
  });

  // ─── /toprated ─────────────────────────────────────────────────────────────
  botInstance.onText(/\/toprated/, async (msg) => {
    const chatId = msg.chat.id;
    const { items } = await storage.getMovies({ limit: 100 });
    const sorted = [...items].sort((a, b) => (b.rating || 0) - (a.rating || 0)).filter(m => (m.rating || 0) > 0);
    await sendMovieList(chatId, sorted.slice(0, 8), "⭐️ Top Rated");
  });

  // ─── /latest ───────────────────────────────────────────────────────────────
  botInstance.onText(/\/latest/, async (msg) => {
    const chatId = msg.chat.id;
    const { items } = await storage.getMovies({ limit: 8 });
    await sendMovieList(chatId, items, "🆕 Latest Additions");
  });

  // ─── MESSAGE HANDLER (keyboard buttons + free text) ─────────────────────────
  botInstance.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = (msg.text || "").trim();

    // Skip commands (handled above)
    if (text.startsWith('/')) return;

    await trackUser(msg.from);

    // WebApp data
    const webAppData = msg.web_app_data?.data;
    if (webAppData) {
      console.log(`[Bot] WebApp data: "${webAppData}" from Chat ${chatId}`);
      const id = parseInt(webAppData);
      if (!isNaN(id)) {
        await handleMovieDownload(chatId, id);
        return;
      }
    }

    // Keyboard buttons
    if (text === "🎬 Movies") {
      const { items } = await storage.getMovies({ type: 'movie', limit: 8 });
      await sendMovieList(chatId, items, "🎬 Movies");
      return;
    }
    if (text === "📺 Series") {
      const { items } = await storage.getMovies({ type: 'series', limit: 8 });
      await sendMovieList(chatId, items, "📺 Series");
      return;
    }
    if (text === "🔥 Trending") {
      const { items } = await storage.getMovies({ limit: 20 });
      const sorted = [...items].sort((a, b) => (b.views || 0) - (a.views || 0));
      await sendMovieList(chatId, sorted.slice(0, 8), "🔥 Trending");
      return;
    }
    if (text === "⭐️ Top Rated") {
      const { items } = await storage.getMovies({ limit: 100 });
      const sorted = [...items].sort((a, b) => (b.rating || 0) - (a.rating || 0)).filter(m => (m.rating || 0) > 0);
      await sendMovieList(chatId, sorted.slice(0, 8), "⭐️ Top Rated");
      return;
    }
    if (text === "🔎 Search") {
      await botInstance?.sendMessage(
        chatId,
        "🔎 *Search*\n\nJust type the movie or series name, actor, or genre and I'll find it!\n\nExamples:\n`Oppenheimer`\n`Action`\n`Jason Statham`",
        { parse_mode: 'Markdown', reply_markup: await getMainKeyboard() }
      );
      return;
    }
    if (text === "🆕 Latest") {
      const { items } = await storage.getMovies({ limit: 8 });
      await sendMovieList(chatId, items, "🆕 Latest Additions");
      return;
    }

    // Free-text search (any other message)
    if (text && text.length > 1) {
      const directId = parseInt(text);
      if (!isNaN(directId) && text.length < 10) {
        await handleMovieDownload(chatId, directId);
      } else {
        const { items } = await storage.getMovies({ search: text.toLowerCase(), limit: 5 });
        if (items.length > 0) {
          await sendMovieList(chatId, items, `🔎 Results for "${text}"`);
        } else if (text.length > 2) {
          await botInstance?.sendMessage(chatId, `❌ No results for *"${text}"*. Try a different keyword.`, {
            parse_mode: 'Markdown',
            reply_markup: await getMainKeyboard(),
          });
        }
      }
    }
  });

  // ─── Admin: video sent to bot ──────────────────────────────────────────────
  botInstance.on('video', async (msg) => {
    const user = await storage.getUser(String(msg.from?.id));
    if (!user?.isAdmin) return;
    if (msg.video?.file_id) {
      const movie = await storage.createMovie({
        fileId: msg.video.file_id,
        fileUniqueId: msg.video.file_unique_id || 'unq',
        title: (msg.caption || "Untitled").split('\n')[0],
        caption: msg.caption || "",
        fileSize: msg.video.file_size || 0,
        type: 'movie',
        quality: 'HD',
      });
      await botInstance?.sendMessage(msg.chat.id, `✅ Saved! ID: \`${movie.id}\``, { parse_mode: 'Markdown' });
    }
  });

  // ─── Channel post sync ─────────────────────────────────────────────────────
  botInstance.on('channel_post', async (msg) => {
    const incomingId = String(msg.chat.id);
    const channels = await storage.getChannels();
    const channel = channels.find(
      c => String(c.telegramId) === incomingId ||
           String(c.telegramId).replace(/^-100/, '') === incomingId.replace(/^-100/, '')
    );
    if (channel?.role === 'source') {
      const video = msg.video || msg.document;
      if (video) {
        const fileSize = video.file_size || 0;
        const MIN_FILE_BYTES = 100 * 1024 * 1024; // 100 MB
        if (fileSize < MIN_FILE_BYTES) {
          await storage.updateChannel(channel.id, { lastMessageId: msg.message_id });
          return;
        }
        const existing = await storage.getSyncedFileByUniqueId(video.file_unique_id);
        if (!existing) {
          const rawCaption = msg.caption?.split('\n')[0]?.trim();
          const rawFileName = (video as any).file_name as string | undefined;
          const GENERIC_NAME = /^(video|file|document|audio|animation|default[_.\s-]?name|default|untitled|no[_.\s-]?name|filename|movie|media|unnamed)(\.mp4|\.mkv|\.avi|\.mov|\.ts)?$/i;
          const isGeneric = !rawFileName || GENERIC_NAME.test(rawFileName.trim());
          const { normalizeFileName } = await import("./unicode-normalize");
          const rawName = (rawCaption && rawCaption.length > 2 ? rawCaption : null) || (isGeneric ? null : rawFileName) || rawFileName || (msg.video ? 'Video' : 'File');
          const fileName = normalizeFileName(rawName);
          const syncedFile = await storage.createSyncedFile({
            channelId: String(msg.chat.id),
            messageId: msg.message_id,
            fileId: video.file_id,
            fileUniqueId: video.file_unique_id,
            fileName,
            fileSize,
            mimeType: (video as any).mime_type || 'application/octet-stream',
          });
          // Auto-add to movie library if enabled (movies only, TMDB match required)
          const { autoAddFromFile } = await import("./auto-add");
          autoAddFromFile(syncedFile).catch(() => {});
        }
        await storage.updateChannel(channel.id, { lastMessageId: msg.message_id });
      }
    }
  });
}

export const bot = botInstance;

export function getBotInstance(): TelegramBot | null {
  return botInstance;
}

export async function broadcastMovieNotification(movie: any): Promise<{ sent: number; failed: number }> {
  const instance = botInstance;
  if (!instance) return { sent: 0, failed: 0 };

  const allUsers = await storage.getUsers();
  if (allUsers.length === 0) return { sent: 0, failed: 0 };

  const domain = process.env.REPLIT_DEV_DOMAIN || process.env.VITE_DEV_SERVER_HOSTNAME;
  const webAppUrl = domain ? `https://${domain}/app/movie/${movie.id}` : "";
  const year = movie.releaseDate ? movie.releaseDate.split('-')[0] : 'N/A';
  const genre = movie.genre || 'N/A';
  const isMovie = movie.type === 'movie';
  const rawOverview = (movie.overview || '').slice(0, 250);
  const overview = rawOverview ? await translateToMyanmar(rawOverview) : 'ဖော်ပြချက် မရှိပါ။';

  let castList = 'N/A';
  if (Array.isArray(movie.cast) && movie.cast.length > 0) {
    castList = movie.cast.slice(0, 4).map((c: any) =>
      typeof c === 'string' ? c : c.name
    ).filter(Boolean).join(', ');
  }

  const caption = [
    `🆕 *${isMovie ? 'ရုပ်ရှင်' : 'စီးရီး'} အသစ် ထွက်ပြီ!*`,
    ``,
    `${isMovie ? '🎬' : '📺'} *${movie.title}* (${year})`,
    `🎭 ဇာတ်လမ်းအမျိုးအစား: ${genre}`,
    `🎞 အရည်အသွေး: ${movie.quality || 'HD'}`,
    ...(castList !== 'N/A' ? [`🎤 သရုပ်ဆောင်များ: ${castList}`] : []),
    ``,
    overview,
  ].join('\n');

  const buttons: any[] = [];
  if (webAppUrl) {
    buttons.push({ text: "▶️ Watch / Download", web_app: { url: webAppUrl } });
  }

  let sent = 0;
  let failed = 0;

  for (const user of allUsers) {
    try {
      const chatId = parseInt(user.telegramId);
      if (isNaN(chatId)) { failed++; continue; }

      if (movie.posterPath) {
        try {
          await instance.sendPhoto(chatId, `https://image.tmdb.org/t/p/w342${movie.posterPath}`, {
            caption,
            parse_mode: 'Markdown',
            reply_markup: buttons.length ? { inline_keyboard: [buttons] } : undefined,
          });
          sent++;
          continue;
        } catch {}
      }
      await instance.sendMessage(chatId, caption, {
        parse_mode: 'Markdown',
        reply_markup: buttons.length ? { inline_keyboard: [buttons] } : undefined,
      });
      sent++;
    } catch {
      failed++;
    }
    // Small delay to avoid Telegram flood limits
    await new Promise(r => setTimeout(r, 50));
  }

  return { sent, failed };
}

export async function broadcastEpisodeNotification(episode: any, series: any): Promise<{ sent: number; failed: number }> {
  const instance = botInstance;
  if (!instance) return { sent: 0, failed: 0 };

  const allUsers = await storage.getUsers();
  if (allUsers.length === 0) return { sent: 0, failed: 0 };

  const domain = process.env.REPLIT_DEV_DOMAIN || process.env.VITE_DEV_SERVER_HOSTNAME;
  const webAppUrl = domain ? `https://${domain}/app/movie/${series.id}` : "";

  const rawEpOverview = (episode.overview || '').slice(0, 200);
  const epOverview = rawEpOverview ? await translateToMyanmar(rawEpOverview) : '';

  const caption = [
    `🆕 *အပိုင်း အသစ် ထွက်ပြီ!*`,
    ``,
    `📺 *${series.title}*`,
    `📋 S${episode.seasonNumber} E${episode.episodeNumber}${episode.title ? `: ${episode.title}` : ''}`,
    ...(epOverview ? [``, epOverview] : []),
  ].join('\n');

  const buttons: any[] = [];
  if (webAppUrl) {
    buttons.push({ text: "▶️ Watch Series", web_app: { url: webAppUrl } });
  }

  let sent = 0;
  let failed = 0;

  for (const user of allUsers) {
    try {
      const chatId = parseInt(user.telegramId);
      if (isNaN(chatId)) { failed++; continue; }

      if (series.posterPath) {
        try {
          await instance.sendPhoto(chatId, `https://image.tmdb.org/t/p/w342${series.posterPath}`, {
            caption,
            parse_mode: 'Markdown',
            reply_markup: buttons.length ? { inline_keyboard: [buttons] } : undefined,
          });
          sent++;
          continue;
        } catch {}
      }
      await instance.sendMessage(chatId, caption, {
        parse_mode: 'Markdown',
        reply_markup: buttons.length ? { inline_keyboard: [buttons] } : undefined,
      });
      sent++;
    } catch {
      failed++;
    }
    await new Promise(r => setTimeout(r, 50));
  }

  return { sent, failed };
}
