/**
 * telegram-db-backup.ts — Daily auto-backup of DB as JSON file to Telegram private channel
 * Filename format: multiverse-backup-YYYY-MM-DD.json
 * Uses streaming writes to minimize peak RAM usage.
 */

import { db }      from "./db";
import { storage } from "./storage";
import {
  movies, episodes, channels, syncedFiles, users,
  ads, settings, mascotSettings, footballApiKeys,
  backups, appUrls,
} from "@shared/schema";
import fs   from "fs";
import path from "path";
import os   from "os";
import https from "https";
import FormData from "form-data";

const TABLES = [
  { name: "movies",          table: movies },
  { name: "episodes",        table: episodes },
  { name: "channels",        table: channels },
  { name: "syncedFiles",     table: syncedFiles },
  { name: "users",           table: users },
  { name: "ads",             table: ads },
  { name: "settings",        table: settings },
  { name: "mascotSettings",  table: mascotSettings },
  { name: "footballApiKeys", table: footballApiKeys },
  { name: "backups",         table: backups },
  { name: "appUrls",         table: appUrls },
];

export async function performTelegramDbBackup(): Promise<{ success: boolean; message: string }> {
  const s = await storage.getSettings();

  if (!s?.botToken) {
    return { success: false, message: "No bot token configured" };
  }
  if (!s?.telegramBackupChannelId) {
    return { success: false, message: "No Telegram backup channel configured" };
  }

  const botToken = s.botToken.trim();
  const chatId   = s.telegramBackupChannelId.trim();
  const dateStr  = new Date().toISOString().slice(0, 10);
  const filename = `multiverse-backup-${dateStr}.json`;
  const tmpPath  = path.join(os.tmpdir(), filename);

  try {
    const stream = fs.createWriteStream(tmpPath, { encoding: "utf8" });
    const write = (chunk: string) => new Promise<void>((res, rej) => {
      if (!stream.write(chunk)) stream.once("drain", res);
      else res();
    });

    const counts: Record<string, number> = {};

    await write(`{"exportedAt":"${new Date().toISOString()}","version":1,"tables":{`);

    for (let i = 0; i < TABLES.length; i++) {
      const { name, table } = TABLES[i];
      const rows = await db.select().from(table as any);
      counts[name] = rows.length;
      await write(`${i > 0 ? "," : ""}"${name}":${JSON.stringify(rows)}`);
      // Let the GC collect each batch before fetching the next
      rows.length = 0;
    }

    await write("}}");
    await new Promise<void>((res, rej) => stream.end((err: any) => err ? rej(err) : res()));

    const sizeMB = (fs.statSync(tmpPath).size / 1_048_576).toFixed(2);

    const caption = [
      `🗄 <b>Multiverse Auto Backup</b>`,
      `📅 Date: <code>${dateStr}</code>`,
      `📦 Size: <b>${sizeMB} MB</b>`,
      ``,
      `📊 <b>Summary:</b>`,
      `🎬 Movies: ${counts.movies ?? 0}`,
      `📺 Episodes: ${counts.episodes ?? 0}`,
      `📡 Channels: ${counts.channels ?? 0}`,
      `👥 Users: ${counts.users ?? 0}`,
      `📢 Ads: ${counts.ads ?? 0}`,
      ``,
      `✅ Backup completed successfully`,
    ].join("\n");

    await sendDocumentToTelegram(botToken, chatId, caption, tmpPath, filename);

    console.log(`[TG Backup] ✓ Backup sent to channel (${sizeMB} MB)`);
    return { success: true, message: `Backup sent (${sizeMB} MB, ${filename})` };

  } catch (err: any) {
    const msg = err?.message ?? String(err);
    console.error("[TG Backup] Failed:", msg);
    return { success: false, message: msg };
  } finally {
    try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch {}
  }
}

async function sendDocumentToTelegram(
  botToken: string,
  chatId:   string,
  caption:  string,
  filePath: string,
  filename: string,
): Promise<void> {
  const form = new FormData();
  form.append("chat_id",    chatId);
  form.append("caption",    caption);
  form.append("parse_mode", "HTML");
  form.append("document", fs.createReadStream(filePath), {
    filename,
    contentType: "application/json",
  });

  await new Promise<void>((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.telegram.org",
        path:     `/bot${botToken}/sendDocument`,
        method:   "POST",
        headers:  form.getHeaders(),
      },
      (res) => {
        let body = "";
        res.on("data", (c) => { body += c; });
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
          } else {
            reject(new Error(`sendDocument ${res.statusCode}: ${body}`));
          }
        });
      },
    );
    req.on("error", reject);
    form.pipe(req);
  });
}
