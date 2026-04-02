import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ChevronLeft, Film, Star, Search } from "lucide-react";
import { type Movie } from "@shared/schema";
import { FloatingFileMascot, AnimatedMovieIcon, AnimatedSeriesIcon } from "@/components/FloatingFileMascot";

const TMDB_IMAGE = "https://image.tmdb.org/t/p/";

function getPoster(path: string | null | undefined) {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `${TMDB_IMAGE}w342${path}`;
}

function getParams() {
  const search = window.location.search;
  const params = new URLSearchParams(search);
  return {
    type: params.get("type") || "",
    sort: params.get("sort") || "rating",
    lang: params.get("lang") || "",
    search: params.get("search") || "",
    actor: params.get("actor") || "",
    title: params.get("title") || "",
  };
}

function getTitle(type: string, sort: string, lang: string, search: string, actor: string, customTitle: string) {
  if (customTitle) return customTitle;
  if (actor) return `${actor} — Movies`;
  if (search === "animation") return "Animation";
  if (search === "action") return "Action";
  if (search === "horror") return "Horror";
  if (search === "sci-fi") return "Sci-Fi";
  if (lang === "ko") return "K-Drama";
  if (lang === "hi") return "Bollywood";
  if (sort === "latest" && type === "movie") return "New Movies";
  if (sort === "latest" && type === "series") return "New Series";
  if (sort === "latest") return "Latest Uploads";
  if (sort === "views") return "Most Viewed";
  if (type === "movie") return "Top Movies";
  if (type === "series") return "Top Series";
  return "Browse All";
}

export default function Browse() {
  const [, setLocation] = useLocation();
  const { type, sort, lang, search, actor, title } = getParams();
  const [page, setPage] = useState(1);
  const [allItems, setAllItems] = useState<Movie[]>([]);

  const effectiveSearch = actor || search;

  const { data, isLoading, isFetching } = useQuery<{ items: Movie[]; total: number }>({
    queryKey: [`/api/browse`, type, sort, lang, effectiveSearch, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (type) params.set("type", type);
      if (sort) params.set("sort", sort);
      if (lang) params.set("lang", lang);
      if (effectiveSearch) params.set("search", effectiveSearch);
      params.set("page", String(page));
      const res = await fetch(`/api/browse?${params}`);
      return res.json();
    },
  });

  useEffect(() => {
    if (data?.items) {
      if (page === 1) {
        setAllItems(data.items);
      } else {
        setAllItems(prev => [...prev, ...data.items]);
      }
    }
  }, [data, page]);

  const pageTitle = getTitle(type, sort, lang, search, actor, title);
  const hasMore = data ? allItems.length < data.total : false;

  return (
    <div className="min-h-screen bg-black text-white pb-16">
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center gap-3 px-4 py-4 bg-gradient-to-b from-black to-transparent">
        <button
          data-testid="button-back"
          onClick={() => setLocation("/app")}
          className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center active:scale-95 transition-transform"
        >
          <ChevronLeft className="w-5 h-5 text-white" />
        </button>
        <h1 className="text-base font-black text-white tracking-tight">{pageTitle}</h1>
        <button
          data-testid="button-search"
          onClick={() => setLocation("/app/search")}
          className="ml-auto w-9 h-9 rounded-full bg-white/10 flex items-center justify-center active:scale-95 transition-transform"
        >
          <Search className="w-4 h-4 text-white" />
        </button>
      </div>

      <div className="pt-16 px-4">
        {isLoading && page === 1 ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3 mt-2">
              {allItems.map((movie) => {
                const poster = getPoster(movie.posterPath);
                return (
                  <motion.div
                    key={movie.id}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setLocation(`/app/movie/${movie.id}`)}
                    className="cursor-pointer"
                    data-testid={`card-movie-${movie.id}`}
                  >
                    <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-white/5 border border-white/5 mb-1.5 shadow-lg">
                      {poster ? (
                        <img src={poster} alt={movie.title} className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          {movie.type === 'series' ? <AnimatedSeriesIcon /> : <AnimatedMovieIcon />}
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                      {movie.rating && movie.rating > 0 ? (
                        <div className="absolute top-1.5 right-1.5 bg-black/70 rounded px-1 py-0.5 flex items-center gap-0.5">
                          <Star className="w-2 h-2 text-yellow-400 fill-yellow-400" />
                          <span className="text-[8px] font-bold text-white">{(movie.rating / 10).toFixed(1)}</span>
                        </div>
                      ) : null}
                      {movie.quality && (
                        <div className="absolute bottom-1.5 left-1.5">
                          <span className="text-[7px] bg-primary/80 text-white rounded px-1 py-0.5 font-bold uppercase">{movie.quality}</span>
                        </div>
                      )}
                    </div>
                    <p className="text-[9px] text-white/70 font-semibold truncate leading-tight">{movie.title}</p>
                    {movie.releaseDate && (
                      <p className="text-[8px] text-white/30">{movie.releaseDate.slice(0, 4)}</p>
                    )}
                  </motion.div>
                );
              })}
            </div>

            {allItems.length === 0 && !isLoading && (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <Film className="w-16 h-16 text-white/10 mb-4" />
                <p className="text-white/30 text-sm">No content found.</p>
              </div>
            )}

            {hasMore && (
              <button
                data-testid="button-load-more"
                onClick={() => setPage(p => p + 1)}
                disabled={isFetching}
                className="w-full mt-6 py-4 rounded-2xl bg-white/5 border border-white/10 text-white/60 text-sm font-bold hover:bg-white/10 active:scale-95 transition-all disabled:opacity-50"
              >
                {isFetching ? "Loading..." : "Load More"}
              </button>
            )}
          </>
        )}
      </div>

      <FloatingFileMascot />
    </div>
  );
}
