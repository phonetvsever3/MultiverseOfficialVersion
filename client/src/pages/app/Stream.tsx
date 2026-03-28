import { useRoute, useLocation } from "wouter";
import { VideoPlayer, type VideoSource } from "@/components/VideoPlayer";
import { useQuery } from "@tanstack/react-query";
import { type Movie, type Episode } from "@shared/schema";
import { Loader2 } from "lucide-react";

export default function Stream() {
  const [matchMovie, movieParams] = useRoute("/app/stream/movie/:id");
  const [matchEpisode, episodeParams] = useRoute("/app/stream/episode/:id");
  const [, setLocation] = useLocation();

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

  const sources: VideoSource[] = [
    {
      label: "HLS Stream",
      url: `/api/hls/${type}/${id}/playlist.m3u8`,
      type: "hls",
    },
  ];

  return (
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
      showPrerollAd
      showMidrollAd
    />
  );
}
