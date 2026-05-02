import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft, Search, Shield, Play, Clock, Eye, AlertTriangle,
  X, Wifi, Film, Star, Loader2, Flame, Heart, Sparkles, Crown,
  Globe, Zap, Trophy, ChevronRight,
} from "lucide-react";
import { FullScreenInterstitialAd } from "@/components/FullScreenInterstitialAd";
import { VideoPlayer, type VideoSource } from "@/components/VideoPlayer";
import { AdRenderer } from "@/components/AdRenderer";
import { TelegaioAdBanner } from "@/components/TelegaioAd";
import { type Ad } from "@shared/schema";

const tg = (window as any).Telegram?.WebApp;

interface XnxxVideo {
  id: string;
  title: string;
  thumbnail: string;
  duration: string;
  url: string;
  views?: number;
  quality?: string;
}

interface XnxxResponse {
  videos: XnxxVideo[];
  total: number;
}

interface VideoDetail {
  id: string;
  title: string;
  thumb: string;
  uploader?: string;
  sources: VideoSource[];
}

// ─── Adult Categories ─────────────────────────────────────────────────────────
const ADULT_CATEGORIES = [
  { id: "trending",      label: "Trending Now",    query: "trending",      icon: <Flame    className="w-3.5 h-3.5 text-orange-400" /> },
  { id: "romance",       label: "Romance",          query: "romance",       icon: <Heart    className="w-3.5 h-3.5 text-pink-400"   /> },
  { id: "drama",         label: "Drama Series",     query: "drama series",  icon: <Film     className="w-3.5 h-3.5 text-purple-400" /> },
  { id: "comedy",        label: "Comedy",           query: "comedy",        icon: <Sparkles className="w-3.5 h-3.5 text-yellow-400" /> },
  { id: "premium",       label: "Premium Picks",    query: "premium hd",    icon: <Crown    className="w-3.5 h-3.5 text-amber-400"  /> },
  { id: "international", label: "International",    query: "international", icon: <Globe    className="w-3.5 h-3.5 text-blue-400"   /> },
  { id: "action",        label: "Action & Intense", query: "intense action",icon: <Zap     className="w-3.5 h-3.5 text-red-400"    /> },
  { id: "favorites",     label: "Fan Favorites",    query: "most popular",  icon: <Trophy   className="w-3.5 h-3.5 text-green-400"  /> },
] as const;

// Ad shown after category indices (0-based): 1 = after cat 2, 3 = after cat 4, 7 = after cat 8
const AD_AFTER_INDICES = new Set([1, 3, 7]);

// ─── 320×50 Banner Ad ─────────────────────────────────────────────────────────
function BannerAd320x50({ ad }: { ad: Ad | null | undefined }) {
  if (!ad) return null;
  return (
    <div className="flex justify-center my-3 px-4">
      <div
        style={{ width: 320, height: 50, minWidth: 320, minHeight: 50, maxWidth: 320, maxHeight: 50 }}
        className="overflow-hidden rounded-xl border border-white/8 bg-black/40 flex-shrink-0"
        data-testid="banner-ad-320x50"
      >
        <AdRenderer ad={ad} />
      </div>
    </div>
  );
}

// ─── Category Video Card ──────────────────────────────────────────────────────
function VideoCard({
  video,
  onClick,
}: {
  video: XnxxVideo;
  onClick: () => void;
}) {
  return (
    <motion.div
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className="flex-shrink-0 w-32 cursor-pointer group"
      data-testid={`card-adult-${video.id}`}
    >
      <div className="relative w-32 h-[72px] rounded-xl overflow-hidden bg-zinc-900 mb-1.5 shadow-lg">
        {video.thumbnail ? (
          <img
            src={video.thumbnail}
            alt={video.title}
            className="w-full h-full object-cover group-active:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-zinc-900">
            <Film className="w-6 h-6 text-white/10" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-8 h-8 rounded-full bg-black/50 border border-white/20 backdrop-blur-sm flex items-center justify-center opacity-80">
            <Play className="w-4 h-4 text-white fill-white ml-0.5" />
          </div>
        </div>
        <div className="absolute bottom-1 left-1 right-1 flex justify-between items-end">
          {video.duration && (
            <div className="flex items-center gap-0.5 bg-black/70 rounded px-1 py-0.5">
              <Clock className="w-2 h-2 text-white/50" />
              <span className="text-[8px] text-white/80 font-bold">{video.duration}</span>
            </div>
          )}
          {video.quality && (
            <div className="bg-pink-600/80 rounded px-1 py-0.5">
              <span className="text-[8px] text-white font-black">{video.quality}</span>
            </div>
          )}
        </div>
      </div>
      <p className="text-[9px] text-white/75 font-semibold line-clamp-2 leading-snug px-0.5">{video.title}</p>
      {video.views !== undefined && (
        <div className="flex items-center gap-0.5 mt-0.5 px-0.5">
          <Eye className="w-2 h-2 text-white/20" />
          <span className="text-[8px] text-white/25">{video.views.toLocaleString()}</span>
        </div>
      )}
    </motion.div>
  );
}

// ─── Category Row (horizontal scroll) ─────────────────────────────────────────
function CategoryRow({
  label,
  icon,
  query,
  ageConfirmed,
  onVideoClick,
}: {
  label: string;
  icon: React.ReactNode;
  query: string;
  ageConfirmed: boolean;
  onVideoClick: (video: XnxxVideo) => void;
}) {
  const { data, isLoading } = useQuery<XnxxResponse>({
    queryKey: ["/api/adult/category", query],
    queryFn: async () => {
      const params = new URLSearchParams({ query, page: "1" });
      const res = await fetch(`/api/adult/search?${params}`);
      return res.json();
    },
    enabled: ageConfirmed,
    staleTime: 1000 * 60 * 5,
  });

  const videos = data?.videos?.slice(0, 10) ?? [];

  return (
    <div className="mb-7">
      <div className="flex items-center justify-between px-4 mb-2.5">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-xs font-black text-white uppercase tracking-wider">{label}</h2>
        </div>
        <span className="text-[9px] text-pink-400/60 font-bold flex items-center gap-0.5">
          18+ <ChevronRight className="w-2.5 h-2.5" />
        </span>
      </div>

      {isLoading ? (
        <div className="flex gap-3 px-4 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex-shrink-0 w-32">
              <div className="w-32 h-[72px] rounded-xl bg-white/5 animate-pulse mb-1.5" />
              <div className="h-2 bg-white/5 rounded-full w-4/5 animate-pulse" />
            </div>
          ))}
        </div>
      ) : videos.length > 0 ? (
        <div
          className="flex gap-3 px-4 pb-1 overflow-x-auto"
          style={{ scrollbarWidth: "none" }}
        >
          {videos.map((video) => (
            <VideoCard key={video.id} video={video} onClick={() => onVideoClick(video)} />
          ))}
        </div>
      ) : (
        <div className="px-4">
          <div className="h-[72px] flex items-center justify-center rounded-xl bg-white/3 border border-white/5">
            <p className="text-white/20 text-[10px]">No content available</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Video Detail Sheet ───────────────────────────────────────────────────────
function VideoDetailSheet({
  videoId,
  videoUrl,
  thumbFallback,
  titleFallback,
  onClose,
  onPlay,
}: {
  videoId: string;
  videoUrl?: string;
  thumbFallback: string;
  titleFallback: string;
  onClose: () => void;
  onPlay: (detail: VideoDetail) => void;
}) {
  const { data: detail, isLoading } = useQuery<VideoDetail>({
    queryKey: [`/api/adult/video/${videoId}`],
    queryFn: async () => {
      const params = new URLSearchParams({ id: videoId });
      if (videoUrl) params.set("url", videoUrl);
      const res = await fetch(`/api/adult/video/${videoId}?${params}`);
      if (!res.ok) throw new Error("Failed to load sources");
      return res.json();
    },
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: "100%" }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 280 }}
      className="fixed inset-0 z-[200] bg-black flex flex-col overflow-y-auto"
    >
      <div className="flex items-center gap-3 px-4 py-3 bg-black/80 backdrop-blur-sm border-b border-white/5 sticky top-0 z-10">
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center active:scale-95 transition-transform flex-shrink-0"
        >
          <ChevronLeft className="w-5 h-5 text-white" />
        </button>
        <p className="text-white/70 text-xs font-bold flex-1 line-clamp-1">
          {detail?.title || titleFallback}
        </p>
      </div>

      <div className="relative w-full aspect-video bg-zinc-950 flex-shrink-0">
        <img
          src={detail?.thumb || thumbFallback}
          alt={detail?.title || titleFallback}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
        {!isLoading && detail && (
          <button
            onClick={() => onPlay(detail)}
            className="absolute inset-0 flex items-center justify-center group"
          >
            <div className="w-20 h-20 rounded-full bg-pink-600/80 border-4 border-pink-400/50 backdrop-blur-sm flex items-center justify-center shadow-2xl shadow-pink-500/40 group-active:scale-95 transition-transform">
              <Play className="w-9 h-9 text-white fill-white ml-1" />
            </div>
          </button>
        )}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-10 h-10 text-pink-400 animate-spin" />
          </div>
        )}
      </div>

      <div className="flex-1 px-4 py-5 space-y-6">
        <div>
          <h1 className="text-white font-black text-lg leading-snug mb-1">
            {detail?.title || titleFallback}
          </h1>
          {detail?.uploader && (
            <p className="text-white/30 text-xs flex items-center gap-1.5">
              <Star className="w-3 h-3 text-pink-500" />
              {detail.uploader}
            </p>
          )}
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center py-10 gap-3">
            <Loader2 className="w-8 h-8 text-pink-400 animate-spin" />
            <p className="text-white/25 text-xs">Loading sources…</p>
          </div>
        ) : detail?.sources && detail.sources.length > 0 ? (
          <div className="space-y-3">
            <p className="text-white/30 text-[9px] font-black uppercase tracking-widest">Available Quality</p>
            <button
              onClick={() => detail && onPlay(detail)}
              className="w-full flex items-center gap-3 bg-gradient-to-r from-pink-600 to-rose-600 rounded-2xl px-5 py-4 active:scale-[0.98] transition-all shadow-lg shadow-pink-500/25"
            >
              <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0">
                <Play className="w-5 h-5 text-white fill-white ml-0.5" />
              </div>
              <div className="text-left">
                <p className="text-white font-black text-sm">Watch Now</p>
                <p className="text-pink-200/60 text-[10px]">{detail.sources.map(s => s.label).join(" • ")}</p>
              </div>
            </button>
            <div className="space-y-2.5 pt-1">
              {detail.sources.map((src) => (
                <div key={src.label} className="flex items-center justify-between bg-white/4 border border-white/6 rounded-2xl px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Film className="w-4 h-4 text-white/20 flex-shrink-0" />
                    <div>
                      <p className="text-white font-bold text-sm">{src.label}</p>
                      <p className="text-white/25 text-[10px]">{src.type === "hls" ? "Adaptive stream" : "Direct MP4"}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => onPlay({ ...detail, sources: [src, ...detail.sources.filter(s => s !== src)] })}
                    className="flex items-center gap-1.5 bg-pink-600 text-white text-[10px] font-black px-3 py-2 rounded-xl active:scale-95 transition-all"
                  >
                    <Play className="w-2.5 h-2.5 fill-white" /> Play
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-10">
            <Film className="w-12 h-12 text-white/8 mx-auto mb-3" />
            <p className="text-white/25 text-sm">No playable sources found.</p>
          </div>
        )}

        <div className="flex items-start gap-3 bg-blue-500/6 border border-blue-500/12 rounded-2xl px-4 py-3">
          <Wifi className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
          <p className="text-blue-400/60 text-[10px] leading-relaxed">
            If a source fails to load, try switching quality or use a VPN for unblocked access.
          </p>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main Adult Page ──────────────────────────────────────────────────────────
export default function Adult() {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const [searchPage, setSearchPage] = useState(1);

  const [detailVideoId, setDetailVideoId] = useState<string | null>(null);
  const [detailVideoUrl, setDetailVideoUrl] = useState<string>("");
  const [detailThumb, setDetailThumb] = useState("");
  const [detailTitle, setDetailTitle] = useState("");
  const [playerDetail, setPlayerDetail] = useState<VideoDetail | null>(null);

  const [fullscreenAd, setFullscreenAd] = useState<Ad | null>(null);
  const [showFullscreenAd, setShowFullscreenAd] = useState(false);
  const [vpnDismissed, setVpnDismissed] = useState(false);
  const hasShownFullscreenAd = useRef(false);

  // Fetch 3 banner ads for the category separators
  const { data: bannerAd1 } = useQuery<Ad | null>({
    queryKey: ["/api/ads/serve", "banner1"],
    queryFn: async () => {
      const res = await fetch("/api/ads/serve");
      if (!res.ok) return null;
      return res.json();
    },
    enabled: ageConfirmed,
    staleTime: 1000 * 60 * 10,
  });
  const { data: bannerAd2 } = useQuery<Ad | null>({
    queryKey: ["/api/ads/serve", "banner2"],
    queryFn: async () => {
      const res = await fetch("/api/ads/serve");
      if (!res.ok) return null;
      return res.json();
    },
    enabled: ageConfirmed,
    staleTime: 1000 * 60 * 10,
  });
  const { data: bannerAd3 } = useQuery<Ad | null>({
    queryKey: ["/api/ads/serve", "banner3"],
    queryFn: async () => {
      const res = await fetch("/api/ads/serve");
      if (!res.ok) return null;
      return res.json();
    },
    enabled: ageConfirmed,
    staleTime: 1000 * 60 * 10,
  });

  // Map banner positions → ad data
  const bannerAds: Record<number, Ad | null | undefined> = {
    1: bannerAd1,
    3: bannerAd2,
    7: bannerAd3,
  };


  // Search results (only shown when searchMode=true)
  const { data: searchData, isLoading: isSearchLoading, isFetching: isSearchFetching } = useQuery<XnxxResponse>({
    queryKey: ["/api/adult/search", search, searchPage],
    queryFn: async () => {
      const params = new URLSearchParams({ query: search, page: String(searchPage) });
      const res = await fetch(`/api/adult/search?${params}`);
      return res.json();
    },
    enabled: ageConfirmed && searchMode && !!search,
  });

  const handleVideoClick = (video: XnxxVideo) => {
    setDetailVideoId(video.id);
    setDetailVideoUrl(video.url || "");
    setDetailThumb(video.thumbnail);
    setDetailTitle(video.title);
  };

  const handleAgeConfirm = async () => {
    setAgeConfirmed(true);
    if (!hasShownFullscreenAd.current) {
      hasShownFullscreenAd.current = true;
      try {
        const res = await fetch("/api/ads/fullscreen");
        const fsAd = await res.json();
        if (fsAd) {
          setFullscreenAd(fsAd);
          setShowFullscreenAd(true);
        }
      } catch {}
    }
  };

  const handleSearch = () => {
    if (!query.trim()) return;
    setSearch(query.trim());
    setSearchPage(1);
    setSearchMode(true);
  };

  const handleSearchClear = () => {
    setQuery("");
    setSearch("");
    setSearchMode(false);
    setSearchPage(1);
  };

  // ── Age Gate ────────────────────────────────────────────────────────────────
  if (!ageConfirmed) {
    return (
      <div className="min-h-screen bg-[#080808] flex flex-col items-center justify-center px-6 text-center">
        <div className="w-24 h-24 rounded-[2rem] bg-pink-500/10 border border-pink-500/20 flex items-center justify-center mb-8 shadow-[0_0_60px_rgba(236,72,153,0.15)]">
          <Shield className="w-12 h-12 text-pink-400" />
        </div>
        <h1 className="text-3xl font-black text-white mb-2 tracking-tight">Adult Shows</h1>
        <p className="text-white/30 text-sm mb-6">Explicit 18+ content. Viewer discretion required.</p>
        <div className="flex items-center gap-2.5 bg-yellow-500/8 border border-yellow-500/15 rounded-2xl px-5 py-3.5 mb-10 max-w-xs">
          <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0" />
          <p className="text-yellow-400 text-xs font-bold text-left">You must be 18 years or older to enter this section.</p>
        </div>
        <div className="w-full max-w-xs space-y-3">
          <button
            data-testid="button-enter-adult"
            onClick={handleAgeConfirm}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-pink-600 to-rose-600 text-white font-black text-sm active:scale-95 transition-all shadow-[0_10px_40px_rgba(236,72,153,0.3)]"
          >
            I am 18+ — Enter
          </button>
          <button
            onClick={() => setLocation("/app")}
            className="w-full py-4 rounded-2xl bg-white/5 border border-white/8 text-white/50 font-bold text-sm active:scale-95 transition-all"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  // ── Main Content ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#080808] text-white pb-20">

      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-[#080808]/95 backdrop-blur-md border-b border-white/5 px-4 py-3">
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={() => setLocation("/app")}
            className="w-9 h-9 rounded-full bg-white/8 flex items-center justify-center active:scale-95 transition-transform flex-shrink-0"
          >
            <ChevronLeft className="w-5 h-5 text-white" />
          </button>
          <div className="flex items-center gap-2 flex-1">
            <Shield className="w-4 h-4 text-pink-500" />
            <h1 className="text-sm font-black text-white tracking-tight">Adult Shows</h1>
          </div>
          <span className="text-[9px] bg-pink-500/15 border border-pink-500/25 text-pink-400 rounded-full px-2.5 py-1 font-black tracking-widest">18+</span>
        </div>

        {/* Search bar */}
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleSearch(); }}
              placeholder="Search adult shows…"
              className="w-full bg-white/5 border border-white/8 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-pink-500/40 transition-colors"
              data-testid="input-adult-search"
            />
          </div>
          {searchMode ? (
            <button
              onClick={handleSearchClear}
              className="px-3 py-2 rounded-xl bg-white/8 border border-white/10 text-white/50 font-bold text-xs active:scale-95 transition-all"
              data-testid="button-clear-search"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleSearch}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-pink-600 to-rose-600 text-white font-bold text-xs active:scale-95 transition-all shadow-lg shadow-pink-500/20"
              data-testid="button-search"
            >
              Search
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="pt-[112px]">

        {/* Banner Ad */}
        <div className="px-4 pt-2 pb-1" data-testid="telegaio-banner-ad-adult">
          <TelegaioAdBanner />
        </div>

        {/* VPN Banner */}
        <AnimatePresence>
          {!vpnDismissed && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden mx-4 mb-4 mt-2"
            >
              <div className="flex items-start gap-3 bg-blue-500/8 border border-blue-500/15 rounded-2xl px-4 py-3">
                <Wifi className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-blue-300 text-xs font-black mb-0.5">VPN Recommended</p>
                  <p className="text-blue-400/60 text-[10px] leading-relaxed">Adult content may be restricted. Use a VPN for privacy &amp; unblocked access.</p>
                </div>
                <button onClick={() => setVpnDismissed(true)} className="text-blue-400/40">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Search Results Mode ──────────────────────────────────────── */}
        {searchMode ? (
          <div className="px-3">
            <div className="flex items-center gap-2 px-1 mb-4">
              <Search className="w-3.5 h-3.5 text-pink-400" />
              <p className="text-xs text-white/50 font-bold">Results for "<span className="text-white/80">{search}</span>"</p>
            </div>

            {isSearchLoading ? (
              <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="rounded-2xl bg-white/4 animate-pulse">
                    <div className="aspect-video rounded-t-2xl bg-white/6" />
                    <div className="p-2 space-y-1.5">
                      <div className="h-2.5 bg-white/6 rounded-full w-full" />
                      <div className="h-2 bg-white/4 rounded-full w-2/3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : searchData?.videos && searchData.videos.length > 0 ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  {searchData.videos.map((video) => (
                    <motion.div
                      key={video.id}
                      whileTap={{ scale: 0.96 }}
                      className="cursor-pointer group"
                      onClick={() => handleVideoClick(video)}
                      data-testid={`card-search-${video.id}`}
                    >
                      <div className="relative aspect-video rounded-2xl overflow-hidden bg-zinc-900 mb-2 shadow-xl">
                        {video.thumbnail ? (
                          <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover" loading="lazy" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-zinc-900">
                            <Film className="w-8 h-8 text-white/10" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-11 h-11 rounded-full bg-black/50 border border-white/20 backdrop-blur-sm flex items-center justify-center shadow-xl">
                            <Play className="w-5 h-5 text-white fill-white ml-0.5" />
                          </div>
                        </div>
                        <div className="absolute bottom-2 left-2 right-2 flex items-end justify-between">
                          {video.duration && (
                            <div className="flex items-center gap-1 bg-black/70 rounded-lg px-1.5 py-0.5">
                              <Clock className="w-2.5 h-2.5 text-white/50" />
                              <span className="text-[9px] text-white/80 font-bold">{video.duration}</span>
                            </div>
                          )}
                          {video.quality && (
                            <div className="bg-pink-600/80 rounded-lg px-1.5 py-0.5">
                              <span className="text-[9px] text-white font-black">{video.quality}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <p className="text-[10px] text-white/80 font-semibold line-clamp-2 leading-snug px-0.5">{video.title}</p>
                    </motion.div>
                  ))}
                </div>
                <button
                  onClick={() => setSearchPage(p => p + 1)}
                  disabled={isSearchFetching}
                  className="w-full mt-6 py-4 rounded-2xl bg-white/5 border border-white/8 text-white/50 text-sm font-bold active:scale-95 transition-all disabled:opacity-40"
                >
                  {isSearchFetching ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white/80 rounded-full animate-spin" />
                      Loading…
                    </span>
                  ) : "Load More"}
                </button>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <Shield className="w-16 h-16 text-pink-500/20 mb-4" />
                <p className="text-white/25 text-sm font-bold mb-1">No results found</p>
                <p className="text-white/15 text-xs">Try a different search term</p>
              </div>
            )}
          </div>
        ) : (
          /* ── Category Rows Mode ───────────────────────────────────────── */
          <div className="mt-2">
            {ADULT_CATEGORIES.map((cat, index) => (
              <div key={cat.id}>
                <CategoryRow
                  label={cat.label}
                  icon={cat.icon}
                  query={cat.query}
                  ageConfirmed={ageConfirmed}
                  onVideoClick={handleVideoClick}
                />
                {/* 320×50 banner ad after categories 2, 4, and 8 (index 1, 3, 7) */}
                {AD_AFTER_INDICES.has(index) && (
                  <BannerAd320x50 ad={bannerAds[index]} />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Entry fullscreen interstitial */}
      {showFullscreenAd && (
        <FullScreenInterstitialAd ad={fullscreenAd} onClose={() => setShowFullscreenAd(false)} />
      )}

      {/* Video Detail Sheet */}
      <AnimatePresence>
        {detailVideoId && !playerDetail && (
          <VideoDetailSheet
            videoId={detailVideoId}
            videoUrl={detailVideoUrl}
            thumbFallback={detailThumb}
            titleFallback={detailTitle}
            onClose={() => setDetailVideoId(null)}
            onPlay={(detail) => setPlayerDetail(detail)}
          />
        )}
      </AnimatePresence>

      {/* In-app Video.js Player */}
      <AnimatePresence>
        {playerDetail && (
          <VideoPlayer
            sources={playerDetail.sources}
            poster={playerDetail.thumb}
            title={playerDetail.title}
            onClose={() => setPlayerDetail(null)}
            showMidrollAd={true}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
