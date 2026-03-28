import { db } from "./db";
import {
  movies, episodes, channels, syncedFiles, ads, users, settings, backups, mascotSettings, footballApiKeys, viewLogs, appUrls,
  type Movie, type InsertMovie,
  type Episode, type InsertEpisode,
  type Channel, type SyncedFile, type InsertSyncedFile,
  type Ad, type InsertAd,
  type User, type InsertUser,
  type Settings, type InsertSettings,
  type Backup, type InsertBackup,
  type MascotSettings,
  type FootballApiKey, type InsertFootballApiKey,
  type AppUrl, type InsertAppUrl,
} from "@shared/schema";
import { eq, desc, sql, like, ilike, and, gte, lte, inArray, or } from "drizzle-orm";

export interface IStorage {
  // Movies
  getMovies(params: { search?: string, type?: string, language?: string, limit?: number, offset?: number, sort?: string, status?: string, missingEpisodes?: boolean }): Promise<{ items: Movie[], total: number }>;
  getMoviesByIds(ids: number[]): Promise<Movie[]>;
  incrementMovieViews(id: number): Promise<void>;
  logDailyView(movieId?: number): Promise<void>;
  getViewStats(days: number): Promise<{ date: string; count: number }[]>;
  getMovie(id: number): Promise<Movie | undefined>;
  getMovieByFileUniqueId(fileUniqueId: string): Promise<Movie | undefined>;
  getMovieByTmdbId(tmdbId: number): Promise<Movie | undefined>;
  getMovieByTitle(title: string): Promise<Movie | undefined>;
  getDuplicateMoviesByTmdbId(): Promise<Movie[]>;
  createMovie(movie: InsertMovie): Promise<Movie>;
  updateMovie(id: number, updates: Partial<InsertMovie>): Promise<Movie>;
  deleteMovie(id: number): Promise<void>;
  incrementMovieViews(id: number): Promise<void>;
  markMoviePosted(id: number): Promise<void>;

  // Episodes
  getEpisodes(movieId: number, seasonNumber?: number): Promise<Episode[]>;
  getEpisode(id: number): Promise<Episode | undefined>;
  getEpisodeByFileUniqueId(fileUniqueId: string): Promise<Episode | undefined>;
  createEpisode(episode: InsertEpisode): Promise<Episode>;
  updateEpisode(id: number, updates: Partial<InsertEpisode>): Promise<Episode>;
  deleteEpisode(id: number): Promise<void>;

  // Channels
  getChannels(): Promise<Channel[]>;
  createChannel(channel: Partial<Channel>): Promise<Channel>;
  updateChannel(id: number, update: Partial<Channel>): Promise<Channel | undefined>;
  deleteChannel(id: number): Promise<void>;

  // Synced Files
  getSyncedFiles(params?: { search?: string; fileIdSearch?: string; type?: "movie" | "series"; listed?: "listed" | "not_listed"; dateFrom?: string; dateTo?: string; sort?: "az" | "za"; limit?: number; offset?: number }): Promise<{ items: (SyncedFile & { isListed: boolean })[]; total: number }>;
  getSyncedFileById(id: number): Promise<SyncedFile | undefined>;
  createSyncedFile(file: InsertSyncedFile): Promise<SyncedFile>;
  getSyncedFileByUniqueId(fileUniqueId: string): Promise<SyncedFile | undefined>;
  deleteSyncedFile(id: number): Promise<void>;
  updateSyncedFileName(id: number, fileName: string): Promise<SyncedFile | undefined>;

  // Ads
  getAds(): Promise<Ad[]>;
  createAd(ad: InsertAd): Promise<Ad>;
  getRandomAd(): Promise<Ad | undefined>;
  getRandomFullscreenAd(): Promise<Ad | undefined>;
  incrementAdImpressions(id: number): Promise<void>;
  deleteAd(id: number): Promise<void>;

  // Users
  getUser(telegramId: string): Promise<User | undefined>;
  getUsers(): Promise<User[]>;
  createUser(user: typeof users.$inferInsert): Promise<User>;
  updateUserActivity(telegramId: string): Promise<void>;
  getUserStats(): Promise<{ totalUsers: number }>;
  
  // Settings
  getSettings(): Promise<Settings | undefined>;
  updateSettings(settings: Partial<Settings>): Promise<Settings>;

  // Dashboard Stats
  getDashboardStats(): Promise<{ totalMovies: number, totalSeries: number, totalViews: number, activeAds: number, totalUsers: number }>;
  getTopRatedMovies(limit: number): Promise<Movie[]>;

  // Backups
  createBackup(backup: InsertBackup): Promise<Backup>;
  getBackups(limit?: number): Promise<Backup[]>;

  // Mascot Settings
  getMascotSettings(): Promise<MascotSettings>;
  updateMascotSettings(updates: Partial<MascotSettings>): Promise<MascotSettings>;

  // Football API Keys
  getFootballApiKeys(): Promise<FootballApiKey[]>;
  getRandomFootballApiKey(): Promise<FootballApiKey | undefined>;
  createFootballApiKey(key: InsertFootballApiKey): Promise<FootballApiKey>;
  updateFootballApiKey(id: number, updates: Partial<InsertFootballApiKey>): Promise<FootballApiKey>;
  deleteFootballApiKey(id: number): Promise<void>;
  incrementFootballApiKeyRequestCount(id: number): Promise<void>;

  // App URLs
  getAppUrls(): Promise<AppUrl[]>;
  createAppUrl(url: InsertAppUrl): Promise<AppUrl>;
  updateAppUrl(id: number, updates: Partial<InsertAppUrl>): Promise<AppUrl>;
  deleteAppUrl(id: number): Promise<void>;
  incrementAppUrlVisitCount(id: number): Promise<void>;
  getRandomActiveAppUrl(): Promise<AppUrl | undefined>;
}

export class DatabaseStorage implements IStorage {
  async getTopRatedMovies(limit: number): Promise<Movie[]> {
    return await db.select()
      .from(movies)
      .where(eq(movies.type, 'movie'))
      .orderBy(desc(movies.views))
      .limit(limit);
  }

  async createBackup(backup: InsertBackup): Promise<Backup> {
    const [newBackup] = await db.insert(backups).values(backup).returning();
    return newBackup;
  }

  async getBackups(limit = 10): Promise<Backup[]> {
    return await db.select()
      .from(backups)
      .orderBy(desc(backups.createdAt))
      .limit(limit);
  }
  async getMovies(params: { search?: string, type?: string, language?: string, limit?: number, offset?: number, sort?: string, status?: string, missingEpisodes?: boolean }): Promise<{ items: Movie[], total: number }> {
    const conditions = [];
    if (params.search) {
      const q = `%${params.search.toLowerCase()}%`;
      conditions.push(sql`(
        lower(${movies.title}) like ${q}
        OR lower(coalesce(${movies.genre}, '')) like ${q}
        OR lower(cast(${movies.cast} as text)) like ${q}
        OR lower(coalesce(${movies.releaseDate}, '')) like ${q}
      )`);
    }
    if (params.type) conditions.push(eq(movies.type, params.type as any));
    if (params.language) conditions.push(eq(movies.originalLanguage, params.language));
    if (params.status) conditions.push(eq(movies.status, params.status));
    if (params.missingEpisodes) {
      conditions.push(sql`${movies.type} = 'series'`);
      conditions.push(sql`${movies.id} IN (
        SELECT DISTINCT movie_id FROM episodes
        WHERE (file_id = '' OR file_unique_id LIKE 'tmdb_%')
      )`);
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(movies)
      .where(whereClause);

    const orderBy = params.sort === 'rating' ? desc(movies.rating)
      : params.sort === 'views' ? desc(movies.views)
      : desc(movies.createdAt);

    const items = await db.select()
      .from(movies)
      .where(whereClause)
      .limit(params.limit || 20)
      .offset(params.offset || 0)
      .orderBy(orderBy);

    return { items, total: Number(countResult?.count || 0) };
  }

  async getMoviesByIds(ids: number[]): Promise<Movie[]> {
    if (ids.length === 0) return [];
    return await db.select().from(movies).where(inArray(movies.id, ids));
  }

  async incrementMovieViews(id: number): Promise<void> {
    await db.update(movies).set({ views: sql`${movies.views} + 1` }).where(eq(movies.id, id));
  }

  async logDailyView(movieId?: number): Promise<void> {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const existing = await db.select().from(viewLogs)
      .where(and(eq(viewLogs.date, today), movieId ? eq(viewLogs.movieId, movieId) : sql`${viewLogs.movieId} IS NULL`))
      .limit(1);
    if (existing.length > 0) {
      await db.update(viewLogs).set({ count: sql`${viewLogs.count} + 1` }).where(eq(viewLogs.id, existing[0].id));
    } else {
      await db.insert(viewLogs).values({ date: today, count: 1, movieId: movieId ?? null });
    }
  }

  async getViewStats(days: number): Promise<{ date: string; count: number }[]> {
    const since = new Date();
    since.setDate(since.getDate() - days + 1);
    const sinceStr = since.toISOString().slice(0, 10);
    const rows = await db.select({
      date: viewLogs.date,
      count: sql<number>`sum(${viewLogs.count})`,
    })
      .from(viewLogs)
      .where(gte(viewLogs.date, sinceStr))
      .groupBy(viewLogs.date)
      .orderBy(viewLogs.date);
    return rows.map(r => ({ date: r.date, count: Number(r.count) }));
  }

  async getMovie(id: number): Promise<Movie | undefined> {
    const [movie] = await db.select().from(movies).where(eq(movies.id, id));
    return movie;
  }

  async getMovieByFileUniqueId(fileUniqueId: string): Promise<Movie | undefined> {
    const [movie] = await db.select().from(movies).where(eq(movies.fileUniqueId, fileUniqueId));
    return movie;
  }

  async getMovieByTmdbId(tmdbId: number): Promise<Movie | undefined> {
    const [movie] = await db.select().from(movies).where(eq(movies.tmdbId, tmdbId));
    return movie;
  }

  async getMovieByTitle(title: string): Promise<Movie | undefined> {
    const [movie] = await db.select().from(movies).where(sql`lower(${movies.title}) = lower(${title})`);
    return movie;
  }

  async getDuplicateMoviesByTmdbId(): Promise<Movie[]> {
    const allMovies = await db.select().from(movies).orderBy(movies.id);
    const seenTmdb = new Map<number, number>();
    const seenTitle = new Map<string, number>();
    const duplicateIds = new Set<number>();

    for (const movie of allMovies) {
      // Check by TMDB ID
      if (movie.tmdbId !== null && movie.tmdbId !== undefined) {
        if (seenTmdb.has(movie.tmdbId)) {
          duplicateIds.add(movie.id);
        } else {
          seenTmdb.set(movie.tmdbId, movie.id);
        }
      }

      // Check by normalized title (catch duplicates without tmdbId or with different tmdbIds)
      const normalizedTitle = movie.title.toLowerCase().trim();
      if (seenTitle.has(normalizedTitle)) {
        duplicateIds.add(movie.id);
      } else {
        seenTitle.set(normalizedTitle, movie.id);
      }
    }

    return allMovies.filter(m => duplicateIds.has(m.id));
  }

  async createMovie(movie: InsertMovie): Promise<Movie> {
    const [newMovie] = await db.insert(movies).values(movie).returning();
    return newMovie;
  }

  async markMoviePosted(id: number): Promise<void> {
    await db.update(movies).set({ postedToChannel: true }).where(eq(movies.id, id));
  }

  async updateMovie(id: number, updates: Partial<InsertMovie>): Promise<Movie> {
    const [updatedMovie] = await db.update(movies)
      .set(updates)
      .where(eq(movies.id, id))
      .returning();
    if (!updatedMovie) throw new Error("Movie not found");
    return updatedMovie;
  }

  async deleteMovie(id: number): Promise<void> {
    await db.delete(episodes).where(eq(episodes.movieId, id));
    await db.delete(movies).where(eq(movies.id, id));
  }

  async incrementMovieViews(id: number): Promise<void> {
    await db.update(movies)
      .set({ views: sql`${movies.views} + 1` })
      .where(eq(movies.id, id));
  }

  async getEpisodes(movieId: number, seasonNumber?: number): Promise<Episode[]> {
    const conditions = [eq(episodes.movieId, movieId)];
    if (seasonNumber !== undefined) conditions.push(eq(episodes.seasonNumber, seasonNumber));
    return await db.select().from(episodes).where(and(...conditions)).orderBy(episodes.seasonNumber, episodes.episodeNumber);
  }

  async getEpisode(id: number): Promise<Episode | undefined> {
    const [res] = await db.select().from(episodes).where(eq(episodes.id, id));
    return res;
  }

  async getEpisodeByFileUniqueId(fileUniqueId: string): Promise<Episode | undefined> {
    const [res] = await db.select().from(episodes).where(eq(episodes.fileUniqueId, fileUniqueId));
    return res;
  }

  async createEpisode(episode: InsertEpisode): Promise<Episode> {
    const [newEpisode] = await db.insert(episodes).values(episode).returning();
    return newEpisode;
  }

  async updateEpisode(id: number, updates: Partial<InsertEpisode>): Promise<Episode> {
    const [updated] = await db.update(episodes).set(updates).where(eq(episodes.id, id)).returning();
    return updated;
  }

  async deleteEpisode(id: number): Promise<void> {
    await db.delete(episodes).where(eq(episodes.id, id));
  }

  async getChannels(): Promise<Channel[]> {
    return await db.select().from(channels);
  }

  async createChannel(channel: Partial<Channel>): Promise<Channel> {
    const [newChannel] = await db.insert(channels).values(channel as any).returning();
    return newChannel;
  }

  async updateChannel(id: number, update: Partial<Channel>): Promise<Channel | undefined> {
    const [channel] = await db.update(channels).set(update).where(eq(channels.id, id)).returning();
    return channel;
  }

  async deleteChannel(id: number): Promise<void> {
    await db.delete(channels).where(eq(channels.id, id));
  }

  async getSyncedFiles(params: { search?: string; fileIdSearch?: string; type?: "movie" | "series"; listed?: "listed" | "not_listed"; dateFrom?: string; dateTo?: string; sort?: "az" | "za"; limit?: number; offset?: number } = {}): Promise<{ items: (SyncedFile & { isListed: boolean })[]; total: number }> {
    const { search, fileIdSearch, type, listed, dateFrom, dateTo, sort, limit = 200, offset = 0 } = params;

    // isListed subquery: file exists in movies OR episodes by fileUniqueId
    const isListedExpr = sql<boolean>`(
      EXISTS (SELECT 1 FROM movies WHERE movies.file_unique_id = ${syncedFiles.fileUniqueId})
      OR EXISTS (SELECT 1 FROM episodes WHERE episodes.file_unique_id = ${syncedFiles.fileUniqueId})
    )`;

    const conditions: any[] = [];

    if (search?.trim()) {
      conditions.push(ilike(syncedFiles.fileName, `%${search.trim()}%`));
    }
    if (fileIdSearch?.trim()) {
      conditions.push(ilike(syncedFiles.fileId, `%${fileIdSearch.trim()}%`));
    }
    if (type === "series") {
      conditions.push(sql`${syncedFiles.fileName} ~* 's[0-9]{1,2}e[0-9]{1,2}'`);
    } else if (type === "movie") {
      conditions.push(sql`NOT (${syncedFiles.fileName} ~* 's[0-9]{1,2}e[0-9]{1,2}')`);
    }
    if (listed === "listed") {
      conditions.push(sql`(
        EXISTS (SELECT 1 FROM movies WHERE movies.file_unique_id = ${syncedFiles.fileUniqueId})
        OR EXISTS (SELECT 1 FROM episodes WHERE episodes.file_unique_id = ${syncedFiles.fileUniqueId})
      )`);
    } else if (listed === "not_listed") {
      conditions.push(sql`NOT (
        EXISTS (SELECT 1 FROM movies WHERE movies.file_unique_id = ${syncedFiles.fileUniqueId})
        OR EXISTS (SELECT 1 FROM episodes WHERE episodes.file_unique_id = ${syncedFiles.fileUniqueId})
      )`);
    }
    if (dateFrom) {
      conditions.push(gte(syncedFiles.createdAt, new Date(dateFrom)));
    }
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      conditions.push(lte(syncedFiles.createdAt, end));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    // Count total
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(syncedFiles)
      .where(where);

    // Determine ORDER BY
    let orderBy: any;
    if (sort === "az") orderBy = syncedFiles.fileName;
    else if (sort === "za") orderBy = desc(syncedFiles.fileName);
    else orderBy = desc(syncedFiles.createdAt);

    // Fetch page with isListed computed field
    const rows = await db
      .select({ ...syncedFiles, isListed: isListedExpr })
      .from(syncedFiles)
      .where(where)
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset);

    return { items: rows as any, total: count };
  }

  async createSyncedFile(file: InsertSyncedFile): Promise<SyncedFile> {
    const [syncedFile] = await db.insert(syncedFiles).values(file).returning();
    return syncedFile;
  }

  async deleteSyncedFile(id: number): Promise<void> {
    await db.delete(syncedFiles).where(eq(syncedFiles.id, id));
  }

  async updateSyncedFileName(id: number, fileName: string): Promise<SyncedFile | undefined> {
    const [updated] = await db.update(syncedFiles).set({ fileName }).where(eq(syncedFiles.id, id)).returning();
    return updated;
  }

  async getSyncedFileByUniqueId(fileUniqueId: string): Promise<SyncedFile | undefined> {
    const [file] = await db.select().from(syncedFiles).where(eq(syncedFiles.fileUniqueId, fileUniqueId));
    return file;
  }

  async getSyncedFileById(id: number): Promise<SyncedFile | undefined> {
    const [file] = await db.select().from(syncedFiles).where(eq(syncedFiles.id, id));
    return file;
  }

  async getAds(): Promise<Ad[]> {
    return await db.select().from(ads);
  }

  async getUsers(): Promise<any[]> {
    return await db.select().from(users);
  }

  async createAd(ad: InsertAd): Promise<Ad> {
    const [newAd] = await db.insert(ads).values(ad).returning();
    return newAd;
  }

  async getRandomAd(): Promise<Ad | undefined> {
    const activeAds = await db.select().from(ads).where(eq(ads.isActive, true));
    if (activeAds.length === 0) return undefined;
    return activeAds[Math.floor(Math.random() * activeAds.length)];
  }

  async getRandomFullscreenAd(): Promise<Ad | undefined> {
    const now = new Date();
    const allActive = await db.select().from(ads)
      .where(and(eq(ads.isActive, true), eq(ads.type, 'fullscreen')));
    // Filter by schedule: startAt <= now and (expiresAt is null OR expiresAt > now)
    const eligible = allActive.filter(ad => {
      if (ad.startAt && ad.startAt > now) return false;
      if (ad.expiresAt && ad.expiresAt <= now) return false;
      return true;
    });
    if (eligible.length === 0) return undefined;
    return eligible[Math.floor(Math.random() * eligible.length)];
  }

  async incrementAdImpressions(id: number): Promise<void> {
    await db.update(ads)
      .set({ impressionCount: sql`${ads.impressionCount} + 1` })
      .where(eq(ads.id, id));
  }

  async deleteAd(id: number): Promise<void> {
    await db.delete(ads).where(eq(ads.id, id));
  }

  async getUser(telegramId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.telegramId, telegramId));
    return user;
  }

  async createUser(user: typeof users.$inferInsert): Promise<User> {
    const [newUser] = await db.insert(users).values(user).returning();
    return newUser;
  }

  async updateUserActivity(telegramId: string): Promise<void> {
    await db.update(users)
      .set({ lastActive: new Date() })
      .where(eq(users.telegramId, telegramId));
  }

  async getUserStats(): Promise<{ totalUsers: number }> {
    const [res] = await db.select({ count: sql<number>`count(*)` }).from(users);
    return { totalUsers: Number(res.count) };
  }

  async getSettings(): Promise<Settings | undefined> {
    const [res] = await db.select().from(settings).limit(1);
    return res;
  }

  async updateSettings(updates: Partial<Settings>): Promise<Settings> {
    const existing = await this.getSettings();
    if (existing) {
      const [updated] = await db.update(settings)
        .set(updates)
        .where(eq(settings.id, existing.id))
        .returning();
      return updated;
    } else {
      const [inserted] = await db.insert(settings)
        .values({
          ...updates,
          adminUsername: updates.adminUsername || "admin",
          adminPassword: updates.adminPassword || "admin123",
        } as any)
        .returning();
      return inserted;
    }
  }

  async getDashboardStats() {
    const [moviesCount] = await db.select({ count: sql<number>`count(*)` }).from(movies).where(eq(movies.type, 'movie'));
    const [seriesCount] = await db.select({ count: sql<number>`count(*)` }).from(movies).where(eq(movies.type, 'series'));
    const [viewsCount] = await db.select({ sum: sql<number>`sum(${movies.views})` }).from(movies);
    const [adsCount] = await db.select({ count: sql<number>`count(*)` }).from(ads).where(eq(ads.isActive, true));
    const [usersCount] = await db.select({ count: sql<number>`count(*)` }).from(users);

    return {
      totalMovies: Number(moviesCount?.count || 0),
      totalSeries: Number(seriesCount?.count || 0),
      totalViews: Number(viewsCount?.sum || 0),
      activeAds: Number(adsCount?.count || 0),
      totalUsers: Number(usersCount?.count || 0),
    };
  }

  async getMascotSettings(): Promise<MascotSettings> {
    const [existing] = await db.select().from(mascotSettings).limit(1);
    if (existing) return existing;
    // Bootstrap defaults
    const [created] = await db.insert(mascotSettings).values({
      enabled: true,
      files: ["chef-dancing.lottie", "fire-dancing.lottie"],
      intervalSeconds: 120,
      showDurationSeconds: 6,
    }).returning();
    return created;
  }

  async updateMascotSettings(updates: Partial<MascotSettings>): Promise<MascotSettings> {
    const existing = await this.getMascotSettings();
    const [updated] = await db.update(mascotSettings)
      .set(updates)
      .where(eq(mascotSettings.id, existing.id))
      .returning();
    return updated;
  }

  async getFootballApiKeys(): Promise<FootballApiKey[]> {
    return await db.select().from(footballApiKeys).orderBy(desc(footballApiKeys.createdAt));
  }

  async getRandomFootballApiKey(): Promise<FootballApiKey | undefined> {
    const active = await db.select().from(footballApiKeys).where(eq(footballApiKeys.isActive, true));
    if (active.length === 0) return undefined;
    return active[Math.floor(Math.random() * active.length)];
  }

  async createFootballApiKey(key: InsertFootballApiKey): Promise<FootballApiKey> {
    const [created] = await db.insert(footballApiKeys).values(key).returning();
    return created;
  }

  async updateFootballApiKey(id: number, updates: Partial<InsertFootballApiKey>): Promise<FootballApiKey> {
    const [updated] = await db.update(footballApiKeys).set(updates).where(eq(footballApiKeys.id, id)).returning();
    return updated;
  }

  async deleteFootballApiKey(id: number): Promise<void> {
    await db.delete(footballApiKeys).where(eq(footballApiKeys.id, id));
  }

  async incrementFootballApiKeyRequestCount(id: number): Promise<void> {
    await db.update(footballApiKeys)
      .set({ requestCount: sql`request_count + 1` })
      .where(eq(footballApiKeys.id, id));
  }

  async getAppUrls(): Promise<AppUrl[]> {
    return await db.select().from(appUrls).orderBy(desc(appUrls.createdAt));
  }

  async createAppUrl(url: InsertAppUrl): Promise<AppUrl> {
    const [created] = await db.insert(appUrls).values(url).returning();
    return created;
  }

  async updateAppUrl(id: number, updates: Partial<InsertAppUrl>): Promise<AppUrl> {
    const [updated] = await db.update(appUrls).set(updates).where(eq(appUrls.id, id)).returning();
    return updated;
  }

  async deleteAppUrl(id: number): Promise<void> {
    await db.delete(appUrls).where(eq(appUrls.id, id));
  }

  async incrementAppUrlVisitCount(id: number): Promise<void> {
    await db.update(appUrls)
      .set({ visitCount: sql`visit_count + 1` })
      .where(eq(appUrls.id, id));
  }

  async getRandomActiveAppUrl(): Promise<AppUrl | undefined> {
    const active = await db.select().from(appUrls).where(eq(appUrls.isActive, true));
    if (active.length === 0) return undefined;
    return active[Math.floor(Math.random() * active.length)];
  }
}

export const storage = new DatabaseStorage();
