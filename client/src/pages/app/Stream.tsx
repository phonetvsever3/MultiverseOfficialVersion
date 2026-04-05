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

  const isLoading = (type === "movie" ? movieLoading : episodeLoading) || hlsChecking;

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

  // Show a clear error if the stream endpoint returned an error
  if (hlsCheck && !hlsCheck.ok) {
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

  const poster =
    type === "movie"
      ? movie?.posterPath
        ? `https://image.tmdb.org/t/p/w780${movie.posterPath}`
        : undefined
      : parentMovie?.posterPath
      ? `https://image.tmdb.org/t/p/w780${parentMovie.posterPath}`
      : undefined;

  // Build sources: prefer qualityUrls array from movie; always include base stream
  const sources: VideoSource[] = [];
  const qualityUrlsRaw = type === "movie" ? (movie as any)?.qualityUrls : null;
  if (Array.isArray(qualityUrlsRaw) && qualityUrlsRaw.length > 0) {
    qualityUrlsRaw.forEach((src: { label: string; fileId?: string; url?: string; type?: "mp4" | "hls" }) => {
      if (!src?.label) return;
      if (src.fileId) {
        // Telegram File ID mode — stream via /api/stream/telegram/:fileId
        sources.push({ label: src.label, url: `/api/stream/telegram/${src.fileId}`, type: "mp4" });
      } else if (src.url) {
        // External URL mode
        sources.push({ label: src.label, url: src.url, type: src.type || "mp4" });
      }
    });
  }
  // Always include the built-in Telegram/HLS stream as a quality option
  sources.push({
    label: sources.length > 0 ? "Auto" : (type === "movie" ? movie?.quality || "HD" : "HD"),
    url: `/api/stream/${type}/${id}`,
    type: "mp4",
  });

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
          onClose={() => {
            if (window.history.length > 1) {
              window.history.back();
            } else {
              setLocation("/app");
            }
          }}
        />
      )}
    </>
  );
}
