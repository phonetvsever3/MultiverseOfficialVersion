import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { useMovie } from "@/hooks/use-movies";
import { useServeAd } from "@/hooks/use-ads";
import { Button } from "@/components/ui/button";
import { Calendar, Star, ShieldCheck, Film, Download, X, Tv, Database, ArrowRight, Sparkles, User, Zap, Play, ChevronLeft, Languages } from "lucide-react";
import { AdOverlay } from "@/components/AdOverlay";
import { AdRenderer } from "@/components/AdRenderer";
import { FullScreenInterstitialAd } from "@/components/FullScreenInterstitialAd";
import { cn } from "@/lib/utils";
import { useQuery, useMutation } from "@tanstack/react-query";
import { type Episode, type Ad, type Movie } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { fullscreenAdShownFor } from "@/lib/ad-session";
import { addToWatchHistory } from "@/lib/watch-history";
import { translateToMyanmar } from "@/lib/translate";

const tg = (window as any).Telegram?.WebApp;

interface TrailerInfo {
  key: string;
  site: string;
  name: string;
}

export default function MovieView() {
  const [, params] = useRoute("/app/movie/:id");
  const [, setLocation] = useLocation();
  const movieId = parseInt(params?.id || "0");
  const { data: movie, isLoading: isMovieLoading } = useMovie(movieId);
  const { data: ad, isLoading: isAdLoading, refetch: refetchAd } = useServeAd();
  
  const [showAd, setShowAd] = useState(false);
  const [isReadyToWatch, setIsReadyToWatch] = useState(false);
  const [selectedEpisode, setSelectedEpisode] = useState<Episode | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [inlineAds, setInlineAds] = useState<Ad[]>([]);
  const [fullscreenAd, setFullscreenAd] = useState<Ad | null>(null);
  const [showFullscreenAd, setShowFullscreenAd] = useState(false);
  const [showTrailer, setShowTrailer] = useState(false);
  const [myanmarOverview, setMyanmarOverview] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);

  const mainButtonHandlerRef = useRef<() => void>(() => {});
  const isListenerAttached = useRef(false);

  const { data: trailer } = useQuery<TrailerInfo | null>({
    queryKey: [`/api/movies/${movieId}/trailer`],
    enabled: !!movie && !!movie.tmdbId,
  });

  const { data: recommendedData } = useQuery<{ items: Movie[]; total: number }>({
    queryKey: [`/api/browse`, movie?.type, "rating", "", "", 1],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (movie?.type) params.set("type", movie.type);
      params.set("sort", "rating");
      params.set("page", "1");
      const res = await fetch(`/api/browse?${params}`);
      return res.json();
    },
    enabled: !!movie,
  });
  const recommendedMovies = (recommendedData?.items || []).filter(m => m.id !== movieId).slice(0, 10);

  useEffect(() => {
    const loadAds = async () => {
      try {
        const res = await fetch("/api/ads");
        const data = await res.json();
        setInlineAds(data.filter((a: Ad) => a.isActive).slice(0, 2));
      } catch (e) {
        console.error("Error loading ads:", e);
      }
    };
    loadAds();
  }, []);

  // Track view + watch history when the movie page opens
  useEffect(() => {
    if (!movieId) return;
    addToWatchHistory(movieId);
    fetch(`/api/movies/${movieId}/view`, { method: "POST" }).catch(() => {});
  }, [movieId]);

  useEffect(() => {
    if (fullscreenAdShownFor.has(movieId)) return;
    fullscreenAdShownFor.add(movieId);
    const loadFullscreenAd = async () => {
      try {
        const res = await fetch("/api/ads/fullscreen");
        const ad = await res.json();
        if (ad) {
          setFullscreenAd(ad);
          setShowFullscreenAd(true);
        }
      } catch (e) {
        console.error("Error loading fullscreen ad:", e);
      }
    };
    loadFullscreenAd();
  }, [movieId]);

  const { data: episodes } = useQuery<Episode[]>({
    queryKey: [`/api/movies/${movieId}/episodes`],
    enabled: !!movie && movie.type === 'series'
  });

  useEffect(() => {
    if (tg) {
      tg.ready();
      tg.expand();
      tg.MainButton.hide();
      
      const masterHandler = () => {
        if (mainButtonHandlerRef.current) mainButtonHandlerRef.current();
      };

      if (!isListenerAttached.current) {
        tg.MainButton.onClick(masterHandler);
        isListenerAttached.current = true;
      }

      return () => {
        if (tg.MainButton) {
          tg.MainButton.offClick(masterHandler);
          tg.MainButton.hide();
        }
        isListenerAttached.current = false;
      };
    }
  }, []);

  useEffect(() => {
    mainButtonHandlerRef.current = () => {
      const idToSend = selectedEpisode ? selectedEpisode.id : movieId;
      const botUsername = "MultiverseMovies_Bot"; 
      const deepLink = `https://t.me/${botUsername}?start=${idToSend}`;
      
      if (tg) {
        try { tg.sendData(String(idToSend)); } catch (e) {}
        tg.openTelegramLink(deepLink);
        if (tg.MainButton) {
          tg.MainButton.setParams({ text: "CHECK BOT CHAT ✅", color: "#22c55e", is_active: false });
        }
        setTimeout(() => tg.close(), 2000);
      } else {
        window.open(deepLink, '_blank');
      }
    };
  }, [selectedEpisode, movieId]);

  const handlePlayClick = (episode?: Episode) => {
    if (episode) setSelectedEpisode(episode);
    setIsReadyToWatch(false);
    setShowAd(true);
    refetchAd(); 
  };

  const handleDownloadClick = (episode?: Episode) => {
    if (episode) setSelectedEpisode(episode);
    setIsReadyToWatch(false);
    setShowAd(true);
    refetchAd(); 
  };

  const handleAdComplete = () => {
    setShowAd(false);
    setIsReadyToWatch(true);
    if (tg) {
      tg.MainButton.setParams({
        text: "GET MOVIE ON BOT 📥",
        color: "#e11d48",
        text_color: "#ffffff",
        is_active: true,
        is_visible: true
      });
      tg.MainButton.show();
      if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
      tg.showAlert("Link Unlocked! Click the button below.");
    }
  };

  useEffect(() => {
    if (!movie?.overview) return;
    setMyanmarOverview(null);
    setIsTranslating(true);
    translateToMyanmar(movie.overview).then((translated) => {
      setMyanmarOverview(translated);
      setIsTranslating(false);
    });
  }, [movie?.overview]);

  const handleBack = () => {
    setLocation("/app");
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes || bytes === 0) return "Unknown";
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) return gb.toFixed(2) + " GB";
    const mb = bytes / (1024 * 1024);
    if (mb >= 1) return mb.toFixed(2) + " MB";
    const kb = bytes / 1024;
    return kb.toFixed(2) + " KB";
  };

  if (isMovieLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-primary animate-pulse">
        <Film className="w-8 h-8" />
      </div>
    );
  }

  if (!movie) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center text-white p-6 text-center">
        <h2 className="text-xl font-bold mb-2">Movie Not Found</h2>
        <p className="text-muted-foreground">This content may have been removed.</p>
        <Button className="mt-6" onClick={handleBack}>← Back to Home</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-body pb-20">
      <div className="fixed inset-0 z-0 overflow-hidden">
         <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0a0a0a] to-[#0a0a0a] z-10" />
         <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary/20 blur-[120px] rounded-full animate-pulse" />
         <div className="absolute bottom-[10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/10 blur-[100px] rounded-full animate-pulse delay-1000" />
      </div>

      {/* Back Button */}
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center px-4 pt-4 pb-2">
        <button
          onClick={handleBack}
          className="flex items-center gap-1.5 bg-white/10 backdrop-blur-md border border-white/10 rounded-full px-4 py-2 text-white/80 text-xs font-bold hover:bg-white/20 active:scale-95 transition-all"
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>
      </div>

      <div className="relative z-10 px-6 pt-16 pb-6 flex flex-col items-center">
        <div className="w-56 aspect-[2/3] bg-gradient-to-b from-gray-700 to-gray-900 rounded-[2.5rem] shadow-[0_0_60px_rgba(225,29,72,0.25)] border border-white/10 mb-10 flex items-center justify-center relative overflow-hidden group">
          {movie.posterPath ? (
            <img 
              src={movie.posterPath.startsWith("http") ? movie.posterPath : `https://image.tmdb.org/t/p/w342${movie.posterPath}`}
              alt={movie.title}
              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
              loading="eager"
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-3">
              <Film className="w-16 h-16 text-white/20" />
              <span className="text-[10px] text-white/30 text-center px-2">{movie.title}</span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent pointer-events-none" />
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-primary backdrop-blur-md text-white text-[10px] font-black rounded-full shadow-xl uppercase tracking-[0.2em] border border-white/20">
            {movie.quality}
          </div>
        </div>

        <div className="flex items-center gap-2 mb-4 bg-white/5 px-4 py-1.5 rounded-full border border-white/5 animate-in slide-in-from-top duration-500">
           <Sparkles className="w-3.5 h-3.5 text-primary" />
           <span className="text-[10px] font-black text-white/60 uppercase tracking-[0.15em]">Verified Premium</span>
        </div>

        <h1 className="text-4xl font-display font-black text-center mb-4 tracking-tighter leading-none bg-clip-text text-transparent bg-gradient-to-b from-white to-white/60 px-4">
          {movie.title}
        </h1>
        
        <div className="flex items-center gap-5 text-[11px] font-bold text-white/30 mb-6 uppercase tracking-widest">
           <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> {movie.releaseDate ? movie.releaseDate.split("-")[0] : "N/A"}</span>
           <span className="w-1 h-1 rounded-full bg-primary/30" />
           <span className="flex items-center gap-1.5 text-yellow-500/60"><Star className="w-3.5 h-3.5 fill-current" /> {(movie.rating || 0) / 10}</span>
           <span className="w-1 h-1 rounded-full bg-primary/30" />
           <span className="text-primary/50">{movie.type}</span>
        </div>

        {/* Trailer Button */}
        {trailer && (
          <div className="w-full max-w-sm mb-6 px-4">
            {showTrailer ? (
              <div className="relative w-full rounded-2xl overflow-hidden aspect-video bg-black border border-white/10">
                <iframe
                  className="w-full h-full"
                  src={`https://www.youtube.com/embed/${trailer.key}?autoplay=1&rel=0`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  title={trailer.name}
                />
                <button
                  onClick={() => setShowTrailer(false)}
                  className="absolute top-2 right-2 w-8 h-8 bg-black/70 rounded-full flex items-center justify-center hover:bg-black/90 transition-all"
                >
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowTrailer(true)}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-white/5 border border-white/10 text-white/70 text-sm font-bold hover:bg-white/10 active:scale-95 transition-all"
              >
                <Play className="w-4 h-4 text-red-500 fill-red-500" />
                Watch Trailer
              </button>
            )}
          </div>
        )}

        {movie.overview && (
          <div className="w-full max-w-sm mb-10 px-6 space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <Languages className="w-3.5 h-3.5 text-primary/60" />
              <span className="text-[9px] uppercase tracking-widest text-white/20 font-bold">Description</span>
            </div>
            <p className="text-sm text-white/40 text-center leading-relaxed italic">
              "{movie.overview}"
            </p>
            <div className="border-t border-white/5 pt-3">
              <div className="flex items-center gap-1.5 mb-2 justify-center">
                <span className="text-[9px] uppercase tracking-widest text-primary/50 font-bold">မြန်မာဘာသာ</span>
              </div>
              {isTranslating ? (
                <div className="flex justify-center py-2">
                  <div className="w-4 h-4 border border-primary/40 border-t-primary rounded-full animate-spin" />
                </div>
              ) : myanmarOverview ? (
                <p className="text-sm text-white/30 text-center leading-relaxed">
                  {myanmarOverview}
                </p>
              ) : null}
            </div>
          </div>
        )}

        <div className="w-full max-w-sm space-y-6 px-4">
           {isReadyToWatch ? (
             <div className="space-y-4 animate-in fade-in zoom-in duration-700">
               <Button 
                 size="lg" 
                 className="w-full h-20 text-xl font-black bg-green-500 hover:bg-green-600 text-white rounded-[2rem] shadow-[0_20px_60px_rgba(34,197,94,0.4)] flex items-center justify-center gap-4 border-b-8 border-green-950 active:border-b-0 active:translate-y-2 transition-all"
                 onClick={() => mainButtonHandlerRef.current()}
               >
                 GET MOVIE ON BOT 📥 <ArrowRight className="w-6 h-6" />
               </Button>
               <div className="flex items-center justify-center gap-2 text-green-500 font-black text-[10px] uppercase tracking-widest bg-green-500/10 py-3 rounded-2xl border border-green-500/20">
                  <ShieldCheck className="w-4 h-4" /> Link Secured & Ready
               </div>
             </div>
           ) : (
             movie.type === 'movie' && (
               <div className="flex flex-col gap-4">
                 <Button 
                   size="lg" 
                   className="w-full h-18 text-lg font-black bg-primary hover:bg-primary/90 text-white rounded-[1.8rem] shadow-2xl shadow-primary/40 relative overflow-hidden group border-b-6 border-black/20"
                   onClick={() => handlePlayClick()}
                 >
                   <Play className="w-6 h-6 mr-3 fill-current" /> Play Premium
                 </Button>
                 <Button 
                   size="lg" 
                   variant="outline"
                   className="w-full h-18 text-lg font-black border-white/5 bg-white/5 hover:bg-white/10 text-white rounded-[1.8rem] shadow-xl relative overflow-hidden group"
                   onClick={() => handleDownloadClick()}
                 >
                   <Download className="w-6 h-6 mr-3 text-primary" /> Direct Download
                 </Button>
               </div>
             )
           )}
        </div>

        {movie.type === 'series' && episodes && episodes.length > 0 && !isReadyToWatch && (() => {
          const seasonNumbers = [...new Set(episodes.map(e => e.seasonNumber))].sort((a, b) => a - b);
          const activeSeason = selectedSeason ?? seasonNumbers[0];
          const seasonEpisodes = episodes
            .filter(e => e.seasonNumber === activeSeason)
            .sort((a, b) => a.episodeNumber - b.episodeNumber);

          return (
            <div className="w-full max-w-sm mt-16">
              {/* Header */}
              <h2 className="text-[10px] font-black mb-5 flex items-center gap-3 uppercase tracking-[0.3em] text-white/20 px-4">
                <Tv className="w-4 h-4 text-primary" /> Seasons & Episodes
              </h2>

              {/* Season tabs */}
              {seasonNumbers.length > 0 && (
                <div className="flex gap-2 overflow-x-auto scrollbar-hide px-4 pb-1 mb-6">
                  {seasonNumbers.map(s => (
                    <button
                      key={s}
                      onClick={() => setSelectedSeason(s)}
                      className={cn(
                        "flex-shrink-0 px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all duration-200",
                        activeSeason === s
                          ? "bg-primary text-white shadow-lg shadow-primary/30 scale-105"
                          : "bg-white/5 text-white/40 border border-white/[0.08] hover:bg-white/10 hover:text-white/70"
                      )}
                      data-testid={`season-tab-${s}`}
                    >
                      Season {s}
                    </button>
                  ))}
                </div>
              )}

              {/* Episode count */}
              <div className="text-[9px] text-white/20 font-black uppercase tracking-widest mb-4 px-4">
                {seasonEpisodes.length} Episode{seasonEpisodes.length !== 1 ? 's' : ''}
              </div>

              {/* Episode list */}
              <div className="space-y-4 px-4">
                {seasonEpisodes.map((ep) => (
                  <div
                    key={ep.id}
                    className="bg-[#111] border border-white/5 p-5 rounded-[1.5rem] hover:bg-white/[0.04] transition-all cursor-pointer group hover:scale-[1.01] active:scale-[0.98] shadow-xl"
                    onClick={() => handleDownloadClick(ep)}
                    data-testid={`episode-card-${ep.id}`}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Episode number pill */}
                        <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                          <span className="text-[11px] font-black text-primary">{ep.episodeNumber}</span>
                        </div>
                        <div className="min-w-0">
                          <div className="font-black text-[11px] text-white/85 line-clamp-1 leading-tight">{ep.title || `Episode ${ep.episodeNumber}`}</div>
                          {ep.airDate && (
                            <div className="text-[9px] text-white/25 font-medium mt-0.5">{ep.airDate}</div>
                          )}
                        </div>
                      </div>
                      {ep.rating ? (
                        <div className="flex-shrink-0 flex items-center gap-1 text-[9px] text-yellow-500 font-black bg-yellow-500/5 px-2.5 py-1 rounded-full border border-yellow-500/10 ml-2">
                          <Star className="w-2.5 h-2.5 fill-current" /> {(ep.rating / 10).toFixed(1)}
                        </div>
                      ) : null}
                    </div>

                    {ep.overview && (
                      <p className="text-[10px] text-white/20 line-clamp-2 leading-relaxed mb-4 font-medium ml-12">{ep.overview}</p>
                    )}

                    <div className="flex justify-between items-center ml-12">
                      <div className="px-3 py-1.5 bg-primary/5 rounded-xl border border-primary/10">
                        <span className="text-[9px] text-primary font-black uppercase tracking-widest flex items-center gap-1.5">
                          <Database className="w-3 h-3" /> {formatFileSize(ep.fileSize)}
                        </span>
                      </div>
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-4 text-[10px] font-black text-primary hover:bg-primary/10 rounded-full uppercase tracking-tighter"
                          onClick={(e) => { e.stopPropagation(); handlePlayClick(ep); }}
                          data-testid={`button-play-ep-${ep.id}`}
                        >
                          Play
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-4 text-[10px] font-black text-primary hover:bg-primary/10 rounded-full uppercase tracking-tighter"
                          onClick={(e) => { e.stopPropagation(); handleDownloadClick(ep); }}
                          data-testid={`button-dl-ep-${ep.id}`}
                        >
                          DL
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Cast Section */}
        {movie.cast && Array.isArray(movie.cast) && movie.cast.length > 0 && (
          <div className="w-full max-w-sm mt-12">
            <h2 className="text-[10px] font-black mb-5 flex items-center gap-2 uppercase tracking-[0.3em] text-white/30 px-4">
              <User className="w-4 h-4 text-primary" /> Cast
            </h2>
            <div className="flex gap-3 overflow-x-auto pb-3 px-4 scrollbar-hide snap-x snap-mandatory">
              {movie.cast.slice(0, 10).map((actor: any, idx: number) => (
                <div
                  key={idx}
                  className="flex-shrink-0 w-[100px] snap-start group"
                  data-testid={`cast-card-${idx}`}
                >
                  {/* Profile Photo */}
                  <div className="relative w-[100px] h-[130px] rounded-2xl overflow-hidden mb-2.5 border border-white/10 shadow-lg shadow-black/50 group-hover:border-primary/40 transition-all duration-300">
                    {actor.profilePath ? (
                      <>
                        <img
                          src={`https://image.tmdb.org/t/p/w185${actor.profilePath}`}
                          alt={actor.name}
                          className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500"
                        />
                        {/* Bottom gradient overlay */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                      </>
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-white/5 to-white/[0.02] flex items-center justify-center">
                        <User className="w-8 h-8 text-white/20" />
                      </div>
                    )}
                    {/* Rank badge for top 3 */}
                    {idx < 3 && (
                      <div className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-primary/90 backdrop-blur-sm flex items-center justify-center shadow-lg shadow-primary/30">
                        <span className="text-[9px] font-black text-white">{idx + 1}</span>
                      </div>
                    )}
                  </div>
                  {/* Info */}
                  <div className="px-0.5">
                    <div className="text-[10px] font-black text-white/90 truncate leading-tight mb-0.5">{actor.name}</div>
                    <div className="text-[9px] font-medium text-primary/70 truncate leading-tight italic">{actor.character}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Inline Ads Section */}
        {inlineAds.length > 0 && (
          <div className="w-full max-w-sm mt-12 px-4">
            <h2 className="text-[10px] font-black mb-5 flex items-center gap-2 uppercase tracking-[0.3em] text-white/30">
              <Zap className="w-4 h-4 text-yellow-500" /> Sponsored Ads
            </h2>
            {inlineAds.map((ad) => (
              <div key={ad.id} className="bg-white/5 rounded-[2rem] p-4 border border-white/5 mb-5 overflow-hidden min-h-[160px] flex items-center justify-center">
                <AdRenderer ad={ad} />
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-5 w-full max-w-sm mt-12 px-4">
           <div className="bg-[#111] border border-white/5 rounded-[2rem] p-8 text-center group hover:bg-white/[0.04] transition-all shadow-xl">
              <div className="w-14 h-14 rounded-[1.2rem] bg-green-500/5 flex items-center justify-center mx-auto mb-5 border border-green-500/10 group-hover:scale-110 transition-transform">
                <ShieldCheck className="w-7 h-7 text-green-500/60" />
              </div>
              <div className="text-[9px] text-white/20 uppercase font-black tracking-[0.2em] mb-2">Status</div>
              <div className="font-black text-sm text-white/60">Secure</div>
           </div>
           <div className="bg-[#111] border border-white/5 rounded-[2rem] p-8 text-center group hover:bg-white/[0.04] transition-all shadow-xl">
              <div className="w-14 h-14 rounded-[1.2rem] bg-blue-500/5 flex items-center justify-center mx-auto mb-5 border border-blue-500/10 group-hover:scale-110 transition-transform">
                <Database className="w-7 h-7 text-blue-500/60" />
              </div>
              <div className="text-[9px] text-white/20 uppercase font-black tracking-[0.2em] mb-2">Source</div>
              <div className="font-black text-sm text-white/60">Cloud</div>
           </div>
        </div>

        {/* Recommended For You */}
        {recommendedMovies.length > 0 && (
          <div className="w-full mt-10">
            <div className="flex items-center justify-between px-4 mb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-yellow-400" />
                <span className="text-sm font-black text-white uppercase tracking-wider">You May Also Like</span>
              </div>
              <button
                onClick={() => setLocation(`/app/browse?type=${movie.type}&sort=rating&title=Recommended`)}
                className="flex items-center gap-1 text-[10px] text-primary font-bold active:scale-95 transition-all"
              >
                All <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            <div className="flex gap-3 overflow-x-auto px-4 pb-2" style={{ scrollbarWidth: 'none' }}>
              {recommendedMovies.map((rec) => {
                const recPoster = rec.posterPath
                  ? rec.posterPath.startsWith('http') ? rec.posterPath : `https://image.tmdb.org/t/p/w342${rec.posterPath}`
                  : null;
                return (
                  <button
                    key={rec.id}
                    onClick={() => setLocation(`/app/movie/${rec.id}`)}
                    className="flex-shrink-0 w-24 text-left"
                    data-testid={`card-recommended-${rec.id}`}
                  >
                    <div className="relative w-24 h-36 rounded-xl overflow-hidden bg-white/5 border border-white/5 mb-1.5">
                      {recPoster ? (
                        <img src={recPoster} alt={rec.title} className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          {rec.type === 'series' ? <Tv className="w-6 h-6 text-white/20" /> : <Film className="w-6 h-6 text-white/20" />}
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
                    <p className="text-[9px] text-white/70 font-semibold truncate leading-tight">{rec.title}</p>
                    {rec.releaseDate && (
                      <p className="text-[8px] text-white/30">{rec.releaseDate.slice(0, 4)}</p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Back to all movies button */}
        <div className="w-full max-w-sm mt-8 px-4">
          <button
            onClick={handleBack}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-white/5 border border-white/10 text-white/50 text-sm font-bold hover:bg-white/10 active:scale-95 transition-all"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to All {movie.type === 'series' ? 'Series' : 'Movies'}
          </button>
        </div>
      </div>

      {showAd && (
        <AdOverlay 
          ad={ad} 
          isLoading={isAdLoading} 
          onComplete={handleAdComplete} 
        />
      )}

      {showFullscreenAd && (
        <FullScreenInterstitialAd
          ad={fullscreenAd}
          onClose={() => setShowFullscreenAd(false)}
        />
      )}
    </div>
  );
}
