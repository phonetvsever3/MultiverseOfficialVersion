import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowLeft, Search as SearchIcon, Film, Tv, Star, X } from "lucide-react";
import { type Movie } from "@shared/schema";
import { FullScreenInterstitialAd } from "@/components/FullScreenInterstitialAd";
import { fullscreenAdShownFor } from "@/lib/ad-session";

const TMDB_IMAGE = "https://image.tmdb.org/t/p/w185";

function getPoster(path: string | null | undefined) {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `${TMDB_IMAGE}${path}`;
}

export default function SearchPage() {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [showAd, setShowAd] = useState(false);
  const [pendingMovieId, setPendingMovieId] = useState<number | null>(null);
  const [fsAd, setFsAd] = useState<any>(null);
  const [activeFilter, setActiveFilter] = useState<"all" | "movie" | "series">("all");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 400);
    return () => clearTimeout(t);
  }, [query]);

  const { data, isLoading } = useQuery<{ items: Movie[]; total: number }>({
    queryKey: [`/api/movies?search=${debouncedQuery}&limit=50`],
    enabled: true,
  });

  const filtered = (data?.items || []).filter(m =>
    activeFilter === "all" ? true : m.type === activeFilter
  );

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

  return (
    <div className="min-h-screen bg-black pb-safe">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-black/95 backdrop-blur-xl border-b border-white/5 px-4 pt-safe pb-3">
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={() => setLocation('/app')}
            className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center active:scale-95 transition-transform flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4 text-white" />
          </button>
          <div className="flex-1 relative">
            <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search movies, series..."
              style={{ colorScheme: 'dark', backgroundColor: '#1c1c1e', color: '#ffffff' }}
              className="w-full border border-white/10 rounded-2xl pl-10 pr-10 py-2.5 text-sm placeholder-white/30 outline-none focus:border-primary/50 transition-colors caret-white"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-3.5 top-1/2 -translate-y-1/2"
              >
                <X className="w-4 h-4 text-white/30" />
              </button>
            )}
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2">
          {(["all", "movie", "series"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className={`px-4 py-1.5 rounded-full text-[11px] font-bold transition-all ${
                activeFilter === f
                  ? "bg-primary text-white"
                  : "bg-white/5 text-white/40 hover:bg-white/10"
              }`}
            >
              {f === "all" ? "All" : f === "movie" ? "Movies" : "Series"}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-4">
        {isLoading && debouncedQuery ? (
          <div className="flex justify-center py-16">
            <div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <SearchIcon className="w-14 h-14 text-white/10 mb-4" />
            <p className="text-white/30 text-sm">
              {debouncedQuery ? `No results for "${debouncedQuery}"` : "Search for movies or series"}
            </p>
          </div>
        ) : (
          <>
            {debouncedQuery && (
              <p className="text-[11px] text-white/30 mb-4">{filtered.length} results</p>
            )}
            <div className="grid grid-cols-2 gap-3">
              {filtered.map((movie, i) => {
                const poster = getPoster(movie.posterPath);
                return (
                  <motion.div
                    key={movie.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    onClick={() => handleMovieClick(movie.id)}
                    className="cursor-pointer"
                  >
                    <div className="relative w-full aspect-[2/3] rounded-2xl overflow-hidden bg-white/5 border border-white/5 mb-2 shadow-lg">
                      {poster ? (
                        <img src={poster} alt={movie.title} className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          {movie.type === 'series' ? <Tv className="w-8 h-8 text-white/15" /> : <Film className="w-8 h-8 text-white/15" />}
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                      <div className="absolute top-2 left-2 flex gap-1">
                        <span className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase ${movie.type === 'series' ? 'bg-purple-500/80' : 'bg-blue-500/80'} text-white`}>
                          {movie.type === 'series' ? 'S' : 'M'}
                        </span>
                      </div>
                      {movie.rating && movie.rating > 0 ? (
                        <div className="absolute top-2 right-2 bg-black/70 rounded-lg px-1.5 py-0.5 flex items-center gap-1">
                          <Star className="w-2.5 h-2.5 text-yellow-400 fill-yellow-400" />
                          <span className="text-[9px] font-bold text-white">{(movie.rating / 10).toFixed(1)}</span>
                        </div>
                      ) : null}
                    </div>
                    <p className="text-[11px] text-white/80 font-semibold truncate leading-tight">{movie.title}</p>
                    <p className="text-[9px] text-white/30">{movie.releaseDate?.slice(0, 4) || ''} {movie.genre?.split(',')[0] || ''}</p>
                  </motion.div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {showAd && <FullScreenInterstitialAd ad={fsAd} onClose={handleAdClose} />}
    </div>
  );
}
