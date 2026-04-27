import { useRoute, useLocation } from "wouter";
import { VideoPlayer, type VideoSource } from "@/components/VideoPlayer";
import IntroPlayer from "@/components/IntroPlayer";
import { useQuery } from "@tanstack/react-query";
import { type Movie, type Episode } from "@shared/schema";
import { Loader2, Film, AlertTriangle } from "lucide-react";
import { useState } from "react";

export default function Stream() {
  const [matchMovie, movieParams] = useRoute("/app/stream/movie/:id");
  const [matchEpisode, episodeParams] = useRoute("/app/stream/episode/:id");
  const [, setLocation] = useLocation();
  const [introDone, setIntroDone] = useState(false);

  const type = matchMovie ? "movie" : matchEpisode ? "episode" : null;
  const id = matchMovie
    ? parseInt(movieParams?.id || "0")
    : matchEpisode
    ? parseInt(episodeParams?.id || "0")
    : 0;

  const { data: movie, isLoading: movieLoading } = useQuery<Movie>({
    queryKey: [`/api/movies/${id}`],
    enabled: type === "movie" && id > 0,
  });

  const { data: episode, isLoading: episodeLoading } = useQuery<Episode>({
    queryKey: [`/api/episodes/${id}`],
    enabled: type === "episode" && id > 0,
  });

  const { data: parentMovie } = useQuery<Movie>({
    queryKey: [`/api/movies/${episode?.movieId}`],
    enabled: !!episode?.movieId,
  });

  const { data: introConfig } = useQuery<{ hasVideo: boolean }>({
    queryKey: ["/api/intro/config"],
    staleTime: 60000,
  });

  // Pre-flight check: verify the stream endpoint is available
  const { data: hlsCheck, isLoading: hlsChecking } = useQuery<{ ok: boolean; message?: string }>({
    queryKey: [`/api/stream/${type}/${id}`, "preflight"],
    enabled: !!type && id > 0,
    queryFn: async () => {
      const res = await fetch(`/api/stream/${type}/${id}`, {
        headers: { Range: "bytes=0-0" },
      });
      if (res.status === 206 || res.status === 200) return { ok: true };
      const body = await res.json().catch(() => ({ message: "Failed to load stream" }));
      return { ok: false, message: body.message || "Failed to load stream" };
    },
    retry: false,
    staleTime: 0,
  });

  const isLoading = type === "movie" ? movieLoading : episodeLoading;

  if (!type || !id) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-white/50 text-sm">Invalid stream URL</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
      </div>
    );
  }

  // Skip preflight error if we have external URL sources (m3u8 / MP4) to fall back on
  const hasExternalSourcesEarly = ((): boolean => {
    const pUrl = type === "movie" ? (movie as any)?.streamUrl : (episode as any)?.streamUrl;
    if (pUrl && /^https?:\/\//i.test(pUrl)) return true;
    const qUrls = type === "movie" ? (movie as any)?.qualityUrls : null;
    if (Array.isArray(qUrls) && qUrls.some((s: any) => s?.url)) return true;
    return false;
  })();

  // Show a clear error if the stream endpoint returned an error
  if (hlsCheck && !hlsCheck.ok && !hasExternalSourcesEarly) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-5 px-6">
        <div className="w-20 h-20 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center">
          <Film className="w-8 h-8 text-white/20" />
        </div>
        <div className="flex flex-col items-center gap-2 max-w-sm text-center">
          <div className="flex items-center gap-2 text-yellow-400">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm font-bold uppercase tracking-wider">Stream Unavailable</span>
          </div>
          <p className="text-white/50 text-sm leading-relaxed" data-testid="stream-error-message">
            {hlsCheck.message}
          </p>
        </div>
        <button
          data-testid="stream-back-button"
          onClick={() => {
            if (window.history.length > 1) window.history.back();
            else setLocation("/app");
          }}
          className="mt-2 px-5 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white/70 text-sm font-medium transition-colors"
        >
          Go Back
        </button>
      </div>
    );
  }

  const title =
    type === "movie"
      ? movie?.title
      : episode
      ? `${parentMovie?.title || "Series"} — S${episode.seasonNumber}E${episode.episodeNumber}${episode.title ? `: ${episode.title}` : ""}`
      : undefined;

  function buildPoster(m: any): string | undefined {
    if (!m) return undefined;
    if (m.posterUrl) return m.posterUrl;
    if (m.posterPath) return `https://image.tmdb.org/t/p/w780${m.posterPath}`;
    return undefined;
  }
  const poster = type === "movie" ? buildPoster(movie) : buildPoster(parentMovie);

  // Build sources: prefer qualityUrls array from movie; always include base stream
  const sources: VideoSource[] = [];

  // Helper: auto-detect video type from URL
  function detectType(url: string): "mp4" | "hls" {
    return /\.m3u8(\?|$)/i.test(url) ? "hls" : "mp4";
  }

  // 1. Primary stream URL (manually set by admin — supports m3u8 / MP4 / HLS)
  const primaryUrl = type === "movie" ? (movie as any)?.streamUrl : (episode as any)?.streamUrl;
  if (primaryUrl && /^https?:\/\//i.test(primaryUrl)) {
    sources.push({
      label: type === "movie" ? (movie?.quality || "HD") : "HD",
      url: primaryUrl,
      type: detectType(primaryUrl),
    });
  }

  // 2. qualityUrls array (multi-quality sources)
  const qualityUrlsRaw = type === "movie" ? (movie as any)?.qualityUrls : null;
  if (Array.isArray(qualityUrlsRaw) && qualityUrlsRaw.length > 0) {
    qualityUrlsRaw.forEach((src: { label: string; fileId?: string; url?: string; type?: "mp4" | "hls" }) => {
      if (!src?.label) return;
      if (src.fileId) {
        // Telegram File ID mode — stream via /api/stream/telegram/:fileId
        sources.push({ label: src.label, url: `/api/stream/telegram/${src.fileId}`, type: "mp4" });
      } else if (src.url) {
        // External URL mode — auto-detect hls/mp4 if type not set
        sources.push({ label: src.label, url: src.url, type: src.type || detectType(src.url) });
      }
    });
  }

  // 3. Built-in MP4 stream (Telegram-backed, range-served via MTProto).
  sources.push({
    label: sources.length > 0 ? "Auto" : (type === "movie" ? movie?.quality || "HD" : "HD"),
    url: `/api/stream/${type}/${id}`,
    type: "mp4",
  });

  // If there are external URL sources, don't block playback on preflight failure
  const hasExternalSources = sources.slice(0, -1).some(s => s.url.startsWith("http"));

  const showIntro = introConfig?.hasVideo && !introDone;

  return (
    <>
      {showIntro && (
        <IntroPlayer onDone={() => setIntroDone(true)} />
      )}
      {!showIntro && (
        <VideoPlayer
          sources={sources}
          poster={poster}
          title={title}
          saveProgressMovieId={type === "movie" ? id : episode?.movieId}
          onClose={() => {
            if (type === "movie") {
              setLocation(`/app/movie/${id}`);
            } else if (episode?.movieId) {
              setLocation(`/app/movie/${episode.movieId}`);
            } else {
              setLocation("/app");
            }
          }}
        />
      )}
    </>
  );
}
