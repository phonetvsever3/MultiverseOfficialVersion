import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminSidebar } from "@/components/AdminSidebar";
import { ChevronDown, ChevronRight, AlertTriangle, CheckCircle, Upload, Search, RefreshCw } from "lucide-react";

const TMDB_IMAGE = "https://image.tmdb.org/t/p/";

interface SeasonGap {
  season: number;
  uploaded: number[];
  noFile: number[];
  gapsInRange: number[];
  missing: number[];
  total: number;
}

interface SeriesGap {
  id: number;
  title: string;
  posterPath: string | null;
  tmdbId: number | null;
  seasons: SeasonGap[];
  totalMissing: number;
}

function EpBadge({ num, type }: { num: number; type: "uploaded" | "missing" | "nofile" }) {
  const cls =
    type === "uploaded"
      ? "bg-green-500/20 text-green-400 border-green-500/30"
      : type === "nofile"
      ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
      : "bg-red-500/20 text-red-400 border-red-500/30";
  return (
    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border text-[11px] font-bold ${cls}`}>
      {num}
    </span>
  );
}

function SeasonRow({ season }: { season: SeasonGap }) {
  const [open, setOpen] = useState(true);
  const hasMissing = season.missing.length > 0;
  return (
    <div className="border border-border rounded-xl overflow-hidden mb-2">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-card hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-3">
          {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          <span className="font-bold text-sm text-foreground">Season {season.season}</span>
          <span className="text-xs text-muted-foreground">
            {season.uploaded.length} uploaded / {season.total} total ep range
          </span>
        </div>
        <div className="flex items-center gap-2">
          {hasMissing ? (
            <span className="flex items-center gap-1 text-xs font-bold text-red-400 bg-red-500/10 px-2 py-1 rounded-lg">
              <AlertTriangle className="w-3 h-3" /> {season.missing.length} missing
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs font-bold text-green-400 bg-green-500/10 px-2 py-1 rounded-lg">
              <CheckCircle className="w-3 h-3" /> Complete
            </span>
          )}
        </div>
      </button>
      {open && (
        <div className="px-4 py-3 border-t border-border bg-black/20 space-y-3">
          {season.uploaded.length > 0 && (
            <div>
              <p className="text-[11px] text-green-400/70 font-bold uppercase tracking-wider mb-2 flex items-center gap-1">
                <Upload className="w-3 h-3" /> Uploaded ({season.uploaded.length})
              </p>
              <div className="flex flex-wrap gap-1">
                {season.uploaded.map(n => <EpBadge key={n} num={n} type="uploaded" />)}
              </div>
            </div>
          )}
          {season.noFile.length > 0 && (
            <div>
              <p className="text-[11px] text-yellow-400/70 font-bold uppercase tracking-wider mb-2">
                Metadata Only — No File ({season.noFile.length})
              </p>
              <div className="flex flex-wrap gap-1">
                {season.noFile.map(n => <EpBadge key={n} num={n} type="nofile" />)}
              </div>
            </div>
          )}
          {season.gapsInRange.length > 0 && (
            <div>
              <p className="text-[11px] text-red-400/70 font-bold uppercase tracking-wider mb-2">
                Not in Database ({season.gapsInRange.length})
              </p>
              <div className="flex flex-wrap gap-1">
                {season.gapsInRange.map(n => <EpBadge key={n} num={n} type="missing" />)}
              </div>
            </div>
          )}
          {season.missing.length === 0 && (
            <p className="text-xs text-muted-foreground italic">All episodes in range are uploaded.</p>
          )}
        </div>
      )}
    </div>
  );
}

function SeriesCard({ series }: { series: SeriesGap }) {
  const [open, setOpen] = useState(false);
  const poster = series.posterPath
    ? series.posterPath.startsWith("http") ? series.posterPath : `${TMDB_IMAGE}w92${series.posterPath}`
    : null;

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden mb-3">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-4 p-4 hover:bg-white/[0.02] transition-colors text-left"
      >
        {poster ? (
          <img src={poster} alt={series.title} className="w-10 h-14 object-cover rounded-lg flex-shrink-0" />
        ) : (
          <div className="w-10 h-14 bg-white/5 rounded-lg flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm text-foreground truncate">{series.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {series.seasons.length} season{series.seasons.length !== 1 ? "s" : ""}
            {series.tmdbId ? ` · TMDB ${series.tmdbId}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="flex items-center gap-1 text-xs font-bold text-red-400 bg-red-500/10 px-2.5 py-1.5 rounded-lg">
            <AlertTriangle className="w-3 h-3" /> {series.totalMissing} missing
          </span>
          {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-border">
          <div className="pt-4">
            {series.seasons.map(s => <SeasonRow key={s.season} season={s} />)}
          </div>
          <div className="mt-3 flex gap-2">
            <a
              href={`/admin/movies?series=${series.id}`}
              className="text-xs font-bold text-primary hover:underline"
            >
              Manage Episodes →
            </a>
            {series.tmdbId && (
              <a
                href={`https://www.themoviedb.org/tv/${series.tmdbId}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-bold text-muted-foreground hover:text-foreground"
              >
                View on TMDB ↗
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function EpisodeChecker() {
  const [search, setSearch] = useState("");

  const { data = [], isLoading, refetch, isFetching } = useQuery<SeriesGap[]>({
    queryKey: ["/api/admin/episode-gaps"],
    queryFn: async () => {
      const res = await fetch("/api/admin/episode-gaps");
      return res.json();
    },
    staleTime: 0,
  });

  const filtered = data.filter(s =>
    s.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background flex">
      <AdminSidebar />
      <main className="flex-1 md:ml-64 p-6 md:p-8 overflow-y-auto">
        <header className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold font-display text-foreground flex items-center gap-3">
                <AlertTriangle className="w-7 h-7 text-yellow-500" />
                Episode Gap Checker
              </h1>
              <p className="text-muted-foreground mt-1">
                Series with missing or un-uploaded episodes
              </p>
            </div>
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="flex items-center gap-2 px-4 py-2 bg-secondary text-foreground rounded-xl text-sm font-bold hover:bg-white/10 disabled:opacity-50 transition-all"
            >
              <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </header>

        {/* Legend */}
        <div className="flex flex-wrap gap-4 mb-6 p-4 bg-card border border-border rounded-2xl">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-green-500/20 border border-green-500/30 flex items-center justify-center text-[10px] font-bold text-green-400">1</div>
            <span className="text-sm text-muted-foreground">Uploaded (has file)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-yellow-500/20 border border-yellow-500/30 flex items-center justify-center text-[10px] font-bold text-yellow-400">2</div>
            <span className="text-sm text-muted-foreground">Metadata only (no file uploaded)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-red-500/20 border border-red-500/30 flex items-center justify-center text-[10px] font-bold text-red-400">3</div>
            <span className="text-sm text-muted-foreground">Not in database</span>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search series..."
            className="w-full pl-9 pr-4 py-3 bg-card border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
          />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <CheckCircle className="w-16 h-16 text-green-500/30 mb-4" />
            <p className="text-foreground font-bold text-lg">
              {search ? "No series match your search" : "All series are complete!"}
            </p>
            <p className="text-muted-foreground text-sm mt-1">
              {search ? "Try a different search term" : "No missing episodes detected across all series"}
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-4">
              {filtered.length} series with missing episodes
            </p>
            {filtered.map(series => (
              <SeriesCard key={series.id} series={series} />
            ))}
          </>
        )}
      </main>
    </div>
  );
}
