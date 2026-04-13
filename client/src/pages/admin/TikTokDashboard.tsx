import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { AdminSidebar } from "@/components/AdminSidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import {
  Plus, Pencil, Trash2, Video, Clock, CheckCircle,
  Search, Clapperboard, Music2, Zap, Film, Eye,
  Send, ChevronRight, Loader2, Play, AlertCircle,
} from "lucide-react";
import type { TiktokProject } from "@shared/schema";
import { useState, useEffect, useRef } from "react";

type MusicStyle = "cinematic" | "action" | "drama" | "mystery";

interface Movie {
  id: number;
  title: string;
  type: string;
  posterPath?: string;
  genre?: string;
  releaseDate?: string;
  rating?: number;
  quality?: string;
}

// ── Scene badge ──────────────────────────────────────────────────────────────

function SceneBadge({
  num, label, color, time, desc,
}: { num: string; label: string; color: string; time: string; desc: string }) {
  return (
    <div
      className="flex-1 rounded-xl p-3 flex flex-col gap-1 border min-w-0"
      style={{ borderColor: `${color}30`, background: `${color}10` }}
    >
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="text-[9px] font-black tracking-widest flex-shrink-0 leading-none px-1.5 py-0.5 rounded"
            style={{ color, background: `${color}22` }}
          >
            S{num}
          </span>
          <span className="text-[10px] font-bold truncate" style={{ color }}>{label}</span>
        </div>
        <span className="text-[9px] text-muted-foreground flex-shrink-0">{time}</span>
      </div>
      <p className="text-[10px] text-muted-foreground leading-snug line-clamp-2">{desc}</p>
    </div>
  );
}

// ── Scene structure preview ───────────────────────────────────────────────────

function ScenePreview({ movie, trailerKey, trailerLoading, clipPercent }: {
  movie: Movie;
  trailerKey?: string | null;
  trailerLoading?: boolean;
  clipPercent?: number;
}) {
  const genre = movie.genre
    ? movie.genre.split(",").map((g: string) => g.trim()).slice(0, 3).join(" · ")
    : "ACTION · DRAMA · THRILLER";

  const pct1 = clipPercent !== undefined ? Math.round(clipPercent * 100) : 42;
  const pct2 = Math.min(pct1 + 20, 90);
  const pct3 = Math.min(pct2 + 15, 95);
  const clip1Desc = trailerLoading
    ? "Fetching trailer from TMDB…"
    : trailerKey
      ? `Clip 1 @ ${pct1}% — real audio + "NOW STREAMING"`
      : "No trailer found — animated poster zoom";
  const clip2Desc = trailerLoading
    ? "Fetching trailer…"
    : trailerKey
      ? `Clip 2 @ ${pct2}% — real audio + "WATCH NOW"`
      : "Animated poster zoom (fallback)";
  const clip3Desc = trailerLoading
    ? "Fetching trailer…"
    : trailerKey
      ? `Clip 3 @ ${pct3}% — real audio + "MUST SEE"`
      : "Animated poster zoom (fallback)";

  return (
    <div className="rounded-2xl border border-border/40 bg-card/60 p-4 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Film className="w-3.5 h-3.5 text-muted-foreground" />
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          6-Scene · ~37 sec · Cinematic XFade Transitions
        </p>
      </div>

      {/* Scene 1: Hook + Poster combined */}
      <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-2 space-y-1">
        <p className="text-[10px] font-bold text-yellow-400 uppercase tracking-wider">Scene 1 — Hook + Poster Reveal · 9 s</p>
        <div className="grid grid-cols-2 gap-1.5">
          <SceneBadge
            num="1a" label="HOOK" color="#E50914" time="0–5 s"
            desc={`"${movie.title.toUpperCase()}" · blurred BG · gold animated title`}
          />
          <SceneBadge
            num="1b" label="POSTER" color="#F59E0B" time="5–9 s"
            desc="Full-screen poster · gold frame · genre badge · 0.2s dissolve"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        <SceneBadge
          num="2" label="CLIP 1" color="#3B82F6" time="~9–15 s"
          desc={clip1Desc}
        />
        <SceneBadge
          num="3" label="CLIP 2" color="#8B5CF6" time="~15–21 s"
          desc={clip2Desc}
        />
        <SceneBadge
          num="4" label="CLIP 3" color="#00D4FF" time="~21–27 s"
          desc={clip3Desc}
        />
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <SceneBadge
          num="5" label="INFO" color="#22C55E" time="~27–34 s"
          desc={`${genre} · cast · rating — glass card`}
        />
        <SceneBadge
          num="6" label="CTA PRO" color="#EAB308" time="~34–37 s"
          desc="Platform badge · pulsing button · FOMO strip · social proof"
        />
      </div>

      {/* Transition effect legend */}
      <div className="flex flex-wrap gap-1.5 text-[9px]">
        {[
          { label: "Hook→Poster", fx: "dissolve", color: "yellow" },
          { label: "Poster→Clip1", fx: "fade-black", color: "red" },
          { label: "Clip1→Clip2", fx: "slide-left", color: "blue" },
          { label: "Clip2→Clip3", fx: "slide-right", color: "purple" },
          { label: "Clip3→Info", fx: "smooth-left", color: "cyan" },
          { label: "Info→CTA", fx: "circle-open", color: "yellow" },
        ].map(t => (
          <span key={t.label} className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-white/50 font-mono">
            {t.label} <span className="text-white/30">→</span> <span className="text-white/70">{t.fx}</span>
          </span>
        ))}
      </div>

      {/* Trailer preview embed */}
      {trailerKey && (
        <div className="mt-1 space-y-1.5">
          <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
            <Play className="w-3 h-3 fill-current" /> Trailer Preview — used in Scenes 2, 3 &amp; 4 (6/6/6)
          </p>
          <div className="relative w-full rounded-xl overflow-hidden bg-black border border-blue-500/20" style={{ paddingBottom: "56.25%" }}>
            <img
              src={`https://img.youtube.com/vi/${trailerKey}/mqdefault.jpg`}
              alt="Trailer thumbnail"
              className="absolute inset-0 w-full h-full object-cover opacity-80"
            />
            <a
              href={`https://www.youtube.com/watch?v=${trailerKey}`}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute inset-0 flex items-center justify-center group"
            >
              <div className="w-12 h-12 rounded-full bg-red-600/90 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                <Play className="w-5 h-5 text-white fill-white ml-0.5" />
              </div>
            </a>
          </div>
          <div className="flex gap-2 text-[10px] text-muted-foreground">
            <span className="flex-1 text-center px-2 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
              Clip 1 @ {pct1}%
            </span>
            <span className="flex-1 text-center px-2 py-1 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400">
              Clip 2 @ {pct2}%
            </span>
            <span className="flex-1 text-center px-2 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              Clip 3 @ {pct3}%
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground text-center">All 3 clips include real audio (6/6/6) · Music plays under at 30% volume</p>
        </div>
      )}

      {!trailerLoading && !trailerKey && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
          <AlertCircle className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0" />
          <p className="text-[11px] text-yellow-400">No YouTube trailer found — Scenes 3, 4 &amp; 5 will use animated poster zoom instead.</p>
        </div>
      )}
    </div>
  );
}

// ── Music style picker ───────────────────────────────────────────────────────

const MUSIC_STYLES: {
  id: MusicStyle; label: string; desc: string; color: string; Icon: any;
}[] = [
  { id: "cinematic", label: "Cinematic", desc: "Am·F·C·G — epic & sweeping",   color: "#a855f7", Icon: Film  },
  { id: "action",    label: "Action",    desc: "Dm·Bb·F·C — intense & driven",  color: "#E50914", Icon: Zap   },
  { id: "drama",     label: "Drama",     desc: "Em·C·G·Am — emotional arc",    color: "#3B82F6", Icon: Eye   },
  { id: "mystery",   label: "Mystery",   desc: "Am·E·Dm·Am — dark & tense",    color: "#22C55E", Icon: Music2 },
];

// ── Movie search + picker ────────────────────────────────────────────────────

function MoviePicker({
  selected, onSelect,
}: { selected: Movie | null; onSelect: (m: Movie | null) => void }) {
  const [q, setQ]         = useState("");
  const [open, setOpen]   = useState(false);
  const wrapRef           = useRef<HTMLDivElement>(null);
  const TMDB              = "https://image.tmdb.org/t/p/w92";

  const { data: results = [], isFetching } = useQuery<{ items: Movie[] }>({
    queryKey: ["/api/movies", q],
    queryFn: async () => {
      const url = `/api/movies?search=${encodeURIComponent(q)}&limit=12`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to search movies");
      return res.json();
    },
    enabled: open && q.trim().length > 0,
    staleTime: 10_000,
  });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const movies: Movie[] = (results as any)?.items ?? (Array.isArray(results) ? results : []);
  const posterUrl = (p?: string) =>
    !p ? null : p.startsWith("http") ? p : `${TMDB}${p}`;

  return (
    <div ref={wrapRef} className="space-y-2">
      {selected ? (
        <div className="flex items-center gap-3 p-3 rounded-xl border border-border/50 bg-background/50">
          {posterUrl(selected.posterPath) ? (
            <img
              src={posterUrl(selected.posterPath)!}
              alt=""
              className="w-10 h-14 object-cover rounded-lg flex-shrink-0"
            />
          ) : (
            <div className="w-10 h-14 bg-muted rounded-lg flex items-center justify-center flex-shrink-0">
              <Clapperboard className="w-4 h-4 text-muted-foreground" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-foreground truncate">{selected.title}</p>
            <p className="text-xs text-muted-foreground">
              {[selected.genre?.split(",")[0], selected.releaseDate?.split("-")[0]].filter(Boolean).join(" · ")}
            </p>
          </div>
          <button
            data-testid="button-clear-movie"
            onClick={() => { onSelect(null); setQ(""); }}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-muted"
          >
            Change
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            data-testid="input-movie-search"
            value={q}
            onChange={e => { setQ(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder="Search movies or series…"
            className="pl-9 bg-background/50 text-sm"
          />
          {isFetching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
          )}
          {open && movies.length > 0 && (
            <div className="absolute top-full mt-1 left-0 right-0 z-50 bg-card border border-border/50 rounded-xl shadow-xl overflow-hidden max-h-64 overflow-y-auto">
              {movies.map(m => (
                <button
                  key={m.id}
                  data-testid={`button-movie-${m.id}`}
                  onClick={() => { onSelect(m); setOpen(false); setQ(""); }}
                  className="flex items-center gap-3 w-full px-3 py-2.5 text-left hover:bg-muted/60 transition-colors border-b border-border/20 last:border-0"
                >
                  {posterUrl(m.posterPath) ? (
                    <img
                      src={posterUrl(m.posterPath)!}
                      alt=""
                      className="w-7 h-10 object-cover rounded flex-shrink-0"
                    />
                  ) : (
                    <div className="w-7 h-10 bg-muted rounded flex items-center justify-center flex-shrink-0">
                      <Clapperboard className="w-3 h-3 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{m.title}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {[m.type === "series" ? "Series" : "Movie", m.releaseDate?.split("-")[0]].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Generator card ───────────────────────────────────────────────────────────

interface TrailerInfo { key: string; site: string; name: string; }

const CLIP_POSITIONS = [
  { id: 0.10, label: "Beginning",  desc: "Start of trailer — intro / title",    color: "#a855f7" },
  { id: 0.42, label: "Action",     desc: "Middle (42%) — peak action section",  color: "#E50914" },
  { id: 0.65, label: "Climax",     desc: "Late (65%) — climax / money shot",    color: "#f97316" },
  { id: 0.80, label: "Final",      desc: "End (80%) — final reveal / title",    color: "#EAB308" },
];

function GeneratorCard() {
  const { toast }                     = useToast();
  const [movie, setMovie]             = useState<Movie | null>(null);
  const [style, setStyle]             = useState<MusicStyle>("cinematic");
  const [clipPercent, setClipPercent] = useState<number>(0.42);
  const [customAudioUrl, setCustomAudioUrl] = useState("");
  const [channelHandle, setChannelHandle]   = useState("MultiverseMovies_Bot");

  const { data: trailerData, isLoading: trailerLoading } = useQuery<TrailerInfo | null>({
    queryKey: [`/api/movies/${movie?.id}/trailer`],
    enabled: !!movie?.id,
    staleTime: 60_000,
  });

  const sendMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/admin/tiktok/send-promo/${movie!.id}?style=${style}`, {
        clipPercent,
        customAudioUrl: customAudioUrl.trim() || undefined,
        channelHandle: channelHandle.trim() || "MULTIVERSE",
      }),
    onSuccess: () => {
      toast({ title: "Sent!", description: `Pro promo video sent to Telegram for "${movie!.title}"` });
    },
    onError: (e: any) =>
      toast({ title: "Error", description: e.message || "Failed to send promo", variant: "destructive" }),
  });

  const selectedClip = CLIP_POSITIONS.find(c => c.id === clipPercent) ?? CLIP_POSITIONS[1];

  return (
    <div className="rounded-2xl border border-[#ff0050]/20 bg-gradient-to-br from-[#ff0050]/5 via-card to-card p-5 space-y-5">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#ff0050]/10 flex items-center justify-center">
          <Video className="w-5 h-5 text-[#ff0050]" />
        </div>
        <div>
          <h2 className="font-bold text-foreground">Movie Promo Generator</h2>
          <p className="text-xs text-muted-foreground">
            Generates a 30-second cinematic video (Hook · Clip 1 · Clip 2 · Info · CTA) and sends to Telegram
          </p>
        </div>
      </div>

      {/* Movie picker */}
      <div className="space-y-1.5">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Select Movie / Series</p>
        <MoviePicker selected={movie} onSelect={setMovie} />
      </div>

      {/* Trailer clip position */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Film className="w-3.5 h-3.5" /> Trailer Clip Position
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {CLIP_POSITIONS.map(pos => (
            <button
              key={pos.id}
              data-testid={`button-clip-${pos.label.toLowerCase()}`}
              onClick={() => setClipPercent(pos.id)}
              className={`p-3 rounded-xl border text-left transition-all ${
                clipPercent === pos.id
                  ? "border-blue-500 bg-blue-500/5"
                  : "border-border/40 hover:border-border/60"
              }`}
            >
              <span
                className="text-[9px] font-black tracking-widest px-1.5 py-0.5 rounded mb-1.5 inline-block"
                style={{ background: `${pos.color}22`, color: pos.color }}
              >
                {Math.round(pos.id * 100)}%
              </span>
              <p className="text-xs font-semibold text-foreground">{pos.label}</p>
              <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">{pos.desc}</p>
            </button>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground">
          Clip starts at <span className="font-bold text-blue-400">{Math.round(clipPercent * 100)}%</span> into the trailer — picks the most exciting {selectedClip.label.toLowerCase()} moment.
        </p>
      </div>

      {/* Scene structure preview with auto trailer */}
      {movie && (
        <ScenePreview
          movie={movie}
          trailerKey={trailerData?.key ?? null}
          trailerLoading={trailerLoading}
          clipPercent={clipPercent}
        />
      )}

      {/* Audio: generated music OR custom URL */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Music2 className="w-3.5 h-3.5" /> Audio Track
        </p>

        {/* Custom audio URL */}
        <div className="space-y-1.5">
          <p className="text-[10px] text-muted-foreground">Paste a direct MP3 link or YouTube music URL to use as background audio (overrides generated music):</p>
          <Input
            data-testid="input-custom-audio-url"
            value={customAudioUrl}
            onChange={e => setCustomAudioUrl(e.target.value)}
            placeholder="https://... MP3 URL  or  youtube.com/watch?v=..."
            className="text-xs bg-background/50 font-mono"
          />
          {customAudioUrl.trim() && (
            <div className="flex items-center gap-1.5 text-[10px] text-green-400">
              <CheckCircle className="w-3 h-3" /> Custom audio will be used instead of generated music
            </div>
          )}
        </div>

        {/* Generated music style (shown when no custom audio) */}
        {!customAudioUrl.trim() && (
          <>
            <p className="text-[10px] text-muted-foreground">Or choose a generated music style:</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {MUSIC_STYLES.map(({ id, label, desc, color, Icon }) => (
                <button
                  key={id}
                  data-testid={`button-style-${id}`}
                  onClick={() => setStyle(id)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    style === id
                      ? "border-[#ff0050] bg-[#ff0050]/5"
                      : "border-border/40 hover:border-border/60"
                  }`}
                >
                  <Icon className="w-4 h-4 mb-1.5" style={{ color }} />
                  <p className="text-xs font-semibold text-foreground">{label}</p>
                  <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">{desc}</p>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Channel handle */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <span className="text-[#FFD700]">✦</span> Channel Branding
        </p>
        <p className="text-[10px] text-muted-foreground">
          This name appears in the video overlays — "Available on @…" and "Watch on @…"
        </p>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-[#FFD700] shrink-0">@</span>
          <Input
            data-testid="input-channel-handle"
            value={channelHandle}
            onChange={e => setChannelHandle(e.target.value.replace(/^@/, ""))}
            placeholder="MULTIVERSE"
            className="text-sm bg-background/50 font-mono font-bold tracking-wider"
          />
        </div>
        {channelHandle.trim() && (
          <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
            <span className="bg-black/30 px-2 py-1 rounded text-yellow-400/80 border border-yellow-400/20 font-mono">
              Available on @{channelHandle.trim().toUpperCase()}
            </span>
            <span className="bg-black/30 px-2 py-1 rounded text-yellow-400/80 border border-yellow-400/20 font-mono">
              Watch on @{channelHandle.trim().toUpperCase()}
            </span>
          </div>
        )}
      </div>

      {/* Generate button */}
      <Button
        data-testid="button-generate-promo"
        className="w-full gap-2 bg-[#ff0050] hover:bg-[#cc0040] text-white"
        disabled={!movie || sendMutation.isPending}
        onClick={() => sendMutation.mutate()}
      >
        {sendMutation.isPending ? (
          <><Loader2 className="w-4 h-4 animate-spin" />Rendering & Sending…</>
        ) : (
          <><Send className="w-4 h-4" />Generate &amp; Send to Telegram</>
        )}
      </Button>
      {sendMutation.isPending && (
        <p className="text-[11px] text-muted-foreground text-center -mt-3">
          This takes ~90–180 s — trailer download + 6 scenes + 6 xfade transitions…
        </p>
      )}
    </div>
  );
}

// ── Script project card ──────────────────────────────────────────────────────

function ProjectCard({ project, onEdit, onDelete }: {
  project: TiktokProject;
  onEdit:  () => void;
  onDelete: () => void;
}) {
  const bg = project.backgroundStyle === "gradient"
    ? `linear-gradient(135deg, ${project.gradientFrom}, ${project.gradientTo})`
    : project.backgroundColor;

  return (
    <div
      data-testid={`card-tiktok-${project.id}`}
      className="group relative rounded-2xl border border-border/40 bg-card overflow-hidden transition-all duration-200 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
    >
      <div className="flex gap-4 p-4">
        <div
          className="relative flex-shrink-0 rounded-xl overflow-hidden shadow-md"
          style={{ width: 60, height: 106, background: bg }}
        >
          <div className="absolute inset-0 flex flex-col items-center justify-between p-2">
            {project.showEmoji && project.hookEmoji && (
              <span className="text-lg leading-none">{project.hookEmoji}</span>
            )}
            <p
              className="leading-tight line-clamp-3 break-all text-center"
              style={{ color: project.textColor, fontSize: 6, fontWeight: project.fontWeight as any }}
            >
              {project.hookText || "Hook text..."}
            </p>
            <p
              className="leading-tight text-center break-all line-clamp-2"
              style={{ color: project.accentColor, fontSize: 5, fontWeight: "bold" }}
            >
              {project.ctaText}
            </p>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h3 data-testid={`text-title-${project.id}`} className="font-semibold text-foreground truncate">
              {project.title}
            </h3>
            <Badge
              variant={project.status === "ready" ? "default" : "secondary"}
              className="flex-shrink-0 text-[10px]"
            >
              {project.status === "ready" ? (
                <><CheckCircle className="w-3 h-3 mr-1" />Ready</>
              ) : (
                <><Clock className="w-3 h-3 mr-1" />Draft</>
              )}
            </Badge>
          </div>

          {project.niche && (
            <p className="text-xs text-muted-foreground mb-2">#{project.niche}</p>
          )}
          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
            {project.hookText || <span className="italic opacity-50">No hook text yet</span>}
          </p>
          {Array.isArray(project.bodyPoints) && project.bodyPoints.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {project.bodyPoints.length} body point{project.bodyPoints.length !== 1 ? "s" : ""}
            </p>
          )}
          <p className="text-[10px] text-muted-foreground/50 mt-2">
            {new Date(project.createdAt!).toLocaleDateString()}
          </p>
        </div>
      </div>

      <div className="flex border-t border-border/30">
        <button
          data-testid={`button-edit-${project.id}`}
          onClick={onEdit}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-medium text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors"
        >
          <Pencil className="w-3.5 h-3.5" />Edit
        </button>
        <div className="w-px bg-border/30" />
        <button
          data-testid={`button-delete-${project.id}`}
          onClick={onDelete}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-medium text-muted-foreground hover:text-red-400 hover:bg-red-500/5 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />Delete
        </button>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function TikTokDashboard() {
  const [, navigate] = useLocation();
  const { toast }    = useToast();

  const { data: projects = [], isLoading } = useQuery<TiktokProject[]>({
    queryKey: ["/api/admin/tiktok/projects"],
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/admin/tiktok/projects", {
        title: "New TikTok Script",
        hookText: "", hookEmoji: "🔥", bodyPoints: [],
        ctaText: "Follow for more!",
        backgroundStyle: "gradient",
        gradientFrom: "#1a1a2e", gradientTo: "#16213e",
        backgroundColor: "#0a0a0a", textColor: "#ffffff",
        accentColor: "#ff0050", hookFontSize: 52, bodyFontSize: 26,
        ctaFontSize: 30, fontWeight: "bold", textAlign: "center",
        showEmoji: true, overlayStyle: "none", status: "draft",
      }),
    onSuccess: async (res) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tiktok/projects"] });
      navigate(`/admin/tiktok/editor/${data.id}`);
    },
    onError: () => toast({ title: "Error", description: "Failed to create project", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/tiktok/projects/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tiktok/projects"] });
      toast({ title: "Deleted", description: "Project deleted" });
    },
    onError: () => toast({ title: "Error", description: "Failed to delete", variant: "destructive" }),
  });

  return (
    <div className="flex min-h-screen bg-background">
      <AdminSidebar />
      <main className="flex-1 md:ml-64 p-6">
        <div className="max-w-5xl mx-auto space-y-8">

          {/* Page header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#ff0050]/10 flex items-center justify-center">
                  <Video className="w-5 h-5 text-[#ff0050]" />
                </div>
                TikTok Generator
              </h1>
              <p className="text-muted-foreground mt-1 text-sm">
                Auto-generate 15-sec cinematic movie promos (Hook · Trailer · Highlight · CTA)
              </p>
            </div>
          </div>

          {/* ── Movie Promo Generator ────────────────────────────────── */}
          <GeneratorCard />

          {/* ── Script Projects ──────────────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-bold text-foreground">Script Projects</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Manual Hook · Body · Point · CTA scripts with live preview
                </p>
              </div>
              <Button
                data-testid="button-new-project"
                variant="outline"
                size="sm"
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending}
                className="gap-2"
              >
                <Plus className="w-4 h-4" />
                New Script
              </Button>
            </div>

            {isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-48 rounded-2xl bg-card animate-pulse border border-border/40" />
                ))}
              </div>
            ) : projects.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed border-border/40 rounded-2xl">
                <div className="w-14 h-14 rounded-full bg-[#ff0050]/10 flex items-center justify-center mb-3">
                  <Video className="w-7 h-7 text-[#ff0050]" />
                </div>
                <h3 className="text-base font-semibold text-foreground mb-1">No scripts yet</h3>
                <p className="text-muted-foreground text-sm mb-5 max-w-sm">
                  Build a fully custom TikTok script with Hook, Body, Point & CTA — with live 9:16 preview.
                </p>
                <Button
                  data-testid="button-create-first"
                  onClick={() => createMutation.mutate()}
                  disabled={createMutation.isPending}
                  className="gap-2"
                >
                  <Plus className="w-4 h-4" />Create First Script
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {projects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    onEdit={() => navigate(`/admin/tiktok/editor/${project.id}`)}
                    onDelete={() => deleteMutation.mutate(project.id)}
                  />
                ))}
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}
