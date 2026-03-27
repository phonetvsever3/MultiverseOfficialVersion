import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Play, Star, Film, Tv, Flame, Eye, ChevronRight, Shield, Trophy, History, HeadphonesIcon, Crown, Zap, Wand2, Heart, Music } from "lucide-react";
import { type Movie } from "@shared/schema";
import { FullScreenInterstitialAd } from "@/components/FullScreenInterstitialAd";
import { FloatingFileMascot, AnimatedMovieIcon, AnimatedSeriesIcon } from "@/components/FloatingFileMascot";
import { fullscreenAdShownFor } from "@/lib/ad-session";
import SplashScreen, { splashShownToday, markSplashShown } from "@/components/SplashScreen";
import { getWatchHistoryIds } from "@/lib/watch-history";

// Module-level flag: persists through SPA back/forward navigation, resets on full page reload
let splashShownThisSession = false;

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
}

function getPoster(path: string | null | undefined, size = "w342") {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `${TMDB_IMAGE}${size}${path}`;
}

function MovieCard({ movie, onClick }: { movie: Movie; onClick: () => void }) {
  const poster = getPoster(movie.posterPath);
  return (
    <motion.div
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className="flex-shrink-0 w-28 cursor-pointer"
    >
      <div className="relative w-28 h-40 rounded-2xl overflow-hidden bg-white/5 border border-white/5 mb-2 shadow-xl">
        {poster ? (
          <img src={poster} alt={movie.title} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {movie.type === 'series' ? <AnimatedSeriesIcon /> : <AnimatedMovieIcon />}
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
        {movie.rating && movie.rating > 0 ? (
          <div className="absolute top-2 right-2 bg-black/70 backdrop-blur-sm rounded-lg px-1.5 py-0.5 flex items-center gap-1">
            <Star className="w-2.5 h-2.5 text-yellow-400 fill-yellow-400" />
            <span className="text-[9px] font-bold text-white">{(movie.rating / 10).toFixed(1)}</span>
          </div>
        ) : null}
        <div className="absolute bottom-2 left-2 right-2">
          {movie.quality && (
            <span className="text-[8px] bg-primary/80 text-white rounded px-1.5 py-0.5 font-bold uppercase">{movie.quality}</span>
          )}
        </div>
      </div>
      <p className="text-[10px] text-white/70 font-semibold truncate px-0.5 leading-tight">{movie.title}</p>
      {movie.releaseDate && (
        <p className="text-[9px] text-white/30 px-0.5">{movie.releaseDate.slice(0, 4)}</p>
      )}
    </motion.div>
  );
}

function Section({
  title,
  icon,
  items,
  onMovieClick,
  onSeeMore,
}: {
  title: string;
  icon: React.ReactNode;
  items: Movie[];
  onMovieClick: (id: number) => void;
  onSeeMore?: () => void;
}) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between px-4 mb-3">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-sm font-black text-white uppercase tracking-wider">{title}</h2>
        </div>
        {onSeeMore && (
          <button
            onClick={onSeeMore}
            className="flex items-center gap-1 text-[10px] text-primary font-bold hover:text-primary/80 active:scale-95 transition-all"
          >
            See More <ChevronRight className="w-3 h-3" />
          </button>
        )}
      </div>
      <div className="flex gap-3 overflow-x-auto px-4 pb-2 scrollbar-hide" style={{ scrollbarWidth: 'none' }}>
        {items.map((movie) => (
          <MovieCard key={movie.id} movie={movie} onClick={() => onMovieClick(movie.id)} />
        ))}
      </div>
    </div>
  );
}

function PremiumCard({ movie, onClick }: { movie: Movie; onClick: () => void }) {
  const poster = getPoster(movie.posterPath, "w500");
  return (
    <motion.div
      whileTap={{ scale: 0.96 }}
      onClick={onClick}
      className="flex-shrink-0 w-40 cursor-pointer"
    >
      <div className="relative w-40 h-56 rounded-2xl overflow-hidden bg-white/5 border border-white/10 mb-2 shadow-xl">
        {poster ? (
          <img src={poster} alt={movie.title} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {movie.type === 'series' ? <AnimatedSeriesIcon /> : <AnimatedMovieIcon />}
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
        <div className="absolute top-2 left-2">
          <div className="flex items-center gap-1 bg-black/60 backdrop-blur-sm rounded-lg px-1.5 py-0.5">
            <Crown className="w-2.5 h-2.5 text-yellow-400" />
            <span className="text-[8px] font-bold text-yellow-300 uppercase">{movie.type === 'series' ? 'Series' : 'Movie'}</span>
          </div>
        </div>
        {movie.rating && movie.rating > 0 ? (
          <div className="absolute top-2 right-2 bg-black/70 backdrop-blur-sm rounded-lg px-1.5 py-0.5 flex items-center gap-1">
            <Star className="w-2.5 h-2.5 text-yellow-400 fill-yellow-400" />
            <span className="text-[9px] font-bold text-white">{(movie.rating / 10).toFixed(1)}</span>
          </div>
        ) : null}
        <div className="absolute bottom-0 left-0 right-0 p-2.5">
          {movie.quality && (
            <span className="text-[8px] bg-primary/90 text-white rounded-md px-1.5 py-0.5 font-bold uppercase">{movie.quality}</span>
          )}
          <p className="text-[11px] text-white font-bold mt-1 leading-tight line-clamp-2">{movie.title}</p>
          {movie.releaseDate && (
            <p className="text-[9px] text-white/40 mt-0.5">{movie.releaseDate.slice(0, 4)}</p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function PremiumSection({
  title,
  icon,
  badge,
  items,
  onMovieClick,
  onSeeMore,
  accentFrom,
  accentTo,
  borderColor,
}: {
  title: string;
  icon: React.ReactNode;
  badge?: string;
  items: Movie[];
  onMovieClick: (id: number) => void;
  onSeeMore?: () => void;
  accentFrom: string;
  accentTo: string;
  borderColor: string;
}) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mb-8">
      <div className={`mx-4 mb-3 rounded-2xl bg-gradient-to-r ${accentFrom} ${accentTo} border ${borderColor} px-4 py-3 flex items-center justify-between`}>
        <div className="flex items-center gap-2.5">
          {icon}
          <div>
            <h2 className="text-sm font-black text-white uppercase tracking-wider leading-none">{title}</h2>
            {badge && <p className="text-[9px] text-white/40 mt-0.5">{badge}</p>}
          </div>
        </div>
        {onSeeMore && (
          <button
            onClick={onSeeMore}
            className="flex items-center gap-1 text-[10px] text-white/60 font-bold active:scale-95 transition-all"
          >
            All <ChevronRight className="w-3 h-3" />
          </button>
        )}
      </div>
      <div className="flex gap-3 overflow-x-auto px-4 pb-2 scrollbar-hide" style={{ scrollbarWidth: 'none' }}>
        {items.map((movie) => (
          <PremiumCard key={movie.id} movie={movie} onClick={() => onMovieClick(movie.id)} />
        ))}
      </div>
    </div>
  );
}

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
  // Show splash only once per session (survives back navigation, resets on full reload)
  const [splash, setSplash] = useState(!splashShownThisSession);
  const [splashResolved, setSplashResolved] = useState(splashShownThisSession);

  useEffect(() => {
    // Already shown this session — skip the network call entirely
    if (splashShownThisSession) return;

    fetch("/api/splash/config")
      .then((r) => r.json())
      .then((cfg: { alwaysShow: boolean; hasVideo: boolean }) => {
        if (cfg.alwaysShow || !splashShownToday()) {
          setSplash(true);
        } else {
          setSplash(false);
        }
        setSplashResolved(true);
      })
      .catch(() => {
        setSplash(!splashShownToday());
        setSplashResolved(true);
      });
  }, []);

  const handleSplashDone = () => {
    splashShownThisSession = true;
    markSplashShown();
    setSplash(false);
  };

  const { data: sections, isLoading } = useQuery<HomeSections>({
    queryKey: ["/api/home/sections"],
  });

  // Watch history — read IDs from localStorage, fetch movie data
  const historyIds = getWatchHistoryIds();
  const { data: watchHistoryMovies = [] } = useQuery<Movie[]>({
    queryKey: ["/api/movies/by-ids", historyIds.join(",")],
    queryFn: async () => {
      if (historyIds.length === 0) return [];
      const res = await fetch(`/api/movies/by-ids?ids=${historyIds.join(",")}`);
      if (!res.ok) return [];
      const data: Movie[] = await res.json();
      // preserve order from localStorage
      return historyIds.map(id => data.find(m => m.id === id)).filter(Boolean) as Movie[];
    },
    enabled: historyIds.length > 0,
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

  // Wait for splash config to resolve before showing anything
  if (!splashResolved) {
    return <div className="fixed inset-0 bg-black z-[9999]" />;
  }

  if (splash) {
    return <SplashScreen onDone={handleSplashDone} />;
  }

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

            {/* Latest Uploads */}
            <PremiumSection
              title="Latest Uploads"
              icon={<Flame className="w-5 h-5 text-orange-300" />}
              badge="Freshly added content"
              accentFrom="from-orange-950/60"
              accentTo="to-amber-900/20"
              borderColor="border-orange-500/20"
              items={sections?.latest || []}
              onMovieClick={handleMovieClick}
              onSeeMore={() => setLocation('/app/browse?sort=latest&title=Latest+Uploads')}
            />

            {/* New Movies */}
            <PremiumSection
              title="New Movies"
              icon={<Film className="w-5 h-5 text-blue-300" />}
              badge="Latest movie releases"
              accentFrom="from-blue-950/60"
              accentTo="to-blue-900/20"
              borderColor="border-blue-500/20"
              items={sections?.newMovies || []}
              onMovieClick={handleMovieClick}
              onSeeMore={() => setLocation('/app/browse?type=movie&sort=latest&title=New+Movies')}
            />

            {/* New Series */}
            <PremiumSection
              title="New Series"
              icon={<Tv className="w-5 h-5 text-purple-300" />}
              badge="Latest series releases"
              accentFrom="from-purple-950/60"
              accentTo="to-purple-900/20"
              borderColor="border-purple-500/20"
              items={sections?.newSeries || []}
              onMovieClick={handleMovieClick}
              onSeeMore={() => setLocation('/app/browse?type=series&sort=latest&title=New+Series')}
            />

            {/* Action */}
            {(sections?.action?.length ?? 0) > 0 && (
              <PremiumSection
                title="Action"
                icon={<Zap className="w-5 h-5 text-orange-300" />}
                badge="High-octane action hits"
                accentFrom="from-orange-950/60"
                accentTo="to-red-900/20"
                borderColor="border-orange-500/20"
                items={sections?.action || []}
                onMovieClick={handleMovieClick}
                onSeeMore={() => setLocation('/app/browse?search=action&sort=rating&title=Action')}
              />
            )}

            {/* Animation */}
            {(sections?.animation?.length ?? 0) > 0 && (
              <PremiumSection
                title="Animation"
                icon={<Wand2 className="w-5 h-5 text-sky-300" />}
                badge="Animated movies & series"
                accentFrom="from-sky-950/60"
                accentTo="to-cyan-900/20"
                borderColor="border-sky-500/20"
                items={sections?.animation || []}
                onMovieClick={handleMovieClick}
                onSeeMore={() => setLocation('/app/browse?search=animation&sort=rating&title=Animation')}
              />
            )}

            {/* K-Drama */}
            {(sections?.kdrama?.length ?? 0) > 0 && (
              <PremiumSection
                title="K-Drama"
                icon={<Heart className="w-5 h-5 text-rose-300" />}
                badge="Best Korean dramas"
                accentFrom="from-rose-950/60"
                accentTo="to-pink-900/20"
                borderColor="border-rose-500/20"
                items={sections?.kdrama || []}
                onMovieClick={handleMovieClick}
                onSeeMore={() => setLocation('/app/browse?lang=ko&sort=rating&title=K-Drama')}
              />
            )}

            {/* Bollywood */}
            {(sections?.bollywood?.length ?? 0) > 0 && (
              <PremiumSection
                title="Bollywood"
                icon={<Music className="w-5 h-5 text-amber-300" />}
                badge="Top Bollywood hits"
                accentFrom="from-amber-950/60"
                accentTo="to-yellow-900/20"
                borderColor="border-amber-500/20"
                items={sections?.bollywood || []}
                onMovieClick={handleMovieClick}
                onSeeMore={() => setLocation('/app/browse?lang=hi&sort=rating&title=Bollywood')}
              />
            )}

            {/* Top Movies */}
            <PremiumSection
              title="Top Movies"
              icon={<Film className="w-5 h-5 text-blue-300" />}
              badge="Highest rated movies"
              accentFrom="from-blue-950/60"
              accentTo="to-indigo-900/20"
              borderColor="border-blue-500/20"
              items={sections?.topMovies || []}
              onMovieClick={handleMovieClick}
              onSeeMore={() => setLocation('/app/browse?type=movie&sort=rating&title=Top+Movies')}
            />

            {/* Top Series */}
            <PremiumSection
              title="Top Series"
              icon={<Tv className="w-5 h-5 text-purple-300" />}
              badge="Highest rated series"
              accentFrom="from-purple-950/60"
              accentTo="to-violet-900/20"
              borderColor="border-purple-500/20"
              items={sections?.topSeries || []}
              onMovieClick={handleMovieClick}
              onSeeMore={() => setLocation('/app/browse?type=series&sort=rating&title=Top+Series')}
            />

            {/* Most Viewed */}
            <PremiumSection
              title="Most Viewed"
              icon={<Eye className="w-5 h-5 text-green-300" />}
              badge="Most popular right now"
              accentFrom="from-green-950/60"
              accentTo="to-emerald-900/20"
              borderColor="border-green-500/20"
              items={sections?.bestView || []}
              onMovieClick={handleMovieClick}
              onSeeMore={() => setLocation('/app/browse?sort=views&title=Most+Viewed')}
            />

            {/* Continue Watching */}
            {watchHistoryMovies.length > 0 && (
              <PremiumSection
                title="Continue Watching"
                icon={<History className="w-5 h-5 text-cyan-300" />}
                badge="Pick up where you left off"
                accentFrom="from-cyan-950/60"
                accentTo="to-teal-900/20"
                borderColor="border-cyan-500/20"
                items={watchHistoryMovies}
                onMovieClick={handleMovieClick}
              />
            )}

            {/* Football Category */}
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

            {/* Adult Category */}
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
