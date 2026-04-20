import { pgTable, text, serial, integer, boolean, timestamp, bigint, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const qualityEnum = pgEnum("quality", ["480p", "720p", "1080p", "4k"]);
export const typeEnum = pgEnum("type", ["movie", "series"]);
export const roleEnum = pgEnum("role", ["source", "backup"]);
export const adTypeEnum = pgEnum("ad_type", ["adsterra", "custom_banner", "custom_redirect", "custom_native", "fullscreen"]);

// Movies & Series Data
export const movies = pgTable("movies", {
  id: serial("id").primaryKey(),
  fileId: text("file_id"), // Nullable for series containers
  fileUniqueId: text("file_unique_id"), // Nullable for series containers
  fileSize: bigint("file_size", { mode: "number" }),
  duration: integer("duration"), // in seconds
  caption: text("caption"),
  quality: qualityEnum("quality").default("720p"),
  title: text("title").notNull(),
  type: typeEnum("type").default("movie"),
  overview: text("overview"),
  posterPath: text("poster_path"),
  releaseDate: text("release_date"),
  tmdbId: integer("tmdb_id"),
  cast: jsonb("cast"),
  views: integer("views").default(0),
  downloads: integer("downloads").default(0),
  rating: integer("rating").default(0),
  genre: text("genre"),
  originalLanguage: text("original_language"),
  postedToChannel: boolean("posted_to_channel").default(false),
  status: text("status").default("completed"),
  streamUrl: text("stream_url"), // TG-FileStreamBot stream URL
  qualityUrls: jsonb("quality_urls"), // [{label:"1080p",url:"...",type:"mp4"|"hls"}]
  trailerUrl: text("trailer_url"), // Custom trailer URL (YouTube link or direct video)
  isAdult: boolean("is_adult").default(false),
  contentRating: text("content_rating"), // e.g. "18+", "21+", "Erotic", "Adult"
  createdAt: timestamp("created_at").defaultNow(),
});

// Episodes for Series
export const episodes = pgTable("episodes", {
  id: serial("id").primaryKey(),
  movieId: integer("movie_id").references(() => movies.id).notNull(),
  seasonNumber: integer("season_number").notNull(),
  episodeNumber: integer("episode_number").notNull(),
  title: text("title"),
  overview: text("overview"),
  fileId: text("file_id").notNull(),
  fileUniqueId: text("file_unique_id").notNull(),
  fileSize: bigint("file_size", { mode: "number" }),
  airDate: text("air_date"),
  rating: integer("rating").default(0),
  streamUrl: text("stream_url"), // TG-FileStreamBot stream URL
  createdAt: timestamp("created_at").defaultNow(),
});

// Telegram Channels
export const channels = pgTable("channels", {
  id: serial("id").primaryKey(),
  telegramId: text("telegram_id").notNull().unique(),
  username: text("username"),
  role: roleEnum("role").default("backup"),
  isActive: boolean("is_active").default(true),
  name: text("name"),
  lastMessageId: integer("last_message_id").default(0),
});

// Synced Files from Channels
export const syncedFiles = pgTable("synced_files", {
  id: serial("id").primaryKey(),
  channelId: text("channel_id").notNull(),
  messageId: integer("message_id").notNull(),
  fileId: text("file_id").notNull(),
  fileUniqueId: text("file_unique_id").notNull().unique(),
  fileName: text("file_name").notNull(),
  fileSize: bigint("file_size", { mode: "number" }),
  mimeType: text("mime_type"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Users (Bot Users)
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  telegramId: text("telegram_id").notNull().unique(),
  username: text("username"),
  firstName: text("first_name"),
  isAdmin: boolean("is_admin").default(false),
  joinedAt: timestamp("joined_at").defaultNow(),
  lastActive: timestamp("last_active").defaultNow(),
});

// Ads Configuration
export const ads = pgTable("ads", {
  id: serial("id").primaryKey(),
  type: adTypeEnum("type").notNull(),
  title: text("title").notNull(),
  content: text("content"),
  isActive: boolean("is_active").default(true),
  weight: integer("weight").default(1),
  impressionCount: integer("impression_count").default(0),
  // Fullscreen interstitial ad fields
  imageUrl: text("image_url"),
  videoUrl: text("video_url"),
  buttonText: text("button_text"),
  buttonUrl: text("button_url"),
  adText: text("ad_text"),
  // Scheduling
  startAt: timestamp("start_at"),
  expiresAt: timestamp("expires_at"),
});

// System Settings (Bot Token, Admin Auth)
export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  botToken: text("bot_token"),
  tmdbApiKey: text("tmdb_api_key"),
  adminUsername: text("admin_username").notNull().default("admin"),
  adminPassword: text("admin_password").notNull().default("admin123"),
  isSetup: boolean("is_setup").default(false),
  githubToken: text("github_token"),
  githubRepo: text("github_repo"),
  githubBranch: text("github_branch").default("main"),
  autoBackupEnabled: boolean("auto_backup_enabled").default(false),
  telegramChannelUsername: text("telegram_channel_username"),
  autoPostMovies: boolean("auto_post_movies").default(false),
  autoPostSeries: boolean("auto_post_series").default(false),
  autoAddMovies: boolean("auto_add_movies").default(false),
  splashVideoPath: text("splash_video_path"),
  splashAlwaysShow: boolean("splash_always_show").default(false),
  urlRotationEnabled: boolean("url_rotation_enabled").default(false),
  adminTelegramUsername: text("admin_telegram_username"),
  supportPackages: jsonb("support_packages").$type<{ name: string; price: string; description: string }[]>().default([]),
  fsbBaseUrl: text("fsb_base_url"),
  fsbHashLength: integer("fsb_hash_length").default(6),
  fsbEnabled: boolean("fsb_enabled").default(false),
  fsbApiId: text("fsb_api_id"),
  fsbApiHash: text("fsb_api_hash"),
  fsbBotToken: text("fsb_bot_token"),
  fsbBinChannel: text("fsb_bin_channel"),
  fsbPort: integer("fsb_port").default(8000),
  fsbFqdn: text("fsb_fqdn"),
  fsbHasSsl: boolean("fsb_has_ssl").default(false),
  introVideoPath: text("intro_video_path"),
  streamEnabled: boolean("stream_enabled").default(true),
  apiKey: text("api_key"),
  lbEnabled: boolean("lb_enabled").default(false),
  tiktokAdminChatId: text("tiktok_admin_chat_id"),
  telegramBackupChannelId: text("telegram_backup_channel_id"),
  telegramAutoDbBackupEnabled: boolean("telegram_auto_db_backup_enabled").default(false),
  smartLinkUrl: text("smart_link_url"),
  smartLinkCountdown: integer("smart_link_countdown").default(5),
  smartLinkInterval: integer("smart_link_interval").default(0),
  bannerAdUrl: text("banner_ad_url"),
  bannerAdEnabled: boolean("banner_ad_enabled").default(false),
  bannerAdCode: text("banner_ad_code"),
});

// Mascot Settings
export const mascotSettings = pgTable("mascot_settings", {
  id: serial("id").primaryKey(),
  enabled: boolean("enabled").default(true),
  files: jsonb("files").$type<string[]>().default([]),
  intervalSeconds: integer("interval_seconds").default(120),
  showDurationSeconds: integer("show_duration_seconds").default(6),
});

// Football API Keys (SportSRC)
export const footballApiKeys = pgTable("football_api_keys", {
  id: serial("id").primaryKey(),
  key: text("key").notNull(),
  label: text("label"),
  isActive: boolean("is_active").default(true),
  requestCount: integer("request_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// Daily View Logs for analytics
export const viewLogs = pgTable("view_logs", {
  id: serial("id").primaryKey(),
  date: text("date").notNull(), // YYYY-MM-DD
  count: integer("count").default(1).notNull(),
  movieId: integer("movie_id"),
});

// Backup History
export const backups = pgTable("backups", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(), // 'manual' or 'auto'
  status: text("status").notNull(), // 'success' or 'failed'
  message: text("message"),
  backupData: jsonb("backup_data"),
  createdAt: timestamp("created_at").defaultNow(),
});

// App URLs for bot rotation
export const appUrls = pgTable("app_urls", {
  id: serial("id").primaryKey(),
  url: text("url").notNull(),
  label: text("label"),
  isActive: boolean("is_active").default(true),
  visitCount: integer("visit_count").default(0),
  isHealthy: boolean("is_healthy"),
  lastChecked: timestamp("last_checked"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Stream Load Balancer Backends
export const streamBackends = pgTable("stream_backends", {
  id: serial("id").primaryKey(),
  url: text("url").notNull(),
  label: text("label"),
  isActive: boolean("is_active").default(true),
  isHealthy: boolean("is_healthy"),
  lastChecked: timestamp("last_checked"),
  requestCount: integer("request_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// TikTok Video Projects
export const tiktokProjects = pgTable("tiktok_projects", {
  id: serial("id").primaryKey(),
  title: text("title").notNull().default("Untitled Project"),
  niche: text("niche").default(""),
  hookText: text("hook_text").notNull().default(""),
  hookEmoji: text("hook_emoji").default("🔥"),
  bodyPoints: jsonb("body_points").$type<string[]>().default([]),
  ctaText: text("cta_text").notNull().default("Follow for more!"),
  backgroundColor: text("background_color").notNull().default("#0a0a0a"),
  backgroundStyle: text("background_style").notNull().default("gradient"),
  gradientFrom: text("gradient_from").notNull().default("#1a1a2e"),
  gradientTo: text("gradient_to").notNull().default("#16213e"),
  textColor: text("text_color").notNull().default("#ffffff"),
  accentColor: text("accent_color").notNull().default("#ff0050"),
  hookFontSize: integer("hook_font_size").notNull().default(52),
  bodyFontSize: integer("body_font_size").notNull().default(26),
  ctaFontSize: integer("cta_font_size").notNull().default(30),
  fontWeight: text("font_weight").notNull().default("bold"),
  textAlign: text("text_align").notNull().default("center"),
  showEmoji: boolean("show_emoji").notNull().default(true),
  overlayStyle: text("overlay_style").notNull().default("none"),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Schemas
export const insertAppUrlSchema = createInsertSchema(appUrls).omit({ id: true, createdAt: true, visitCount: true });
export const insertStreamBackendSchema = createInsertSchema(streamBackends).omit({ id: true, createdAt: true, requestCount: true });
export const insertMovieSchema = createInsertSchema(movies).omit({ id: true, createdAt: true, views: true, rating: true });
export const insertEpisodeSchema = createInsertSchema(episodes).omit({ id: true, createdAt: true });
export const insertChannelSchema = createInsertSchema(channels).omit({ id: true });
export const insertSyncedFileSchema = createInsertSchema(syncedFiles).omit({ id: true, createdAt: true });
export const insertUserSchema = createInsertSchema(users).omit({ id: true, joinedAt: true, lastActive: true });
export const insertAdSchema = createInsertSchema(ads).omit({ id: true, impressionCount: true });
export const insertSettingsSchema = createInsertSchema(settings).omit({ id: true });
export const insertBackupSchema = createInsertSchema(backups).omit({ id: true, createdAt: true });
export const insertMascotSettingsSchema = createInsertSchema(mascotSettings).omit({ id: true });
export const insertFootballApiKeySchema = createInsertSchema(footballApiKeys).omit({ id: true, createdAt: true });
export const insertViewLogSchema = createInsertSchema(viewLogs).omit({ id: true });

// Types
export type Movie = typeof movies.$inferSelect;
export type InsertMovie = z.infer<typeof insertMovieSchema>;
export type Episode = typeof episodes.$inferSelect;
export type InsertEpisode = z.infer<typeof insertEpisodeSchema>;
export type Channel = typeof channels.$inferSelect;
export type InsertChannel = z.infer<typeof insertChannelSchema>;
export type SyncedFile = typeof syncedFiles.$inferSelect;
export type InsertSyncedFile = z.infer<typeof insertSyncedFileSchema>;
export type Ad = typeof ads.$inferSelect;
export type InsertAd = z.infer<typeof insertAdSchema>;
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Settings = typeof settings.$inferSelect;
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Backup = typeof backups.$inferSelect;
export type InsertBackup = z.infer<typeof insertBackupSchema>;
export type MascotSettings = typeof mascotSettings.$inferSelect;
export type InsertMascotSettings = z.infer<typeof insertMascotSettingsSchema>;
export type FootballApiKey = typeof footballApiKeys.$inferSelect;
export type InsertFootballApiKey = z.infer<typeof insertFootballApiKeySchema>;
export type ViewLog = typeof viewLogs.$inferSelect;
export type InsertViewLog = z.infer<typeof insertViewLogSchema>;
export type AppUrl = typeof appUrls.$inferSelect;
export type InsertAppUrl = z.infer<typeof insertAppUrlSchema>;
export type StreamBackend = typeof streamBackends.$inferSelect;
export type InsertStreamBackend = z.infer<typeof insertStreamBackendSchema>;
export const insertTiktokProjectSchema = createInsertSchema(tiktokProjects).omit({ id: true, createdAt: true, updatedAt: true });
export type TiktokProject = typeof tiktokProjects.$inferSelect;
export type InsertTiktokProject = z.infer<typeof insertTiktokProjectSchema>;
