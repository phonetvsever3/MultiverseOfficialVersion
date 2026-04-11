/**
 * Built-in Telegram MTProto streaming via gramjs.
 * Bypasses the 20 MB Bot API download limit by using the MTProto protocol directly.
 *
 * FileId format (version 4, after base64url-decode + RLE-decode):
 *   offset 0-3  : flags int32 LE  (byte[0]=file_type, byte[3]=dc_id)
 *   offset 4-7  : int32 LE        (secondary type info)
 *   offset 8    : uint8            (TL byte-array length = file_reference size)
 *   offset 9-N  : file_reference  (N bytes)
 *   [4-byte alignment padding]
 *   offset 44+  : document_id     (int64 LE)
 *   offset 44+8 : access_hash     (int64 LE)
 *
 * These offsets were verified by cross-checking against file_unique_id bytes.
 */

import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { Api } from "telegram";
import { Logger, LogLevel } from "telegram/extensions/Logger";
import bigInt from "big-integer";
import type { Response } from "express";
import fs from "fs";
import path from "path";

// ── Session persistence ───────────────────────────────────────────────────────

const SESSION_FILE = path.resolve(".tg-session.txt");

function loadSavedSession(): string {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      return fs.readFileSync(SESSION_FILE, "utf8").trim();
    }
  } catch {}
  return "";
}

function saveSession(sessionStr: string) {
  try {
    fs.writeFileSync(SESSION_FILE, sessionStr, "utf8");
  } catch (err: any) {
    console.warn("[TgStream] Failed to save session:", err.message);
  }
}

// ── Singleton client ─────────────────────────────────────────────────────────

interface ClientState {
  client: TelegramClient;
  apiId: string;
  apiHash: string;
  botToken: string;
}

let activeState: ClientState | null = null;
let connectingPromise: Promise<TelegramClient> | null = null;

export async function getTgClient(
  apiId: string,
  apiHash: string,
  botToken: string
): Promise<TelegramClient> {
  // Trim credentials to avoid whitespace issues
  apiId = apiId.trim();
  apiHash = apiHash.trim();
  botToken = botToken.trim();

  if (
    activeState &&
    activeState.apiId === apiId &&
    activeState.apiHash === apiHash &&
    activeState.botToken === botToken
  ) {
    if (activeState.client.connected) return activeState.client;
  }

  // Return in-flight connection only if it hasn't been rejected
  if (connectingPromise) return connectingPromise;

  const silentLogger = new Logger(LogLevel.NONE);

  const tryConnect = async (useSession: string): Promise<TelegramClient> => {
    const client = new TelegramClient(
      new StringSession(useSession),
      parseInt(apiId, 10),
      apiHash,
      {
        connectionRetries: 3,
        retryDelay: 1000,
        autoReconnect: true,
        baseLogger: silentLogger,
      }
    );
    await client.start({ botAuthToken: botToken });
    return client;
  };

  const attempt = async (): Promise<TelegramClient> => {
    if (activeState?.client) {
      try { await activeState.client.disconnect(); } catch {}
    }

    let client: TelegramClient;
    try {
      client = await tryConnect(loadSavedSession());
    } catch (err: any) {
      const msg = String(err?.message || err);
      const isAuthErr = msg.includes("ACCESS_TOKEN_INVALID") || msg.includes("AUTH_KEY") || msg.includes("SESSION_EXPIRED");
      if (isAuthErr) {
        // Stale session — wipe it and retry with a clean one
        console.warn("[TgStream] Session stale/invalid, clearing and retrying fresh...");
        saveSession("");
        try {
          client = await tryConnect("");
        } catch (retryErr: any) {
          throw new Error(
            `MTProto authentication failed. Please verify your FSB Bot Token, API ID, and API Hash are correct. (${retryErr?.message})`
          );
        }
      } else {
        throw err;
      }
    }

    // Persist session so entity access hashes survive restarts
    try {
      const sessionStr = client.session.save() as unknown as string;
      if (sessionStr) saveSession(sessionStr);
    } catch {}

    activeState = { client, apiId, apiHash, botToken };
    console.log("[TgStream] MTProto client connected");
    return client;
  };

  // Always clear connectingPromise after completion (success or failure)
  connectingPromise = attempt().finally(() => {
    connectingPromise = null;
  });

  return connectingPromise;
}

export function invalidateTgClient() {
  if (activeState?.client) {
    try { activeState.client.disconnect(); } catch {}
  }
  activeState = null;
  connectingPromise = null;
}

// ── FileId encoder / decoder ──────────────────────────────────────────────────

function rleDecodeBytes(raw: Buffer): Buffer {
  const result: number[] = [];
  let inZeroRun = false;
  for (const b of raw) {
    if (!inZeroRun) {
      if (b === 0) { inZeroRun = true; }
      else { result.push(b); }
    } else {
      for (let i = 0; i < b; i++) result.push(0);
      inZeroRun = false;
    }
  }
  return Buffer.from(result);
}

function base64urlDecode(s: string): Buffer {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "==".slice(0, (4 - (b64.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

export interface TgFileLocation {
  dcId: number;
  documentId: bigInt.BigInteger;
  accessHash: bigInt.BigInteger;
  fileReference: Buffer;
}

function readBigInt64LE(buf: Buffer, offset: number): bigInt.BigInteger {
  const lo = buf.readUInt32LE(offset);
  const hi = buf.readInt32LE(offset + 4);
  return bigInt(hi).shiftLeft(32).add(bigInt(lo >>> 0));
}

export function parseTelegramFileId(fileId: string): TgFileLocation {
  const raw = base64urlDecode(fileId);
  const decoded = rleDecodeBytes(raw);

  const version = decoded[decoded.length - 1];
  if (version !== 4) {
    throw new Error(`Unsupported Telegram file ID version: ${version} (expected 4)`);
  }

  const data = decoded.slice(0, -2);

  const dcId = data[3];

  const fileRefLength = data[8];
  const fileReference = data.slice(9, 9 + fileRefLength);

  const rawSize = 1 + fileRefLength;
  const aligned = Math.ceil(rawSize / 4) * 4;
  const docOffset = 8 + aligned;

  const documentId = readBigInt64LE(data, docOffset);
  const accessHash = readBigInt64LE(data, docOffset + 8);

  return { dcId, documentId, accessHash, fileReference };
}

// ── FileId encoder (MTProto document → Bot API file_id / file_unique_id) ─────

function rleEncodeBytes(data: Buffer): Buffer {
  const result: number[] = [];
  let zeroCount = 0;
  for (const b of data) {
    if (b === 0) {
      zeroCount++;
    } else {
      if (zeroCount > 0) {
        result.push(0, zeroCount);
        zeroCount = 0;
      }
      result.push(b);
    }
  }
  if (zeroCount > 0) result.push(0, zeroCount);
  return Buffer.from(result);
}

function base64urlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function writeBigInt64LE(buf: Buffer, value: bigInt.BigInteger, offset: number): void {
  const lo = value.and(bigInt("4294967295")).toJSNumber();
  const hi = value.shiftRight(32).toJSNumber();
  buf.writeUInt32LE(lo >>> 0, offset);
  buf.writeInt32LE(hi, offset + 4);
}

/**
 * Construct a Bot API–compatible file_id from an MTProto document object.
 * fileType: 4 = video, 5 = document (default)
 */
export function buildTelegramFileId(
  documentId: bigInt.BigInteger,
  accessHash: bigInt.BigInteger,
  fileReference: Buffer,
  dcId: number,
  fileType = 5
): string {
  const fileRefLen = fileReference.length;
  const rawSize = 1 + fileRefLen;
  const aligned = Math.ceil(rawSize / 4) * 4;
  const docOffset = 8 + aligned;
  const totalSize = docOffset + 16 + 2; // +16 for doc_id+access_hash, +2 for version bytes

  const data = Buffer.alloc(totalSize, 0);
  data[0] = fileType;
  data[3] = dcId;
  data[8] = fileRefLen;
  fileReference.copy(data, 9);
  writeBigInt64LE(data, documentId, docOffset);
  writeBigInt64LE(data, accessHash, docOffset + 8);
  data[totalSize - 2] = 0; // sub-version
  data[totalSize - 1] = 4; // version 4

  return base64urlEncode(rleEncodeBytes(data));
}

/**
 * Construct a Bot API–compatible file_unique_id from an MTProto document_id.
 * fileType: 4 = video, 5 = document (default)
 */
export function buildTelegramFileUniqueId(
  documentId: bigInt.BigInteger,
  fileType = 5
): string {
  const buf = Buffer.alloc(9, 0);
  buf[0] = fileType;
  writeBigInt64LE(buf, documentId, 1);
  return base64urlEncode(rleEncodeBytes(buf));
}

// ── MTProto channel history scan ──────────────────────────────────────────────

export interface MtprotoScanResult {
  fileId: string;
  fileUniqueId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  messageId: number;
}

/**
 * Fetch the actual latest message ID of a channel via MTProto.
 * Returns 0 if it cannot be determined.
 */
export async function getChannelLatestMsgId(
  client: TelegramClient,
  channelId: string
): Promise<number> {
  try {
    const peer = await client.getInputEntity(channelId);
    const result = await client.invoke(
      new Api.messages.GetHistory({
        peer,
        offsetId: 0,
        offsetDate: 0,
        addOffset: 0,
        limit: 1,
        maxId: 0,
        minId: 0,
        hash: bigInt(0),
      })
    );
    const messages: any[] = (result as any).messages ?? [];
    return messages[0]?.id ?? 0;
  } catch (err: any) {
    console.warn("[scanChannelMtproto] Could not fetch latest msg ID:", err?.message);
    return 0;
  }
}

/**
 * Scan a Telegram channel's history directly via MTProto (gramjs).
 * Works for public channels even when the bot is not a member via Bot API.
 * Pass maxMsgId = 0 to auto-detect the channel's actual latest message ID.
 * Calls `onFile` for every message that contains a document/video/audio/animation.
 */
export async function scanChannelMtproto(
  client: TelegramClient,
  channelId: string,
  maxMsgId: number,
  onFile: (result: MtprotoScanResult) => Promise<void>,
  onProgress?: (current: number, max: number) => void
): Promise<void> {
  const peer = await client.getInputEntity(channelId);

  // Auto-detect the real latest message ID if not provided or too low
  if (maxMsgId <= 0) {
    console.log("[scanChannelMtproto] Auto-detecting latest message ID...");
    const detected = await getChannelLatestMsgId(client, channelId);
    maxMsgId = detected > 0 ? detected : 100000;
    console.log(`[scanChannelMtproto] Latest message ID: ${maxMsgId}`);
    onProgress?.(0, maxMsgId); // report real total immediately
  }

  const BATCH = 100;
  for (let base = 0; base < maxMsgId; base += BATCH) {
    const ids: Api.TypeInputMessage[] = [];
    for (let i = 1; i <= BATCH && base + i <= maxMsgId; i++) {
      ids.push(new Api.InputMessageID({ id: base + i }));
    }
    if (!ids.length) break;

    let result: any;
    try {
      if ((peer as any).className === "InputPeerChannel" || peer instanceof Api.InputPeerChannel) {
        const ch = peer as Api.InputPeerChannel;
        result = await client.invoke(
          new Api.channels.GetMessages({
            channel: new Api.InputChannel({ channelId: ch.channelId, accessHash: ch.accessHash }),
            id: ids,
          })
        );
      } else {
        result = await client.invoke(new Api.messages.GetMessages({ id: ids }));
      }
    } catch (err: any) {
      console.warn(`[scanChannelMtproto] batch ${base}–${base + BATCH} error:`, err?.message);
      await new Promise(r => setTimeout(r, 1000));
      continue;
    }

    const messages: any[] = result?.messages ?? [];
    for (const msg of messages) {
      if (!msg?.id || msg.className === "MessageEmpty") continue;

      onProgress?.(msg.id, maxMsgId);

      const doc =
        msg.media?.document ??
        msg.media?.video ??
        msg.media?.audio ??
        msg.document ??
        msg.video ??
        msg.audio;

      if (!doc?.id) continue;

      const mimeType: string = doc.mimeType || "application/octet-stream";
      const fileType = mimeType.startsWith("video/") ? 4 : 5;

      const documentId = bigInt(doc.id.toString());
      const accessHash = bigInt(doc.accessHash.toString());
      const fileReference = Buffer.from(doc.fileReference);
      const dcId: number = doc.dcId ?? 1;

      const fileId = buildTelegramFileId(documentId, accessHash, fileReference, dcId, fileType);
      const fileUniqueId = buildTelegramFileUniqueId(documentId, fileType);

      let attrFileName = `File_${msg.id}`;
      if (doc.attributes) {
        for (const attr of doc.attributes) {
          if (attr.fileName) { attrFileName = attr.fileName; break; }
          if (attr.title) { attrFileName = attr.title; break; }
        }
      }
      // Caption is ALWAYS preferred — it contains the real movie/show title.
      // Only fall back to the file attribute name when caption is absent and the
      // attribute name looks like a real title (not a generic/placeholder name).
      const GENERIC_NAME = /^(video|file|document|audio|animation|default[_.\s-]?name|default|untitled|no[_.\s-]?name|filename|movie|media|unnamed)(\.mp4|\.mkv|\.avi|\.mov|\.ts)?$/i;
      const msgCaption = (msg.message as string | undefined)?.split('\n')[0]?.trim();
      const attrIsGeneric = GENERIC_NAME.test(attrFileName.trim()) || attrFileName === `File_${msg.id}`;
      let rawFileName: string;
      if (msgCaption && msgCaption.length > 2) {
        rawFileName = msgCaption;
      } else if (!attrIsGeneric) {
        rawFileName = attrFileName;
      } else {
        rawFileName = `File_${msg.id}`;
      }
      const { normalizeFileName } = await import("./unicode-normalize");
      const fileName = normalizeFileName(rawFileName);

      try {
        await onFile({
          fileId,
          fileUniqueId,
          fileName,
          fileSize: typeof doc.size === "object" ? Number(doc.size.toString()) : (doc.size || 0),
          mimeType,
          messageId: msg.id,
        });
      } catch (err: any) {
        console.warn(`[scanChannelMtproto] onFile error for msg ${msg.id}:`, err?.message);
      }
    }

    await new Promise(r => setTimeout(r, 300));
  }
}

// ── File reference refresh via original message ───────────────────────────────

/**
 * Re-fetches the original Telegram message to extract a fresh fileReference.
 * Call this when `FILE_REFERENCE_EXPIRED` is encountered during MTProto streaming.
 */
export async function refreshFileReference(
  client: TelegramClient,
  channelId: string,
  messageId: number
): Promise<Buffer | null> {
  try {
    const peer = await client.getInputEntity(channelId);

    let messages: any[];
    if (peer instanceof Api.InputPeerChannel || (peer as any).className === "InputPeerChannel") {
      const ch = peer as Api.InputPeerChannel;
      const result = await client.invoke(
        new Api.channels.GetMessages({
          channel: new Api.InputChannel({
            channelId: ch.channelId,
            accessHash: ch.accessHash,
          }),
          id: [new Api.InputMessageID({ id: messageId })],
        })
      );
      messages = (result as any).messages ?? [];
    } else {
      const result = await client.invoke(
        new Api.messages.GetMessages({
          id: [new Api.InputMessageID({ id: messageId })],
        })
      );
      messages = (result as any).messages ?? [];
    }

    if (!messages.length) return null;
    const msg = messages[0];
    const doc = msg?.media?.document ?? msg?.document;
    if (!doc?.fileReference) return null;
    return Buffer.from(doc.fileReference);
  } catch (err: any) {
    console.warn("[TgStream] refreshFileReference failed:", err?.message);
    return null;
  }
}

// ── Streaming ────────────────────────────────────────────────────────────────

const REQUEST_SIZE = 512 * 1024;

export async function streamTelegramRange(
  client: TelegramClient,
  location: TgFileLocation,
  start: number,
  end: number,
  res: Response,
  refreshFn?: () => Promise<Buffer | null>
): Promise<void> {
  let { dcId, documentId, accessHash, fileReference } = location;

  const doStream = async () => {
    const inputFile = new Api.InputDocumentFileLocation({
      id: documentId,
      accessHash,
      fileReference,
      thumbSize: "",
    });

    const length = end - start + 1;
    let received = 0;

    for await (const chunk of client.iterDownload({
      file: inputFile,
      offset: bigInt(start),
      limit: length,
      requestSize: REQUEST_SIZE,
      dcId,
    } as any)) {
      if (received >= length) break;
      const slice = received + chunk.length > length
        ? chunk.slice(0, length - received)
        : chunk;
      res.write(slice);
      received += slice.length;
    }
  };

  try {
    await doStream();
    res.end();
  } catch (err: any) {
    const isExpired =
      err?.errorMessage === "FILE_REFERENCE_EXPIRED" ||
      (typeof err?.message === "string" && err.message.includes("FILE_REFERENCE_EXPIRED"));

    if (isExpired && refreshFn) {
      console.log("[TgStream] File reference expired — attempting refresh...");
      const freshRef = await refreshFn();
      if (freshRef) {
        fileReference = freshRef;
        try {
          await doStream();
          res.end();
          return;
        } catch (retryErr: any) {
          throw retryErr;
        }
      }
    }
    throw err;
  }
}

// ── File size via MTProto ────────────────────────────────────────────────────

export async function getTelegramFileSize(
  client: TelegramClient,
  location: TgFileLocation
): Promise<number> {
  const { documentId, accessHash, fileReference, dcId } = location;

  try {
    const result = await (client as any).invoke(
      new Api.upload.GetFile({
        location: new Api.InputDocumentFileLocation({
          id: documentId,
          accessHash,
          fileReference,
          thumbSize: "",
        }),
        offset: bigInt(0),
        limit: 1,
      })
    );
    if (result && "type" in result) {
      return (result as any).size ?? 0;
    }
  } catch {
  }
  return 0;
}
