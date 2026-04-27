import TelegramBot from 'node-telegram-bot-api';
import { Api } from 'telegram';
import bigInt from 'big-integer';
import { storage } from './storage';
import { translateToMyanmar } from './translate';
import { getTgClient, parseTelegramFileId } from './tg-stream';

// Forward a message from the bin channel to a user chat using MTProto.
// This bypasses Bot API file_id limitations (e.g. "wrong remote file identifier
// specified: can't unserialize it" for files captured by another client).
async function forwardFromBinViaMtproto(
  chatId: number,
  channelId: string,
  messageId: number
): Promise<boolean> {
  try {
    const settings = await storage.getSettings();
    const apiId = settings?.fsbApiId;
    const apiHash = settings?.fsbApiHash;
    const botToken = settings?.fsbBotToken || settings?.botToken;
    if (!apiId || !apiHash || !botToken) return false;

    const client = await getTgClient(apiId, apiHash, botToken);
    const fromPeer = await client.getInputEntity(channelId);
    const toPeer = await client.getInputEntity(bigInt(chatId) as any);

    await client.invoke(
      new Api.messages.ForwardMessages({
        fromPeer,
        id: [messageId],
        randomId: [bigInt.randBetween('1', '9223372036854775807')],
        toPeer,
        dropAuthor: true,
        dropMediaCaptions: false,
      })
    );
    return true;
  } catch (e: any) {
    console.error(`[Bot] MTProto forward failed (chat=${chatId}, ch=${channelId}, msg=${messageId}):`, e?.message || e);
    return false;
  }
}

// Send a Telegram document directly to a user via MTProto using just the
// raw fileId (parsed into its document location). This works even when the
// Bot API rejects the fileId as "wrong remote file identifier" because we
// bypass Bot API format validation entirely and use the document_id +
// access_hash + file_reference from the fileId binary structure.
async function sendDocumentViaMtproto(
  chatId: number,
  fileId: string,
  caption: string
): Promise<boolean> {
  try {
    const settings = await storage.getSettings();
    const apiId = settings?.fsbApiId;
    const apiHash = settings?.fsbApiHash;
    const botToken = settings?.fsbBotToken || settings?.botToken;
    if (!apiId || !apiHash || !botToken) return false;

    const { documentId, accessHash, fileReference } = parseTelegramFileId(fileId);
    const client = await getTgClient(apiId, apiHash, botToken);
    const toPeer = await client.getInputEntity(bigInt(chatId) as any);

    await client.invoke(
      new Api.messages.SendMedia({
        peer: toPeer,
        media: new Api.InputMediaDocument({
          id: new Api.InputDocument({
            id: documentId,
            accessHash,
            fileReference,
          }),
        }),
        message: caption,
        randomId: bigInt.randBetween('1', '9223372036854775807'),
      })
    );
    console.log(`[Bot] MTProto direct send succeeded for chat=${chatId}`);
    return true;
  } catch (e: any) {
    console.error(`[Bot] MTProto direct send failed (chat=${chatId}):`, e?.message || e);
    return false;
  }
}

let botInstance: TelegramBot | null = null;
let botStarting = false;

// Deduplication: track recently processed message keys to prevent double-reply
// Key = `${chatId}:${messageId}`
const processedMsgKeys = new Set<string>();
const DEDUP_MAX = 500;
function isDuplicate(chatId: number, messageId: number): boolean {
  const key = `${chatId}:${messageId}`;
  if (processedMsgKeys.has(key)) return true;
  processedMsgKeys.add(key);
  if (processedMsgKeys.size > DEDUP_MAX) {
    const [oldest] = processedMsgKeys;
    processedMsgKeys.delete(oldest);
  }
  return false;
}

function buildKeyboard(webAppUrl: string) {
  return {
    keyboard: [
      [{ text: "🌐 Open App", web_app: { url: webAppUrl } }],
      [{ text: "🎬 Movies" }, { text: "📺 Series" }],
      [{ text: "🔎 Search" }, { text: "❓ How to Use" }],
    ],
    resize_keyboard: true,
    persistent: true,
  };
}

const FALLBACK_KEYBOARD = {
  keyboard: [
    [{ text: "🎬 Movies" }, { text: "📺 Series" }],
    [{ text: "🔎 Search" }, { text: "❓ How to Use" }],
  ],
  resize_keyboard: true,
  persistent: true,
};

// Helper: send a message with the main keyboard, falling back to FALLBACK_KEYBOARD in group chats
async function sendWithKeyboard(
  instance: TelegramBot,
  chatId: number,
  text: string,
  opts: TelegramBot.SendMessageOptions,
  mainKeyboard: any
): Promise<void> {
  try {
    await instance.sendMessage(chatId, text, { ...opts, reply_markup: mainKeyboard });
  } catch (e: any) {
    const msg = e?.message || String(e);
    if (msg.includes('web App buttons') || msg.includes('BUTTON_USER_PRIVACY_RESTRICTED') || msg.includes('group')) {
      await instance.sendMessage(chatId, text, { ...opts, reply_markup: FALLBACK_KEYBOARD });
    } else {
      throw e;
    }
  }
}

export async function startBot() {
  // Bot polling ONLY starts if TELEGRAM_BOT_TOKEN env var is set.
  // This prevents double-replies when a second Replit shares the same database
  // but should NOT poll Telegram (it still streams using the token from Settings).
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    console.log("[Bot] TELEGRAM_BOT_TOKEN env var not set — bot polling disabled on this instance.");
    return;
  }

  // Guard against concurrent startBot() calls (e.g. startup + settings save at the same time)
  if (botStarting) {
    console.log("[Bot] Already starting — skipping duplicate call.");
    return;
  }
  botStarting = true;

  try {
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
      const tempBot = new TelegramBot(token, { polling: false });
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

    const fullCaption = [
      `${isMovie ? '🎬' : '📺'} *${movie.title}* (${year})`,
      ``,
      `🎭 ဇာတ်လမ်းအမျိုးအစား: ${genre}`,
      `🎞 အရည်အသွေး: ${movie.quality || 'HD'}`,
      `📦 ဖိုင်အရွယ်အစား: ${size}`,
      `🎤 သရုပ်ဆောင်များ: ${castList}`,
      ``,
      overview,
    ].join('\n');

    // web_app button = no ↗ URL arrow; fallback to url button in groups where web_app is rejected
    const webAppKeyboard = webAppUrl
      ? { inline_keyboard: [[{ text: "▶️ Watch in App", web_app: { url: webAppUrl } }]] }
      : undefined;
    const urlFallbackKeyboard = webAppUrl
      ? { inline_keyboard: [[{ text: "▶️ Watch in App", url: webAppUrl }]] }
      : undefined;

    // Always show info card (poster + info + watch/download buttons) — never send the file directly from here
    const hasFile = movie.fileId && movie.fileId !== 'placeholder_file_id';
    let botUsername = '';
    try { const me = await botInstance?.getMe(); botUsername = me?.username || ''; } catch {}
    const downloadKeyboard = hasFile && webAppUrl && botUsername
      ? { inline_keyboard: [[
          { text: "▶️ Watch in App", web_app: { url: webAppUrl } },
          { text: "📥 Download", url: `https://t.me/${botUsername}?start=dl_${movie.id}` },
        ]] }
      : webAppKeyboard;

    // Send poster photo with full info caption + Watch/Download buttons
    async function trySendPoster(keyboard: any) {
      const posterUrl = (movie as any).posterUrl ||
        (movie.posterPath
          ? (movie.posterPath.startsWith('http') ? movie.posterPath : `https://image.tmdb.org/t/p/w342${movie.posterPath}`)
          : null);
      if (posterUrl) {
        try {
          await botInstance?.sendPhoto(chatId, posterUrl, {
            caption: fullCaption, parse_mode: 'Markdown', reply_markup: keyboard,
          });
          return true;
        } catch {}
      }
      try {
        await botInstance?.sendMessage(chatId, fullCaption, {
          parse_mode: 'Markdown', reply_markup: keyboard,
        });
        return true;
      } catch {}
      return false;
    }

    // Try web_app button (no ↗); fallback to url button in groups
    const chosenKeyboard = downloadKeyboard || webAppKeyboard;
    if (!await trySendPoster(chosenKeyboard)) {
      await trySendPoster(urlFallbackKeyboard);
    }
  }

  async function sendMovieList(chatId: number, items: any[], title: string) {
    if (items.length === 0) {
      const kb = await getMainKeyboard();
      if (botInstance) await sendWithKeyboard(botInstance, chatId, `❌ No results found.`, {}, kb);
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

  // ── Episode-specific delivery (skips movie lookup entirely) ─────────────────
  async function handleEpisodeDownload(chatId: number, epId: number) {
    console.log(`[Bot] Episode delivery request — Episode ID: ${epId}, Chat: ${chatId}`);

    function makeKeyboard(url: string) {
      return {
        webApp: { inline_keyboard: [[{ text: "▶️ Watch in App", web_app: { url } }]] },
        urlFallback: { inline_keyboard: [[{ text: "▶️ Watch in App", url }]] },
      };
    }

    async function trySendFile(fileId: string, caption: string): Promise<'ok' | 'invalid' | 'fail'> {
      try {
        await botInstance?.sendDocument(chatId, fileId, { caption, parse_mode: 'Markdown' });
        return 'ok';
      } catch (e: any) {
        const msg = e?.message || String(e);
        console.error(`[Bot] sendDocument (episode) failed:`, msg);
        if (msg.includes('wrong remote file identifier') || msg.includes('WRONG_FILE_ID')) {
          return 'invalid';
        }
        return 'fail';
      }
    }

    const episode = await storage.getEpisode(epId);
    if (!episode) {
      const kb = await getMainKeyboard();
      if (botInstance) await sendWithKeyboard(botInstance, chatId, `❌ Episode not found.`, {}, kb);
      return;
    }

    const parent = await storage.getMovie(episode.movieId);
    const s = String(episode.seasonNumber ?? 1).padStart(2, '0');
    const e = String(episode.episodeNumber ?? 1).padStart(2, '0');
    const caption = `✅ *${parent?.title || 'Series'}*\nS${s}E${e}${episode.title ? `: ${episode.title}` : ''}\n\nEnjoy! 🎬`;
    const streamUrl = buildStreamWebAppUrl("episode", episode.id);

    // 1. Try stored episode fileId directly
    if (episode.fileId) {
      const result = await trySendFile(episode.fileId, caption);
      if (result === 'ok') return;
    }

    // 2. Try fileUniqueId lookup in syncedFiles
    if (episode.fileUniqueId) {
      try {
        const sf = await storage.getSyncedFileByUniqueId(episode.fileUniqueId);
        if (sf?.fileId) {
          const result2 = await trySendFile(sf.fileId, caption);
          if (result2 === 'ok') {
            try { await storage.updateEpisode(episode.id, { fileId: sf.fileId }); } catch {}
            return;
          }
        }
        // 3. Forward original message via MTProto (needs channelId + messageId from syncedFiles)
        if (sf?.channelId && sf?.messageId) {
          console.log(`[Bot] Forwarding episode ${episode.id} via MTProto from ch=${sf.channelId} msg=${sf.messageId}`);
          const ok = await forwardFromBinViaMtproto(chatId, sf.channelId, sf.messageId);
          if (ok) return;
        }
      } catch {}
    }

    // 4. MTProto direct send using parsed document location from stored fileId.
    //    Works even when Bot API rejects the fileId as "wrong remote file identifier"
    //    because we bypass Bot API and use the raw document_id + access_hash directly.
    if (episode.fileId) {
      try {
        console.log(`[Bot] Trying MTProto direct send for episode ${episode.id} chat=${chatId}`);
        const ok = await sendDocumentViaMtproto(chatId, episode.fileId, caption);
        if (ok) return;
      } catch {}
    }

    // Not deliverable — show watch-in-app fallback
    const domain = process.env.REPLIT_DEV_DOMAIN || process.env.VITE_DEV_SERVER_HOSTNAME;
    const watchUrl = domain && parent ? `https://${domain}/app/movie/${parent.id}` : streamUrl;
    const msg = `⚠️ *${parent?.title || 'Series'}* S${s}E${e}\n\nဤ ဇာတ်ကဗျာဖိုင်ကို ဒေါင်းလုဒ်ဆွဲ၍မရသေးပါ ❌\nAdmin က မကြာမီ ပြင်ဆင်ပေးပါမည်။\n\nApp မှာ Streaming ကြည့်နိုင်ပါသည် 👇`;
    if (watchUrl) {
      const kbs = makeKeyboard(watchUrl);
      try { await botInstance?.sendMessage(chatId, msg, { parse_mode: 'Markdown', reply_markup: kbs.webApp }); }
      catch { try { await botInstance?.sendMessage(chatId, msg, { parse_mode: 'Markdown', reply_markup: kbs.urlFallback }); } catch {} }
    } else {
      await botInstance?.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
    }
  }

  async function handleMovieDownload(chatId: number, id: number) {
    console.log(`[Bot] Delivery request — ID: ${id}, Chat: ${chatId}`);

    function makeKeyboard(url: string) {
      // web_app = no ↗ arrow; fallback url keyboard used if web_app is rejected in groups
      return {
        webApp: { inline_keyboard: [[{ text: "▶️ Watch in App", web_app: { url } }]] },
        urlFallback: { inline_keyboard: [[{ text: "▶️ Watch in App", url }]] },
      };
    }

    // Send via sendDocument only — avoids double-send from video→document fallthrough on timeout.
    async function trySendFile(fileId: string, caption: string): Promise<'ok' | 'invalid' | 'fail'> {
      try {
        await botInstance?.sendDocument(chatId, fileId, { caption, parse_mode: 'Markdown' });
        return 'ok';
      } catch (e: any) {
        const lastErr = e?.message || String(e);
        console.error(`[Bot] sendDocument (movie) failed:`, lastErr);
        if (lastErr.includes('wrong remote file identifier') || lastErr.includes('WRONG_FILE_ID')) {
          return 'invalid';
        }
        return 'fail';
      }
    }

    async function sendWatchButton(_streamUrl: string | null) {
      // Disabled: do not send extra ▶️ message + Watch in App button after delivery.
      return;
    }

    const movie = await storage.getMovie(id);
    if (movie) {
      const streamUrl = buildStreamWebAppUrl("movie", movie.id);
      const caption = `✅ *${movie.title}*\nQuality: ${movie.quality || 'HD'}\n\nEnjoy! 🎬`;

      // Helper: try to send using a specific fileId; if it succeeds, optionally heal movie.fileId
      async function tryMovieFile(fileId: string, healFileId?: string): Promise<boolean> {
        const result = await trySendFile(fileId, caption);
        if (result === 'ok') {
          // Auto-heal stored fileId if we used an alternative (e.g. from syncedFiles)
          if (healFileId && healFileId !== movie!.fileId) {
            try { await storage.updateMovie(movie!.id, { fileId: healFileId }); } catch {}
          }
          await storage.incrementMovieViews(movie!.id);
          await sendWatchButton(streamUrl);
          return true;
        }
        return false;
      }

      // 1. Try stored movie fileId directly
      if (movie.fileId && movie.fileId !== 'placeholder_file_id') {
        const result = await trySendFile(movie.fileId, caption);
        if (result === 'ok') {
          await storage.incrementMovieViews(movie.id);
          await sendWatchButton(streamUrl);
          return;
        }

        if (result === 'invalid') {
          // fileId format rejected by Bot API — try to recover via SyncedFiles
          // fileUniqueId is the same across all Telegram clients, so look up the
          // same file that was captured by the bot's channel scan (valid Bot API format)
          console.warn(`[Bot] Invalid fileId for movie ${movie.id} (${movie.title}) — trying fileUniqueId lookup`);
          if (movie.fileUniqueId) {
            try {
              const sf = await storage.getSyncedFileByUniqueId(movie.fileUniqueId);
              if (sf?.fileId) {
                console.log(`[Bot] Found matching syncedFile ${sf.id} for movie ${movie.id} — using valid fileId`);
                if (await tryMovieFile(sf.fileId, sf.fileId)) return;
              }
            } catch (e) {}
          }
          // No recovery found — show Myanmar error (do NOT clear fileId, keep for debugging)
        }
        // result === 'fail' or recovery also failed — fall through
      }

      // 2. Try lookup via fileUniqueId in syncedFiles (covers movies with no fileId or failed fileId)
      if (movie.fileUniqueId) {
        try {
          const sf = await storage.getSyncedFileByUniqueId(movie.fileUniqueId);
          if (sf?.fileId) {
            if (await tryMovieFile(sf.fileId, sf.fileId)) return;
          }
          // 3. Bot API rejected the fileId — forward the original message via MTProto.
          if (sf?.channelId && sf?.messageId) {
            console.log(`[Bot] Forwarding movie ${movie.id} via MTProto from ch=${sf.channelId} msg=${sf.messageId}`);
            const ok = await forwardFromBinViaMtproto(chatId, sf.channelId, sf.messageId);
            if (ok) {
              await storage.incrementMovieViews(movie.id);
              await sendWatchButton(streamUrl);
              return;
            }
          }
        } catch (e) {}
      }

      // 4. MTProto direct send using parsed document location from stored fileId.
      //    Bypasses Bot API entirely — works even when fileId format is rejected.
      if (movie.fileId && movie.fileId !== 'placeholder_file_id') {
        try {
          console.log(`[Bot] Trying MTProto direct send for movie ${movie.id} chat=${chatId}`);
          const ok = await sendDocumentViaMtproto(chatId, movie.fileId, caption);
          if (ok) {
            await storage.incrementMovieViews(movie.id);
            await sendWatchButton(streamUrl);
            return;
          }
        } catch {}
      }

      // All delivery methods failed — show movie-specific "not available" message.
      // NEVER fall through to episode lookup with the same numeric ID (would deliver wrong content).
      const domain = process.env.REPLIT_DEV_DOMAIN || process.env.VITE_DEV_SERVER_HOSTNAME;
      const watchUrl = domain ? `https://${domain}/app/movie/${movie.id}` : null;
      const unavailableMsg = `⚠️ *${movie.title}*\n\nဤ ရုပ်ရှင်ဖိုင်ကို ဒေါင်းလုဒ်ဆွဲ၍မရသေးပါ ❌\nAdmin က မကြာမီ ပြင်ဆင်ပေးပါမည်။\n\nApp မှာ Streaming ကြည့်နိုင်ပါသည် 👇`;
      if (watchUrl) {
        const kbs = makeKeyboard(watchUrl);
        try { await botInstance?.sendMessage(chatId, unavailableMsg, { parse_mode: 'Markdown', reply_markup: kbs.webApp }); }
        catch { try { await botInstance?.sendMessage(chatId, unavailableMsg, { parse_mode: 'Markdown', reply_markup: kbs.urlFallback }); } catch {} }
      } else {
        await botInstance?.sendMessage(chatId, unavailableMsg, { parse_mode: 'Markdown' });
      }
      return;
    }

    const kb = await getMainKeyboard();
    if (botInstance) await sendWithKeyboard(botInstance, chatId,
      `❌ Content with ID ${id} was not found.`, {}, kb);
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
    if (isDuplicate(chatId, msg.message_id)) return;
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
            const kb = await getMainKeyboard();
            if (botInstance) await sendWithKeyboard(botInstance, chatId, `❌ Content not found.`, {}, kb);
          }
          return;
        }
      }
      // ep_ prefix → direct episode delivery (never touches movie lookup)
      if (startParam.startsWith('ep_')) {
        const epId = parseInt(startParam.replace('ep_', ''));
        if (!isNaN(epId)) {
          await handleEpisodeDownload(chatId, epId);
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
    const welcomeKb = await getMainKeyboard();
    if (botInstance) await sendWithKeyboard(
      botInstance,
      chatId,
      `🎬 *MULTIVERSE MOVIE BOT* 🌌\n\nWelcome to Multiverse Movie Bot 🚀\nYour ultimate destination for Movies, Series, and Live Sports — all in one place!\n\n✨ *Features:*\n• 🎥 Watch latest Movies & Series\n• ⚽ Live Sports Streaming\n• 🔎 Fast Search System\n• 🌐 Open App (Mini WebView Experience)\n• ⚡ Smooth & Fast Streaming\n• 🔄 Regular Updates\n\n🔥 *Why choose Multiverse?*\n• All content organized in one universe 🌌\n• Easy to use & mobile friendly\n• High-quality streaming experience\n\n📲 Just click 🌐 *Open App* and enjoy unlimited entertainment!\n\n🚀 Powered by Multiverse System`,
      { parse_mode: 'Markdown' },
      welcomeKb
    );
  });

  // ─── /search ───────────────────────────────────────────────────────────────
  botInstance.onText(/\/search(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const query = match?.[1]?.trim() || "";

    if (!query) {
      const kb = await getMainKeyboard();
      if (botInstance) await sendWithKeyboard(botInstance, chatId,
        "🔎 *Search*\n\nType a movie or series name, actor, or genre.\n\nExamples:\n`/search Oppenheimer`\n`/search Jason Statham`\n`/search Action 2024`",
        { parse_mode: 'Markdown' }, kb);
      return;
    }

    const { items } = await storage.getMovies({ search: query.toLowerCase(), limit: 5 });
    if (items.length > 0) {
      await sendMovieList(chatId, items, `🔎 Results for "${query}"`);
    } else {
      const kb = await getMainKeyboard();
      if (botInstance) await sendWithKeyboard(botInstance, chatId,
        `❌ No results for *"${query}"*. Try a different keyword.`,
        { parse_mode: 'Markdown' }, kb);
    }
  });

  // ─── /movies → redirect to /search ────────────────────────────────────────
  botInstance.onText(/\/movies/, async (msg) => {
    const chatId = msg.chat.id;
    const kb = await getMainKeyboard();
    if (botInstance) await sendWithKeyboard(botInstance, chatId,
      "🔎 *Search Movies & Series*\n\nType `/search <name>` or just type a movie name to find it!\n\nExamples:\n`/search Oppenheimer`\n`/search Action`",
      { parse_mode: 'Markdown' }, kb);
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

    // Skip commands (handled above by onText)
    if (text.startsWith('/')) return;

    // Deduplication guard
    if (isDuplicate(chatId, msg.message_id)) return;

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
    if (text === "❓ How to Use") {
      const s = await storage.getSettings();
      const items = (s as any)?.howToUseItems as Array<{ title: string; url: string }> | undefined;
      const kb = await getMainKeyboard();
      if (!items || items.length === 0) {
        if (botInstance) await sendWithKeyboard(botInstance, chatId,
          "ℹ️ *How to Use*\n\nNo guides have been set up yet. Please check back later.",
          { parse_mode: 'Markdown' }, kb);
        return;
      }
      const inlineButtons = items.map(item => [{ text: `📖 ${item.title}`, url: item.url }]);
      if (botInstance) await botInstance.sendMessage(chatId,
        "❓ *How to Use*\n\nTap any link below to view the guide:",
        { parse_mode: 'Markdown', reply_markup: { inline_keyboard: inlineButtons } });
      return;
    }
    if (text === "🔎 Search") {
      const kb = await getMainKeyboard();
      if (botInstance) await sendWithKeyboard(botInstance, chatId,
        "🔎 *Search*\n\nJust type the movie or series name, actor, or genre and I'll find it!\n\nExamples:\n`Oppenheimer`\n`Action`\n`Jason Statham`",
        { parse_mode: 'Markdown' }, kb);
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
          const kb = await getMainKeyboard();
          if (botInstance) await sendWithKeyboard(botInstance, chatId,
            `❌ No results for *"${text}"*. Try a different keyword.`,
            { parse_mode: 'Markdown' }, kb);
        }
      }
    }
  });

  // ─── Admin: video/document sent to bot — capture valid Bot API file_id ───────
  async function handleAdminFileSent(msg: TelegramBot.Message) {
    const user = await storage.getUser(String(msg.from?.id));
    if (!user?.isAdmin) return;
    const file = msg.video || msg.document;
    if (!file?.file_id) return;
    const validFileId = file.file_id;
    const title = msg.caption?.split('\n')[0]?.trim() || (msg.video ? 'Video' : 'File');
    // Reply with the valid Bot API file_id so admin can copy it into the movie edit form
    await botInstance?.sendMessage(msg.chat.id,
      `✅ *File received!*\n\n📋 *Valid Telegram File ID:*\n\`${validFileId}\`\n\n👆 Copy this ID and paste it into the movie's "Telegram File ID" field in the Admin Panel.\n\nMovie title detected: *${title}*`,
      { parse_mode: 'Markdown' }
    );
  }

  botInstance.on('video', handleAdminFileSent);
  botInstance.on('document', async (msg) => {
    const user = await storage.getUser(String(msg.from?.id));
    if (!user?.isAdmin) return;
    const doc = msg.document;
    if (!doc?.mime_type?.startsWith('video/')) return; // only video documents
    await handleAdminFileSent(msg);
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

  } finally {
    botStarting = false;
  }
}

export const bot = botInstance;

export function getBotInstance(): TelegramBot | null {
  return botInstance;
}

/**
 * Sends a movie/series info card to the given chatId via the bot.
 * Used by the admin "Bot OK" button to preview how the card looks.
 */
export async function sendMovieCardPreview(movieId: number, chatId: number): Promise<{ ok: boolean; message?: string }> {
  if (!botInstance) return { ok: false, message: "Bot not running" };
  try {
    await sendMovieCard(chatId, movieId);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, message: e.message };
  }
}

export async function stopBot(): Promise<void> {
  if (botInstance) {
    try {
      await botInstance.stopPolling({ cancel: true });
      botInstance.removeAllListeners();
      botInstance = null;
      console.log("[Bot] Stopped cleanly.");
    } catch (e) {
      console.error("[Bot] Error stopping:", e);
    }
  }
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

  // Use web_app button so Telegram opens the mini app directly (no "Open this link?" dialog)
  const webAppBtn = webAppUrl ? { text: "▶️ Watch / Download", web_app: { url: webAppUrl } } : null;
  const urlFallbackBtn = webAppUrl ? { text: "▶️ Watch / Download", url: webAppUrl } : null;

  let sent = 0;
  let failed = 0;

  for (const user of allUsers) {
    try {
      const chatId = parseInt(user.telegramId);
      if (isNaN(chatId)) { failed++; continue; }

      const posterUrl = movie.posterPath ? `https://image.tmdb.org/t/p/w342${movie.posterPath}` : null;

      // Try web_app button (opens mini app inline, no URL dialog)
      let succeeded = false;
      if (webAppBtn) {
        const markup = { inline_keyboard: [[webAppBtn]] };
        try {
          if (posterUrl) {
            await instance.sendPhoto(chatId, posterUrl, { caption, parse_mode: 'Markdown', reply_markup: markup });
          } else {
            await instance.sendMessage(chatId, caption, { parse_mode: 'Markdown', reply_markup: markup });
          }
          succeeded = true;
        } catch {}
      }
      // Fallback to url button if web_app fails (e.g. in groups)
      if (!succeeded && urlFallbackBtn) {
        const markup = { inline_keyboard: [[urlFallbackBtn]] };
        try {
          if (posterUrl) {
            await instance.sendPhoto(chatId, posterUrl, { caption, parse_mode: 'Markdown', reply_markup: markup });
          } else {
            await instance.sendMessage(chatId, caption, { parse_mode: 'Markdown', reply_markup: markup });
          }
          succeeded = true;
        } catch {}
      }
      if (succeeded) sent++; else failed++;
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

  // Use web_app button so Telegram opens the mini app directly (no "Open this link?" dialog)
  const webAppBtn = webAppUrl ? { text: "▶️ Watch Series", web_app: { url: webAppUrl } } : null;
  const urlFallbackBtn = webAppUrl ? { text: "▶️ Watch Series", url: webAppUrl } : null;

  let sent = 0;
  let failed = 0;

  for (const user of allUsers) {
    try {
      const chatId = parseInt(user.telegramId);
      if (isNaN(chatId)) { failed++; continue; }

      const posterUrl = series.posterPath ? `https://image.tmdb.org/t/p/w342${series.posterPath}` : null;
      let succeeded = false;

      if (webAppBtn) {
        const markup = { inline_keyboard: [[webAppBtn]] };
        try {
          if (posterUrl) {
            await instance.sendPhoto(chatId, posterUrl, { caption, parse_mode: 'Markdown', reply_markup: markup });
          } else {
            await instance.sendMessage(chatId, caption, { parse_mode: 'Markdown', reply_markup: markup });
          }
          succeeded = true;
        } catch {}
      }
      if (!succeeded && urlFallbackBtn) {
        const markup = { inline_keyboard: [[urlFallbackBtn]] };
        try {
          if (posterUrl) {
            await instance.sendPhoto(chatId, posterUrl, { caption, parse_mode: 'Markdown', reply_markup: markup });
          } else {
            await instance.sendMessage(chatId, caption, { parse_mode: 'Markdown', reply_markup: markup });
          }
          succeeded = true;
        } catch {}
      }
      if (succeeded) sent++; else failed++;
    } catch {
      failed++;
    }
    await new Promise(r => setTimeout(r, 50));
  }

  return { sent, failed };
}

export interface BroadcastOptions {
  text: string;
  imageUrl?: string;
  imageBuffer?: Buffer;
  imageName?: string;
  buttonText?: string;
  buttonUrl?: string;
}

export async function broadcastCustomMessage(options: BroadcastOptions): Promise<{ sent: number; failed: number }> {
  const instance = botInstance;
  if (!instance) return { sent: 0, failed: 0 };

  const allUsers = await storage.getUsers();
  if (allUsers.length === 0) return { sent: 0, failed: 0 };

  const { text, imageUrl, imageBuffer, imageName, buttonText, buttonUrl } = options;

  const buttons: any[] = [];
  if (buttonText && buttonUrl) {
    buttons.push({ text: buttonText, url: buttonUrl });
  }

  const markup = buttons.length ? { inline_keyboard: [buttons] } : undefined;

  let sent = 0;
  let failed = 0;
  let cachedFileId: string | null = null;

  for (const user of allUsers) {
    try {
      const chatId = parseInt(user.telegramId);
      if (isNaN(chatId)) { failed++; continue; }

      const hasImage = imageUrl || imageBuffer;
      if (hasImage) {
        try {
          let photoSource: any;
          if (cachedFileId) {
            photoSource = cachedFileId;
          } else if (imageBuffer) {
            photoSource = imageBuffer;
          } else {
            photoSource = imageUrl!;
          }

          const result = await instance.sendPhoto(chatId, photoSource, {
            caption: text,
            parse_mode: "Markdown",
            reply_markup: markup,
          });

          if (!cachedFileId) {
            const photos = (result as any)?.photo;
            if (Array.isArray(photos) && photos.length > 0) {
              cachedFileId = photos[photos.length - 1]?.file_id || null;
            }
          }

          sent++;
          await new Promise(r => setTimeout(r, 50));
          continue;
        } catch {}
      }

      await instance.sendMessage(chatId, text, {
        parse_mode: "Markdown",
        reply_markup: markup,
        disable_web_page_preview: false,
      } as any);
      sent++;
    } catch {
      failed++;
    }
    await new Promise(r => setTimeout(r, 50));
  }

  return { sent, failed };
}
