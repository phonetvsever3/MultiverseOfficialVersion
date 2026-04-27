import { useState, useEffect, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import { useMovie } from "@/hooks/use-movies";
import { Calendar, Star, Film, Download, Tv, Play, ChevronLeft, User, Sparkles, ArrowRight, X, Database, Shield, Heart } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { type Episode, type Movie } from "@shared/schema";
import { addToWatchHistory } from "@/lib/watch-history";
import { isInWatchlist, toggleWatchlist } from "@/lib/watchlist";
import { SmartLinkAdBox } from "@/components/SmartLinkAdBox";
import { TelegaioAdBanner, TelegaioFullscreenAd } from "@/components/TelegaioAd";
import { motion } from "framer-motion";

const tg = (window as any).Telegram?.WebApp;
const TMDB_IMAGE = "https://image.tmdb.org/t/p/";

interface SmartLinkConfig {
  url: string;
  countdown: number;
  interval: number;
}

interface TrailerInfo {
  key: string;
  site: string;
  name: string;
}

function getPoster(path: string | null | undefined, size = "w780") {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `${TMDB_IMAGE}${size}${path}`;
}

function shouldShowAd(config: SmartLinkConfig): boolean {
  if (!config.url) return false;
  if (config.interval === 0) return true;
  try {
    const lastSeen = Number(localStorage.getItem("sl_last_seen") || "0");
    if (!lastSeen) return true;
    return Date.now() - lastSeen >= config.interval * 60 * 1000;
  } catch {
    return true;
  }
}

function recordAdSeen() {
  try { localStorage.setItem("sl_last_seen", String(Date.now())); } catch {}
}

export default function MovieView() {
  const [, params] = useRoute("/app/movie/:id");
  const [, setLocation] = useLocation();
  const movieId = parseInt(params?.id || "0");
  const { data: movie, isLoading } = useMovie(movieId);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [showTrailer, setShowTrailer] = useState(false);
  const [adBox, setAdBox] = useState<{ mode: "watch" | "download"; action: () => void } | null>(null);
  const [favorited, setFavorited] = useState(() => isInWatchlist(movieId));

  const { data: trailer } = useQuery<TrailerInfo | null>({
    queryKey: [`/api/movies/${movieId}/trailer`],
    enabled: !!movie && !!movie.tmdbId && !movie.trailerUrl,
  });

  const { data: smartLinkConfig } = useQuery<SmartLinkConfig>({
    queryKey: ["/api/public/smart-link"],
    staleTime: 60000,
  });

  const { data: bannerAdConfig } = useQuery<{ code: string; enabled: boolean }>({
    queryKey: ["/api/public/banner-ad"],
    staleTime: 60000,
  });

  const { data: telegaioConfig } = useQuery<{ script: string; enabled: boolean; fullscreenEnabled: boolean; rewardEnabled: boolean; rewardToken: string; rewardAdBlockUuid: string }>({
    queryKey: ["/api/public/telegaio-ad"],
    staleTime: 60000,
  });
  const [showTelegaioFs, setShowTelegaioFs] = useState(false);

  const { data: episodes } = useQuery<Episode[]>({
    queryKey: [`/api/movies/${movieId}/episodes`],
    enabled: !!movie && movie.type === "series",
  });

  const { data: recommendedData } = useQuery<{ items: Movie[]; total: number }>({
    queryKey: [`/api/browse`, movie?.type, "rating", "", "", 1],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (movie?.type) p.set("type", movie.type);
      p.set("sort", "rating");
      p.set("page", "1");
      const res = await fetch(`/api/browse?${p}`);
      return res.json();
    },
    enabled: !!movie,
  });
  const recommendedMovies = (recommendedData?.items || []).filter((m) => m.id !== movieId).slice(0, 10);

  useEffect(() => {
    if (!movieId) return;
    addToWatchHistory(movieId);
    fetch(`/api/movies/${movieId}/view`, { method: "POST" }).catch(() => {});
  }, [movieId]);

  useEffect(() => {
    if (tg) { tg.ready(); tg.expand(); tg.MainButton.hide(); }
  }, []);

  const showRewardAd = useCallback(async (token: string, adBlockUuid: string, callback: () => void) => {
    try {
      const TelegaIn = (window as any).TelegaIn;
      if (!TelegaIn?.AdsController) { callback(); return; }
      if (!(window as any).__telegaInAds) {
        (window as any).__telegaInAds = TelegaIn.AdsController.create_miniapp({ token });
      }
      const ads = (window as any).__telegaInAds;
      await ads.ad_show({ adBlockUuid });
    } catch {
      // If ad fails or is skipped, still proceed
    } finally {
      callback();
    }
  }, []);

  const triggerAction = useCallback((mode: "watch" | "download", action: () => void) => {
    const config = smartLinkConfig || { url: "", countdown: 5, interval: 0 };
    const hasTelegaioFs = telegaioConfig?.fullscreenEnabled && !!telegaioConfig?.script;
    const hasSmartLink = shouldShowAd(config);
    const hasReward = !!(telegaioConfig?.rewardEnabled && telegaioConfig?.rewardToken && telegaioConfig?.rewardAdBlockUuid);

    // Build the pool of available ad slots
    const pool: Array<"smartlink" | "telegaio_fs" | "reward"> = [];
    if (hasSmartLink) pool.push("smartlink");
    if (hasTelegaioFs) pool.push("telegaio_fs");
    if (hasReward) pool.push("reward");

    if (pool.length === 0) { action(); return; }

    // Pick randomly from pool
    const picked = pool[Math.floor(Math.random() * pool.length)];

    if (picked === "smartlink") {
      setAdBox({ mode, action });
    } else if (picked === "telegaio_fs") {
      setShowTelegaioFs(true);
      (window as any).__telegaioAdAction = action;
    } else {
      // Reward ad — async, proceed after completion
      showRewardAd(telegaioConfig!.rewardToken, telegaioConfig!.rewardAdBlockUuid, action);
    }
  }, [smartLinkConfig, telegaioConfig, showRewardAd]);

  const handleAdProceed = () => {
    recordAdSeen();
    const action = adBox?.action;
    setAdBox(null);
    setTimeout(() => action?.(), 50);
  };

  const doWatch = useCallback((episodeId?: number) => {
    const dest = episodeId ? `/app/stream/episode/${episodeId}` : `/app/stream/movie/${movieId}`;
    triggerAction("watch", () => setLocation(dest));
  }, [movieId, setLocation, triggerAction]);

  const doDownload = useCallback((episode?: Episode) => {
    const action = () => {
      fetch(`/api/movies/${movieId}/download`, { method: "POST" }).catch(() => {});
      const hasStreamUrl = episode ? !!episode.streamUrl : !!movie?.streamUrl;
      if (hasStreamUrl) {
        const resourceId = episode ? episode.id : movieId;
        const resourceType = episode ? "episode" : "movie";
        const safeTitle = (movie?.title || "download").replace(/[^a-z0-9_\-\s]/gi, "_");
        const a = document.createElement("a");
        a.href = `/api/stream/${resourceType}/${resourceId}?download=1`;
        a.download = `${safeTitle}.mp4`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        const idToSend = episode ? `ep_${episode.id}` : movieId;
        const deepLink = `https://t.me/MultiverseMovies_Bot?start=${idToSend}`;
        if (tg) {
          try { tg.sendData(String(episode ? episode.id : movieId)); } catch {}
          tg.openTelegramLink(deepLink);
        } else {
          window.open(deepLink, "_blank");
        }
      }
    };
    triggerAction("download", action);
  }, [movieId, movie, triggerAction]);

  const getYouTubeId = (url: string) => {
    const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!movie) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center text-white p-6 text-center">
        <Film className="w-12 h-12 text-white/20 mb-4" />
        <h2 className="text-xl font-bold mb-2">Not Found</h2>
        <p className="text-white/40 text-sm mb-6">This content may have been removed.</p>
        <button className="px-6 py-3 bg-primary rounded-2xl text-white font-bold text-sm" onClick={() => setLocation("/app")}>
          Back to Home
        </button>
      </div>
    );
  }

  const poster = getPoster((movie as any).posterUrl || movie.posterPath, "w780");
  const customTrailerYouTubeId = movie.trailerUrl ? getYouTubeId(movie.trailerUrl) : null;
  const isCustomTrailerDirect = !!movie.trailerUrl && !customTrailerYouTubeId;
  const hasTrailer = !!(movie.trailerUrl || trailer);

  const seasonNumbers = episodes ? [...new Set(episodes.map((e) => e.seasonNumber))].sort((a, b) => a - b) : [];
  const activeSeason = selectedSeason ?? seasonNumbers[0];
  const seasonEpisodes = (episodes || []).filter((e) => e.seasonNumber === activeSeason).sort((a, b) => a.episodeNumber - b.episodeNumber);

  const genres = movie.genre ? movie.genre.split(",").map(g => g.trim()).filter(Boolean).slice(0, 3) : [];

  return (
    <div className="min-h-screen pb-24" style={{ background: "#080808" }}>

      {/* ── Hero Poster ── */}
      <div className="relative w-full overflow-hidden" style={{ minHeight: "65vw", maxHeight: "72vh" }}>
        {poster ? (
          <img
            src={poster}
            alt={movie.title}
            className="w-full h-full object-cover"
            style={{ minHeight: "65vw", maxHeight: "72vh" }}
            loading="eager"
          />
        ) : (
          <div className="w-full flex items-center justify-center bg-gray-900" style={{ minHeight: "65vw", maxHeight: "72vh" }}>
            <Film className="w-24 h-24 text-white/10" />
          </div>
        )}

        {/* Multi-layer gradient */}
        <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, transparent 30%, transparent 55%, rgba(8,8,8,0.9) 80%, #080808 100%)" }} />
        <div className="absolute inset-0" style={{ background: "linear-gradient(to right, rgba(0,0,0,0.3) 0%, transparent 50%)" }} />

        {/* Back */}
        <button
          onClick={() => setLocation("/app")}
          data-testid="button-back"
          className="absolute top-4 left-4 z-20 flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold text-white/80 active:scale-95 transition-all"
          style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.1)" }}
        >
          <ChevronLeft className="w-4 h-4" /> Back
        </button>

        {/* Quality badge */}
        {movie.quality && (
          <div className="absolute top-4 right-4 z-20 rounded-full px-3 py-1 text-[10px] font-black text-white uppercase tracking-widest" style={{ background: "rgba(220,38,38,0.85)", backdropFilter: "blur(8px)" }}>
            {movie.quality}
          </div>
        )}

        {/* Title overlaid at bottom of poster */}
        <div className="absolute bottom-0 left-0 right-0 z-10 px-5 pb-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex items-center gap-1.5 rounded-full px-2.5 py-1" style={{ background: "rgba(220,38,38,0.15)", border: "1px solid rgba(220,38,38,0.3)" }}>
              <Sparkles className="w-3 h-3 text-red-400" />
              <span className="text-[9px] font-black text-red-300 uppercase tracking-widest">Verified Premium</span>
            </div>
          </div>
          <h1 className="text-3xl font-black text-white leading-tight mb-2 drop-shadow-2xl">{movie.title}</h1>
          <div className="flex items-center gap-3 text-xs font-bold text-white/50 flex-wrap">
            {movie.releaseDate && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {movie.releaseDate.slice(0, 4)}
              </span>
            )}
            {movie.rating && movie.rating > 0 ? (
              <>
                <span className="w-1 h-1 rounded-full bg-white/20" />
                <span className="flex items-center gap-1 text-yellow-400">
                  <Star className="w-3.5 h-3.5 fill-current" />
                  {(movie.rating / 10).toFixed(1)}
                </span>
              </>
            ) : null}
            <span className="w-1 h-1 rounded-full bg-white/20" />
            <span className="capitalize text-primary/70">{movie.type}</span>
          </div>
        </div>
      </div>

      {/* ── Genre chips + Watchlist button ── */}
      <div className="flex items-center justify-between gap-2 px-5 pt-4">
        <div className="flex gap-2 flex-wrap">
          {genres.map((g) => (
            <span key={g} className="rounded-full px-3 py-1 text-[10px] font-bold text-white/50 uppercase tracking-wider" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>
              {g}
            </span>
          ))}
        </div>
        <motion.button
          whileTap={{ scale: 0.88 }}
          data-testid="button-watchlist"
          onClick={() => {
            const next = toggleWatchlist(movieId);
            setFavorited(next);
          }}
          className="flex-shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold transition-all"
          style={{
            background: favorited ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.06)",
            border: favorited ? "1px solid rgba(239,68,68,0.4)" : "1px solid rgba(255,255,255,0.08)",
            color: favorited ? "#f87171" : "rgba(255,255,255,0.4)",
          }}
        >
          <Heart className={`w-3.5 h-3.5 transition-all ${favorited ? "fill-red-400 text-red-400" : ""}`} />
          {favorited ? "Saved" : "Save"}
        </motion.button>
      </div>

      {/* ── 320x50 Banner Ad (above Watch Now) ── */}
      {bannerAdConfig?.enabled && bannerAdConfig?.code && (
        <div className="flex justify-center px-5 pt-4">
          <div
            className="overflow-hidden rounded-lg"
            style={{ width: "320px", height: "50px", background: "transparent" }}
            data-testid="banner-ad"
          >
            <iframe
              srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>*{margin:0;padding:0;overflow:hidden}</style></head><body>${bannerAdConfig.code}</body></html>`}
              width="320"
              height="50"
              className="border-0"
              title="Advertisement"
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-popups-to-escape-sandbox"
              scrolling="no"
            />
          </div>
        </div>
      )}

      {/* ── Telega.io Banner Ad ── */}
      {telegaioConfig?.enabled && telegaioConfig?.script && (
        <div className="px-5 pt-4" data-testid="telegaio-banner-ad">
          <TelegaioAdBanner script={telegaioConfig.script} />
        </div>
      )}

      {/* ── Action Buttons for Movies ── */}
      {movie.type === "movie" && (
        <div className="px-5 pt-4 flex flex-col gap-3">
          <motion.button
            whileTap={{ scale: 0.97 }}
            data-testid="button-watch"
            onClick={() => doWatch()}
            className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl font-black text-base text-white relative overflow-hidden"
            style={{ background: "linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)", boxShadow: "0 8px 32px rgba(220,38,38,0.4)" }}
          >
            <div className="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity" style={{ background: "rgba(255,255,255,0.05)" }} />
            <Play className="w-5 h-5 fill-white" />
            Watch Now
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.97 }}
            data-testid="button-download"
            onClick={() => doDownload()}
            className="w-full flex items-center justify-center gap-3 py-3.5 rounded-2xl font-bold text-sm text-white/70"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <Download className="w-4.5 h-4.5" />
            Download
          </motion.button>
        </div>
      )}

      {/* ── Trailer ── */}
      {hasTrailer && (
        <div className="px-5 pt-4">
          {showTrailer ? (
            <div className="relative w-full rounded-2xl overflow-hidden aspect-video bg-black border border-white/10">
              {isCustomTrailerDirect ? (
                <video className="w-full h-full" src={movie.trailerUrl!} autoPlay controls playsInline />
              ) : (
                <iframe
                  className="w-full h-full border-0"
                  src={`https://www.youtube.com/embed/${customTrailerYouTubeId || trailer?.key}?autoplay=1&rel=0`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  title={movie.title}
                />
              )}
              <button onClick={() => setShowTrailer(false)} className="absolute top-2 right-2 w-8 h-8 bg-black/70 rounded-full flex items-center justify-center">
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowTrailer(true)}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-white/50 text-sm font-bold active:scale-95 transition-all"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              <Play className="w-4 h-4 text-red-500 fill-red-500" />
              Watch Trailer
            </button>
          )}
        </div>
      )}

      {/* ── Overview ── */}
      {movie.overview && (
        <div className="px-5 pt-6">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-0.5 h-4 rounded-full bg-primary" />
            <span className="text-[10px] uppercase tracking-widest text-white/30 font-bold">Synopsis</span>
          </div>
          <p className="text-sm text-white/50 leading-relaxed">{movie.overview}</p>
        </div>
      )}

      {/* ── Stats row ── */}
      <div className="px-5 pt-6">
        <div className="flex gap-3">
          {movie.views != null && (
            <div className="flex-1 rounded-2xl p-3 text-center" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="text-lg font-black text-white">{(movie.views || 0).toLocaleString()}</div>
              <div className="text-[9px] text-white/30 font-bold uppercase tracking-widest mt-0.5">Views</div>
            </div>
          )}
          {movie.downloads != null && (
            <div className="flex-1 rounded-2xl p-3 text-center" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="text-lg font-black text-white">{(movie.downloads || 0).toLocaleString()}</div>
              <div className="text-[9px] text-white/30 font-bold uppercase tracking-widest mt-0.5">Downloads</div>
            </div>
          )}
          {movie.fileSize && (
            <div className="flex-1 rounded-2xl p-3 text-center" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="text-sm font-black text-white flex items-center justify-center gap-1">
                <Database className="w-3.5 h-3.5 text-primary/60" />
                {movie.fileSize >= 1073741824 ? (movie.fileSize / 1073741824).toFixed(1) + " GB" : (movie.fileSize / 1048576).toFixed(0) + " MB"}
              </div>
              <div className="text-[9px] text-white/30 font-bold uppercase tracking-widest mt-0.5">Size</div>
            </div>
          )}
          <div className="flex-1 rounded-2xl p-3 text-center" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="text-sm font-black text-white flex items-center justify-center gap-1">
              <Shield className="w-3.5 h-3.5 text-green-500/60" />
              Secure
            </div>
            <div className="text-[9px] text-white/30 font-bold uppercase tracking-widest mt-0.5">Source</div>
          </div>
        </div>
      </div>

      {/* ── Series Episodes ── */}
      {movie.type === "series" && episodes && episodes.length > 0 && (
        <div className="px-5 pt-8">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-0.5 h-4 rounded-full bg-primary" />
            <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40 flex items-center gap-2">
              <Tv className="w-3.5 h-3.5 text-primary" /> Seasons & Episodes
            </h2>
          </div>

          {seasonNumbers.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1 mb-5" style={{ scrollbarWidth: "none" }}>
              {seasonNumbers.map((s) => (
                <button
                  key={s}
                  onClick={() => setSelectedSeason(s)}
                  data-testid={`season-tab-${s}`}
                  className="flex-shrink-0 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                  style={
                    activeSeason === s
                      ? { background: "linear-gradient(135deg, #ef4444, #b91c1c)", color: "white", boxShadow: "0 4px 16px rgba(220,38,38,0.35)" }
                      : { background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.08)" }
                  }
                >
                  Season {s}
                </button>
              ))}
            </div>
          )}

          <div className="text-[9px] text-white/25 font-black uppercase tracking-widest mb-3">
            {seasonEpisodes.length} Episode{seasonEpisodes.length !== 1 ? "s" : ""}
          </div>

          <div className="space-y-3">
            {seasonEpisodes.map((ep) => (
              <div
                key={ep.id}
                className="rounded-2xl p-4"
                data-testid={`episode-card-${ep.id}`}
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.2)" }}>
                    <span className="text-[10px] font-black text-primary">{ep.episodeNumber}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm text-white/85 line-clamp-1">{ep.title || `Episode ${ep.episodeNumber}`}</div>
                    {ep.airDate && <div className="text-[9px] text-white/25 mt-0.5">{ep.airDate}</div>}
                    {ep.overview && <p className="text-[10px] text-white/25 line-clamp-2 mt-1 leading-relaxed">{ep.overview}</p>}
                  </div>
                  {ep.rating ? (
                    <div className="flex-shrink-0 flex items-center gap-1 text-[9px] text-yellow-500 font-bold">
                      <Star className="w-2.5 h-2.5 fill-current" />
                      {(ep.rating / 10).toFixed(1)}
                    </div>
                  ) : null}
                </div>
                <div className="flex gap-2 pl-11">
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => doWatch(ep.id)}
                    data-testid={`button-watch-ep-${ep.id}`}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-white text-[11px] font-black"
                    style={{ background: "linear-gradient(135deg, #ef4444, #b91c1c)", boxShadow: "0 4px 12px rgba(220,38,38,0.3)" }}
                  >
                    <Play className="w-3.5 h-3.5 fill-white" /> Watch
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => doDownload(ep)}
                    data-testid={`button-download-ep-${ep.id}`}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-white/60 text-[11px] font-bold"
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                  >
                    <Download className="w-3.5 h-3.5" /> Download
                  </motion.button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Cast ── */}
      {movie.cast && Array.isArray(movie.cast) && movie.cast.length > 0 && (
        <div className="pt-8">
          <div className="flex items-center gap-2 mb-4 px-5">
            <div className="w-0.5 h-4 rounded-full bg-primary" />
            <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40 flex items-center gap-2">
              <User className="w-3.5 h-3.5 text-primary" /> Cast
            </h2>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 px-5" style={{ scrollbarWidth: "none" }}>
            {(movie.cast as any[]).slice(0, 10).map((actor, idx) => (
              <button
                key={idx}
                onClick={() => setLocation(`/app/browse?actor=${encodeURIComponent(actor.name)}&sort=rating`)}
                className="flex-shrink-0 w-24 text-left active:scale-95 transition-transform"
                data-testid={`cast-card-${idx}`}
              >
                <div className="w-24 h-32 rounded-2xl overflow-hidden mb-2 border border-white/8">
                  {actor.profilePath ? (
                    <img src={`https://image.tmdb.org/t/p/w185${actor.profilePath}`} alt={actor.name} className="w-full h-full object-cover object-top" />
                  ) : (
                    <div className="w-full h-full bg-white/5 flex items-center justify-center"><User className="w-8 h-8 text-white/20" /></div>
                  )}
                </div>
                <div className="text-[9px] font-bold text-white/70 truncate">{actor.name}</div>
                <div className="text-[8px] text-primary/60 truncate italic">{actor.character}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Recommended ── */}
      {recommendedMovies.length > 0 && (
        <div className="pt-8">
          <div className="flex items-center justify-between px-5 mb-4">
            <div className="flex items-center gap-2">
              <div className="w-0.5 h-4 rounded-full bg-primary" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-yellow-400" /> You May Also Like
              </span>
            </div>
            <button onClick={() => setLocation(`/app/browse?type=${movie.type}&sort=rating`)} className="flex items-center gap-1 text-[10px] text-primary font-bold active:scale-95 transition-all">
              All <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="flex gap-3 overflow-x-auto px-5 pb-2" style={{ scrollbarWidth: "none" }}>
            {recommendedMovies.map((rec) => {
              const recPoster = rec.posterPath
                ? rec.posterPath.startsWith("http") ? rec.posterPath : `https://image.tmdb.org/t/p/w342${rec.posterPath}`
                : null;
              return (
                <button key={rec.id} onClick={() => setLocation(`/app/movie/${rec.id}`)} className="flex-shrink-0 w-24 text-left" data-testid={`card-recommended-${rec.id}`}>
                  <div className="relative w-24 h-36 rounded-xl overflow-hidden mb-1.5 border border-white/5">
                    {recPoster ? (
                      <img src={recPoster} alt={rec.title} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full bg-white/5 flex items-center justify-center">
                        {rec.type === "series" ? <Tv className="w-6 h-6 text-white/20" /> : <Film className="w-6 h-6 text-white/20" />}
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                    {rec.rating && rec.rating > 0 && (
                      <div className="absolute top-1 right-1 bg-black/70 rounded px-1 py-0.5 flex items-center gap-0.5">
                        <Star className="w-2 h-2 text-yellow-400 fill-yellow-400" />
                        <span className="text-[8px] font-bold text-white">{(rec.rating / 10).toFixed(1)}</span>
                      </div>
                    )}
                  </div>
                  <p className="text-[9px] text-white/70 font-semibold truncate">{rec.title}</p>
                  {rec.releaseDate && <p className="text-[8px] text-white/30">{rec.releaseDate.slice(0, 4)}</p>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Back */}
      <div className="px-5 pt-8">
        <button
          onClick={() => setLocation("/app")}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-white/40 text-sm font-bold active:scale-95 transition-all"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
          data-testid="button-back-bottom"
        >
          <ChevronLeft className="w-4 h-4" /> Back to Home
        </button>
      </div>

      {/* ── Smart Link Ad Box ── */}
      {adBox && (
        <SmartLinkAdBox
          smartLinkUrl={smartLinkConfig?.url || ""}
          countdown={smartLinkConfig?.countdown ?? 5}
          mode={adBox.mode}
          onProceed={handleAdProceed}
          onClose={() => setAdBox(null)}
        />
      )}

      {/* ── Telega.io Fullscreen Interstitial ── */}
      {showTelegaioFs && telegaioConfig?.script && (
        <TelegaioFullscreenAd
          script={telegaioConfig.script}
          onClose={() => {
            setShowTelegaioFs(false);
            const pendingAction = (window as any).__telegaioAdAction;
            if (pendingAction) {
              (window as any).__telegaioAdAction = null;
              setTimeout(pendingAction, 50);
            }
          }}
        />
      )}
    </div>
  );
}
