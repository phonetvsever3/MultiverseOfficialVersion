import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Play, Star, Film, Tv, Flame, Eye, ChevronRight, Shield, Trophy, History, HeadphonesIcon, Crown, Zap, Wand2, Heart, Music, Ghost, Rocket, TrendingUp, CalendarDays, Lock, Clapperboard, Laugh, Sparkles } from "lucide-react";
import { type Movie } from "@shared/schema";
import { FullScreenInterstitialAd } from "@/components/FullScreenInterstitialAd";
import { FloatingFileMascot, AnimatedMovieIcon, AnimatedSeriesIcon } from "@/components/FloatingFileMascot";
import { fullscreenAdShownFor } from "@/lib/ad-session";
import { getWatchHistoryIds, getWatchHistory } from "@/lib/watch-history";
import { getWatchlistIds } from "@/lib/watchlist";

const tg = (window as any).Telegram?.WebApp;
const TMDB_IMAGE = "https://image.tmdb.org/t/p/";

interface HomeSections {
  latest: Movie[];
  topMovies: Movie[];
  topSeries: Movie[];
  bestView: Movie[];
  bollywood: Movie[];
  kdrama: Movie[];
  recommended: Movie[];
  newMovies: Movie[];
  newSeries: Movie[];
  action: Movie[];
  animation: Movie[];
  horror: Movie[];
  scifi: Movie[];
  todayTrending: Movie[];
  weeklyTrending: Movie[];
  adult: Movie[];
  drama: Movie[];
  comedy: Movie[];
  romance: Movie[];
}

function getPoster(path: string | null | undefined, size = "w342") {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `${TMDB_IMAGE}${size}${path}`;
}

// ── Cinema Card: redesigned poster card for all genre/section rows ─────────
function CinemaCard({ movie, onClick, rank, progressPct }: { movie: Movie; onClick: () => void; rank?: number; progressPct?: number }) {
  const poster = getPoster(movie.posterPath, "w500");
  return (
    <motion.div
      whileTap={{ scale: 0.94 }}
      onClick={onClick}
      className="flex-shrink-0 w-36 cursor-pointer"
      data-testid={`card-movie-${movie.id}`}
    >
      <div className="relative w-36 h-52 rounded-2xl overflow-hidden mb-2 shadow-2xl"
        style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
        {poster ? (
          <img src={poster} alt={movie.title} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-white/5">
            {movie.type === 'series' ? <AnimatedSeriesIcon /> : <AnimatedMovieIcon />}
          </div>
        )}
        {/* gradient layers */}
        <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, transparent 40%, rgba(0,0,0,0.85) 100%)" }} />

        {/* rank badge */}
        {rank !== undefined && (
          <div className="absolute top-2 left-2 w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black text-white"
            style={{ background: "rgba(220,38,38,0.85)", backdropFilter: "blur(6px)" }}>
            {rank}
          </div>
        )}

        {/* type badge */}
        <div className="absolute top-2 right-2 flex items-center gap-1 rounded-md px-1.5 py-0.5"
          style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}>
          {movie.type === 'series'
            ? <Tv className="w-2.5 h-2.5 text-purple-400" />
            : <Film className="w-2.5 h-2.5 text-blue-400" />}
          <span className="text-[8px] font-bold text-white/80">{movie.type === 'series' ? 'S' : 'M'}</span>
        </div>

        {/* rating + quality bottom row */}
        <div className="absolute bottom-0 left-0 right-0 px-2 pb-2 flex items-end justify-between">
          {movie.quality && (
            <span className="text-[8px] font-black text-white px-1.5 py-0.5 rounded-md uppercase"
              style={{ background: "rgba(220,38,38,0.8)" }}>
              {movie.quality}
            </span>
          )}
          {movie.rating && movie.rating > 0 ? (
            <div className="flex items-center gap-0.5 ml-auto rounded-md px-1.5 py-0.5"
              style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)" }}>
              <Star className="w-2.5 h-2.5 text-yellow-400 fill-yellow-400" />
              <span className="text-[9px] font-bold text-white">{(movie.rating / 10).toFixed(1)}</span>
            </div>
          ) : null}
        </div>

        {/* Watch progress bar */}
        {progressPct !== undefined && progressPct > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10">
            <div className="h-full bg-red-500 rounded-full" style={{ width: `${Math.min(progressPct, 100)}%` }} />
          </div>
        )}
      </div>
      <p className="text-[11px] text-white/80 font-semibold truncate px-0.5 leading-tight">{movie.title}</p>
      {movie.releaseDate && (
        <p className="text-[9px] text-white/30 px-0.5 mt-0.5">{movie.releaseDate.slice(0, 4)}</p>
      )}
    </motion.div>
  );
}

// ── Genre Section: clean header + cinema card row ─────────────────────────
function GenreSection({
  title,
  icon,
  accent,
  items,
  onMovieClick,
  onSeeMore,
  showRank = false,
  progressMap,
}: {
  title: string;
  icon: React.ReactNode;
  accent: string;
  items: Movie[];
  onMovieClick: (id: number) => void;
  onSeeMore?: () => void;
  showRank?: boolean;
  progressMap?: Record<number, number>;
}) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mb-8">
      {/* Section header */}
      <div className="flex items-center justify-between px-4 mb-3">
        <div className="flex items-center gap-2.5">
          <div className={`w-1 h-5 rounded-full ${accent}`} />
          <div className="flex items-center gap-2">
            {icon}
            <h2 className="text-[13px] font-black text-white uppercase tracking-wider">{title}</h2>
          </div>
        </div>
        {onSeeMore && (
          <button
            onClick={onSeeMore}
            className="flex items-center gap-1 text-[10px] text-white/40 font-bold active:scale-95 transition-all hover:text-white/70"
          >
            See All <ChevronRight className="w-3 h-3" />
          </button>
        )}
      </div>
      {/* Cards row */}
      <div className="flex gap-3 overflow-x-auto px-4 pb-2" style={{ scrollbarWidth: 'none' }}>
        {items.map((movie, idx) => (
          <CinemaCard
            key={movie.id}
            movie={movie}
            onClick={() => onMovieClick(movie.id)}
            rank={showRank ? idx + 1 : undefined}
            progressPct={progressMap?.[movie.id]}
          />
        ))}
      </div>
    </div>
  );
}

// ── Hero Slider ────────────────────────────────────────────────────────────
function HeroSlider({ items, onMovieClick }: { items: Movie[]; onMovieClick: (id: number) => void }) {
  const [current, setCurrent] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (items.length <= 1) return;
    intervalRef.current = setInterval(() => {
      setCurrent((prev) => (prev + 1) % items.length);
    }, 4000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [items.length]);

  if (!items || items.length === 0) return null;
  const movie = items[current];
  const backdrop = movie.posterPath ? `${TMDB_IMAGE}w780${movie.posterPath}` : null;

  return (
    <div className="relative w-full h-64 mb-6 overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.div
          key={movie.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="absolute inset-0"
        >
          {backdrop ? (
            <img src={backdrop} alt={movie.title} className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-gray-900 to-black" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/60 to-transparent" />
        </motion.div>
      </AnimatePresence>

      <div className="absolute bottom-0 left-0 right-0 p-5">
        <AnimatePresence mode="wait">
          <motion.div
            key={movie.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[9px] uppercase tracking-widest text-primary font-black">{movie.type === 'series' ? 'Series' : 'Movie'}</span>
              {movie.genre && <span className="text-[9px] text-white/40">• {movie.genre.split(',')[0]}</span>}
            </div>
            <h1 className="text-lg font-black text-white leading-tight mb-2 max-w-[70%]">{movie.title}</h1>
            <div className="flex items-center gap-3">
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => onMovieClick(movie.id)}
                className="flex items-center gap-2 bg-primary px-5 py-2.5 rounded-xl font-bold text-xs text-white shadow-lg shadow-primary/30"
              >
                <Play className="w-3.5 h-3.5 fill-white" /> Watch Now
              </motion.button>
              {movie.rating && movie.rating > 0 ? (
                <div className="flex items-center gap-1 bg-white/10 backdrop-blur-sm px-3 py-2 rounded-xl">
                  <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                  <span className="text-[11px] font-bold text-white">{(movie.rating / 10).toFixed(1)}</span>
                </div>
              ) : null}
            </div>
          </motion.div>
        </AnimatePresence>

        {items.length > 1 && (
          <div className="flex gap-1 mt-3">
            {items.slice(0, 8).map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                className={`h-1 rounded-full transition-all duration-300 ${i === current ? 'w-6 bg-primary' : 'w-1.5 bg-white/20'}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  const [, setLocation] = useLocation();
  const [showAd, setShowAd] = useState(false);
  const [pendingMovieId, setPendingMovieId] = useState<number | null>(null);
  const [fsAd, setFsAd] = useState<any>(null);

  const { data: sections, isLoading } = useQuery<HomeSections>({
    queryKey: ["/api/home/sections"],
  });

  const historyIds = getWatchHistoryIds();
  const { data: watchHistoryMovies = [] } = useQuery<Movie[]>({
    queryKey: ["/api/movies/by-ids", historyIds.join(",")],
    queryFn: async () => {
      if (historyIds.length === 0) return [];
      const res = await fetch(`/api/movies/by-ids?ids=${historyIds.join(",")}`);
      if (!res.ok) return [];
      const data: Movie[] = await res.json();
      return historyIds.map(id => data.find(m => m.id === id)).filter(Boolean) as Movie[];
    },
    enabled: historyIds.length > 0,
  });

  // Build a map of movieId → progress percentage for "Continue Watching" progress bars
  const progressMap: Record<number, number> = {};
  for (const entry of getWatchHistory()) {
    if (entry.progress && entry.duration && entry.duration > 0) {
      progressMap[entry.movieId] = Math.round((entry.progress / entry.duration) * 100);
    }
  }

  // My List (watchlist)
  const watchlistIds = getWatchlistIds();
  const { data: watchlistMovies = [] } = useQuery<Movie[]>({
    queryKey: ["/api/movies/by-ids", "wl", watchlistIds.join(",")],
    queryFn: async () => {
      if (watchlistIds.length === 0) return [];
      const res = await fetch(`/api/movies/by-ids?ids=${watchlistIds.join(",")}`);
      if (!res.ok) return [];
      const data: Movie[] = await res.json();
      return watchlistIds.map(id => data.find(m => m.id === id)).filter(Boolean) as Movie[];
    },
    enabled: watchlistIds.length > 0,
  });

  useEffect(() => {
    if (tg) {
      tg.ready();
      tg.expand();
      tg.MainButton.hide();
    }
  }, []);

  const handleMovieClick = async (id: number) => {
    try {
      const res = await fetch("/api/ads/fullscreen");
      const ad = await res.json();
      if (ad) {
        setFsAd(ad);
        setPendingMovieId(id);
        setShowAd(true);
      } else {
        setLocation(`/app/movie/${id}`);
      }
    } catch {
      setLocation(`/app/movie/${id}`);
    }
  };

  const handleAdClose = () => {
    setShowAd(false);
    if (pendingMovieId !== null) {
      fullscreenAdShownFor.add(pendingMovieId);
      setLocation(`/app/movie/${pendingMovieId}`);
      setPendingMovieId(null);
    }
  };

  const allMovies = [
    ...(sections?.latest || []),
    ...(sections?.topMovies || []),
  ];
  const featuredItems = allMovies.filter((m, i, arr) => arr.findIndex(x => x.id === m.id) === i).slice(0, 8);

  return (
    <div className="min-h-screen bg-black pb-safe">
      {/* Top Bar */}
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 pt-safe pb-3 bg-gradient-to-b from-black to-transparent">
        <div>
          <h1 style={{ fontFamily: "'Orbitron', sans-serif" }} className="text-sm font-bold text-white tracking-widest uppercase">MULTIVERSE</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLocation('/app/support')}
            data-testid="button-support"
            className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center active:scale-95 transition-transform"
          >
            <HeadphonesIcon className="w-4 h-4 text-white" />
          </button>
          <button
            onClick={() => setLocation('/app/search')}
            data-testid="button-search"
            className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center active:scale-95 transition-transform"
          >
            <Search className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>

      <div className="pt-14">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <HeroSlider items={featuredItems} onMovieClick={handleMovieClick} />

            {/* Today Trending */}
            <GenreSection
              title="Today Trending"
              icon={<TrendingUp className="w-4 h-4 text-red-400" />}
              accent="bg-red-500"
              items={sections?.todayTrending || []}
              onMovieClick={handleMovieClick}
              showRank
            />

            {/* New Movies */}
            <GenreSection
              title="New Movies"
              icon={<Film className="w-4 h-4 text-blue-400" />}
              accent="bg-blue-500"
              items={sections?.newMovies || []}
              onMovieClick={handleMovieClick}
              onSeeMore={() => setLocation('/app/browse?type=movie&sort=latest&title=New+Movies')}
            />

            {/* New Series */}
            <GenreSection
              title="New Series"
              icon={<Tv className="w-4 h-4 text-purple-400" />}
              accent="bg-purple-500"
              items={sections?.newSeries || []}
              onMovieClick={handleMovieClick}
              onSeeMore={() => setLocation('/app/browse?type=series&sort=latest&title=New+Series')}
            />

            {/* Action */}
            {(sections?.action?.length ?? 0) > 0 && (
              <GenreSection
                title="Action"
                icon={<Zap className="w-4 h-4 text-orange-400" />}
                accent="bg-orange-500"
                items={sections?.action || []}
                onMovieClick={handleMovieClick}
                onSeeMore={() => setLocation('/app/browse?search=action&sort=rating&title=Action')}
              />
            )}

            {/* Horror */}
            {(sections?.horror?.length ?? 0) > 0 && (
              <GenreSection
                title="Horror"
                icon={<Ghost className="w-4 h-4 text-red-400" />}
                accent="bg-red-800"
                items={sections?.horror || []}
                onMovieClick={handleMovieClick}
                onSeeMore={() => setLocation('/app/browse?search=horror&sort=rating&title=Horror')}
              />
            )}

            {/* Drama */}
            {(sections?.drama?.length ?? 0) > 0 && (
              <GenreSection
                title="Drama"
                icon={<Clapperboard className="w-4 h-4 text-amber-400" />}
                accent="bg-amber-500"
                items={sections?.drama || []}
                onMovieClick={handleMovieClick}
                onSeeMore={() => setLocation('/app/browse?search=drama&sort=rating&title=Drama')}
              />
            )}

            {/* Comedy */}
            {(sections?.comedy?.length ?? 0) > 0 && (
              <GenreSection
                title="Comedy"
                icon={<Laugh className="w-4 h-4 text-yellow-400" />}
                accent="bg-yellow-500"
                items={sections?.comedy || []}
                onMovieClick={handleMovieClick}
                onSeeMore={() => setLocation('/app/browse?search=comedy&sort=rating&title=Comedy')}
              />
            )}

            {/* Romance */}
            {(sections?.romance?.length ?? 0) > 0 && (
              <GenreSection
                title="Romance"
                icon={<Heart className="w-4 h-4 text-pink-400" />}
                accent="bg-pink-500"
                items={sections?.romance || []}
                onMovieClick={handleMovieClick}
                onSeeMore={() => setLocation('/app/browse?search=romance&sort=rating&title=Romance')}
              />
            )}

            {/* Sci-Fi */}
            {(sections?.scifi?.length ?? 0) > 0 && (
              <GenreSection
                title="Sci-Fi"
                icon={<Rocket className="w-4 h-4 text-cyan-400" />}
                accent="bg-cyan-500"
                items={sections?.scifi || []}
                onMovieClick={handleMovieClick}
                onSeeMore={() => setLocation('/app/browse?search=sci-fi&sort=rating&title=Sci-Fi')}
              />
            )}

            {/* 18+ Adult */}
            {(sections?.adult?.length ?? 0) > 0 && (
              <GenreSection
                title="18+ Adult"
                icon={<Lock className="w-4 h-4 text-rose-400" />}
                accent="bg-rose-600"
                items={sections?.adult || []}
                onMovieClick={handleMovieClick}
                onSeeMore={() => setLocation('/app/browse?adult=1&title=18%2B+Adult')}
              />
            )}

            {/* Animation */}
            {(sections?.animation?.length ?? 0) > 0 && (
              <GenreSection
                title="Animation"
                icon={<Wand2 className="w-4 h-4 text-sky-400" />}
                accent="bg-sky-500"
                items={sections?.animation || []}
                onMovieClick={handleMovieClick}
                onSeeMore={() => setLocation('/app/browse?search=animation&sort=rating&title=Animation')}
              />
            )}

            {/* K-Drama */}
            {(sections?.kdrama?.length ?? 0) > 0 && (
              <GenreSection
                title="K-Drama"
                icon={<Sparkles className="w-4 h-4 text-rose-300" />}
                accent="bg-rose-400"
                items={sections?.kdrama || []}
                onMovieClick={handleMovieClick}
                onSeeMore={() => setLocation('/app/browse?lang=ko&sort=rating&title=K-Drama')}
              />
            )}

            {/* Bollywood */}
            {(sections?.bollywood?.length ?? 0) > 0 && (
              <GenreSection
                title="Bollywood"
                icon={<Music className="w-4 h-4 text-amber-400" />}
                accent="bg-amber-500"
                items={sections?.bollywood || []}
                onMovieClick={handleMovieClick}
                onSeeMore={() => setLocation('/app/browse?lang=hi&sort=rating&title=Bollywood')}
              />
            )}

            {/* Top Movies */}
            <GenreSection
              title="Top Movies"
              icon={<Crown className="w-4 h-4 text-yellow-400" />}
              accent="bg-yellow-500"
              items={sections?.topMovies || []}
              onMovieClick={handleMovieClick}
              onSeeMore={() => setLocation('/app/browse?type=movie&sort=rating&title=Top+Movies')}
              showRank
            />

            {/* Top Series */}
            <GenreSection
              title="Top Series"
              icon={<Crown className="w-4 h-4 text-violet-400" />}
              accent="bg-violet-500"
              items={sections?.topSeries || []}
              onMovieClick={handleMovieClick}
              onSeeMore={() => setLocation('/app/browse?type=series&sort=rating&title=Top+Series')}
              showRank
            />

            {/* Most Viewed */}
            <GenreSection
              title="Most Viewed"
              icon={<Eye className="w-4 h-4 text-green-400" />}
              accent="bg-green-500"
              items={sections?.bestView || []}
              onMovieClick={handleMovieClick}
              onSeeMore={() => setLocation('/app/browse?sort=views&title=Most+Viewed')}
            />

            {/* My List */}
            {watchlistMovies.length > 0 && (
              <GenreSection
                title="My List"
                icon={<Heart className="w-4 h-4 text-red-400" />}
                accent="bg-red-500"
                items={watchlistMovies}
                onMovieClick={handleMovieClick}
              />
            )}

            {/* Continue Watching */}
            {watchHistoryMovies.length > 0 && (
              <GenreSection
                title="Continue Watching"
                icon={<History className="w-4 h-4 text-cyan-400" />}
                accent="bg-cyan-500"
                items={watchHistoryMovies}
                onMovieClick={handleMovieClick}
                progressMap={progressMap}
              />
            )}

            {/* Football Category — unchanged */}
            <div className="px-4 mb-4">
              <button
                onClick={() => setLocation('/app/football')}
                className="w-full flex items-center justify-between p-4 rounded-2xl bg-gradient-to-r from-green-900/40 to-emerald-900/30 border border-green-500/20 active:scale-95 transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
                    <Trophy className="w-5 h-5 text-green-400" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-black text-white">Football Live</p>
                    <p className="text-[10px] text-green-400/70">Live Scores & Streams</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-green-400/60" />
              </button>
            </div>

            {/* Adult Category — unchanged */}
            <div className="px-4 mb-8">
              <button
                onClick={() => setLocation('/app/adult')}
                className="w-full flex items-center justify-between p-4 rounded-2xl bg-gradient-to-r from-pink-900/40 to-red-900/30 border border-pink-500/20 active:scale-95 transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-pink-500/20 flex items-center justify-center">
                    <Shield className="w-5 h-5 text-pink-400" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-black text-white">Adult Category</p>
                    <p className="text-[10px] text-pink-400/70">18+ Content • Age Verified</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-pink-400/60" />
              </button>
            </div>

            {(!sections || Object.values(sections).every(arr => arr.length === 0)) && (
              <div className="flex flex-col items-center justify-center py-24 text-center px-8">
                <Film className="w-16 h-16 text-white/10 mb-4" />
                <p className="text-white/30 text-sm">No content yet. Add movies via admin panel.</p>
              </div>
            )}
          </>
        )}
      </div>

      {showAd && <FullScreenInterstitialAd ad={fsAd} onClose={handleAdClose} />}

      <FloatingFileMascot />
    </div>
  );
}
