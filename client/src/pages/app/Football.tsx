import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft, Trophy, Play, Clock, Radio, Calendar,
  CheckCircle2, Loader2, AlertCircle, Tv2, RefreshCw,
  Shield, Maximize, Minimize, Wifi, X, ShieldAlert,
  RotateCw,
} from "lucide-react";
import { AdRenderer } from "@/components/AdRenderer";
import { type Ad } from "@shared/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SrcTeam {
  name: string;
  code: string;
  badge?: string;
  color?: string;
}

interface SrcScore {
  current: { home: number; away: number };
  display: string;
  period_1?: { home: number; away: number } | null;
  period_2?: { home: number; away: number } | null;
}

interface SrcMatch {
  id: string;
  title: string;
  timestamp: number;
  status: string;
  status_detail: string;
  round?: string;
  teams: { home: SrcTeam; away: SrcTeam };
  score: SrcScore;
}

interface SrcLeagueGroup {
  league: { name: string; country: string; flag?: string; logo?: string };
  matches: SrcMatch[];
}

interface FlatMatch extends SrcMatch {
  leagueName: string;
  leagueFlag?: string;
  leagueLogo?: string;
  leagueCountry: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const LIVE_STATUSES   = new Set(["live","inprogress","1h","2h","ht","et","pen_live","extra_time","penalties"]);
const FINISH_STATUSES = new Set(["finished","ft","aet","pen","complete","fulltime","cancelled","aban"]);

function classifyStatus(s: string): "live" | "upcoming" | "finished" {
  const v = s.toLowerCase().trim();
  if (LIVE_STATUSES.has(v)) return "live";
  if (FINISH_STATUSES.has(v)) return "finished";
  return "upcoming";
}

function formatKickoffMMT(ts: number) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleTimeString("en-GB", {
    timeZone: "Asia/Rangoon",
    hour: "2-digit",
    minute: "2-digit",
  }) + " MMT";
}

function lockLandscape() {
  try { (screen as any).orientation?.lock?.("landscape").catch?.(() => {}); } catch {}
}
function unlockOrientation() {
  try { (screen as any).orientation?.unlock?.(); } catch {}
}

function flattenMatches(raw: SrcLeagueGroup[]): FlatMatch[] {
  const out: FlatMatch[] = [];
  for (const group of raw) {
    for (const m of group.matches) {
      out.push({ ...m, leagueName: group.league.name, leagueFlag: group.league.flag, leagueLogo: group.league.logo, leagueCountry: group.league.country });
    }
  }
  return out;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TeamBadge({ src, name, size = 10 }: { src?: string; name: string; size?: number }) {
  if (src) return <img src={src} alt={name} className={`w-${size} h-${size} object-contain`} onError={(e) => (e.currentTarget.style.display = "none")} />;
  return (
    <div className={`w-${size} h-${size} rounded-lg bg-white/10 flex items-center justify-center`}>
      <span className="text-[9px] font-black text-white/40 uppercase">{name.slice(0, 2)}</span>
    </div>
  );
}

function StatusBadge({ status, detail }: { status: string; detail: string }) {
  const cls = classifyStatus(status);
  if (cls === "live") return (
    <div className="flex items-center gap-1 bg-red-500/20 border border-red-500/30 rounded-full px-2 py-0.5">
      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
      <span className="text-[9px] text-red-400 font-black uppercase">{detail || "LIVE"}</span>
    </div>
  );
  if (cls === "finished") return <span className="text-[9px] text-white/30 font-medium">{detail || "FT"}</span>;
  return null;
}

// ─── Banner Ad ────────────────────────────────────────────────────────────────

function FootballBannerAd({ ad }: { ad: Ad | null | undefined }) {
  if (!ad) return null;
  useEffect(() => {
    fetch(`/api/ads/${ad.id}/impression`, { method: "POST" }).catch(() => {});
  }, [ad.id]);
  return (
    <div className="mx-0 my-2 rounded-2xl overflow-hidden border border-white/6 bg-white/3" data-testid="football-banner-ad">
      <AdRenderer ad={ad} />
    </div>
  );
}

function MatchCard({ match, onClick }: { match: FlatMatch; onClick: () => void }) {
  const cls = classifyStatus(match.status);
  const home = match.teams.home;
  const away = match.teams.away;
  const hs = match.score.current.home;
  const as_ = match.score.current.away;

  return (
    <motion.div
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className="bg-white/4 border border-white/8 rounded-2xl p-4 cursor-pointer active:bg-white/6 transition-colors"
      data-testid={`card-match-${match.id}`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5 min-w-0 flex-1 mr-2">
          {match.leagueFlag && <img src={match.leagueFlag} alt="" className="w-3.5 h-3.5 object-contain flex-shrink-0" />}
          <span className="text-[9px] text-white/30 font-bold uppercase tracking-widest truncate">
            {match.leagueName} {match.round ? `· ${match.round}` : ""}
          </span>
        </div>
        {cls === "live" && <StatusBadge status={match.status} detail={match.status_detail} />}
        {cls !== "live" && cls !== "finished" && match.timestamp > 0 && (
          <div className="flex items-center gap-1 text-white/25">
            <Clock className="w-2.5 h-2.5" />
            <span className="text-[9px] font-medium">{formatKickoffMMT(match.timestamp)}</span>
          </div>
        )}
        {cls === "finished" && <StatusBadge status={match.status} detail={match.status_detail} />}
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col items-center gap-1.5 flex-1">
          <TeamBadge src={home.badge} name={home.name} size={9} />
          <span className="text-[10px] text-white/80 font-bold text-center line-clamp-2 leading-snug">{home.name}</span>
        </div>
        <div className="flex flex-col items-center gap-1 flex-shrink-0 min-w-[64px]">
          <div className="flex items-center gap-2">
            <span className={`text-2xl font-black tabular-nums ${cls === "live" ? "text-green-400" : "text-white"}`}>{hs}</span>
            <span className="text-white/20 font-black">–</span>
            <span className={`text-2xl font-black tabular-nums ${cls === "live" ? "text-green-400" : "text-white"}`}>{as_}</span>
          </div>
          {cls === "live" && (
            <div className="flex items-center gap-1 bg-green-500/15 rounded-full px-2 py-0.5">
              <Play className="w-2.5 h-2.5 text-green-400 fill-green-400" />
              <span className="text-[8px] text-green-400 font-black">Watch</span>
            </div>
          )}
          {cls === "upcoming" && <span className="text-[8px] text-white/20">VS</span>}
        </div>
        <div className="flex flex-col items-center gap-1.5 flex-1">
          <TeamBadge src={away.badge} name={away.name} size={9} />
          <span className="text-[10px] text-white/80 font-bold text-center line-clamp-2 leading-snug">{away.name}</span>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Match Detail Sheet ───────────────────────────────────────────────────────

interface SrcStream { url: string; embed_url?: string; quality?: string; name?: string; type?: string }

interface SrcDetail {
  id: string;
  title?: string;
  status: string;
  status_detail?: string;
  teams: { home: SrcTeam; away: SrcTeam };
  score: SrcScore;
  streams?: SrcStream[];
  embed_url?: string;
  league?: { name: string; logo?: string };
}

function MatchDetailSheet({ match, onClose }: { match: FlatMatch; onClose: () => void }) {
  const [activeStream, setActiveStream] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [vpnDismissed, setVpnDismissed] = useState(false);

  const { data: detail, isLoading, isError } = useQuery<SrcDetail>({
    queryKey: ["/api/football/match", match.id],
    queryFn: async () => {
      const res = await fetch(`/api/football/match/${match.id}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    retry: false,
  });

  const { data: bannerAd } = useQuery<Ad | null>({
    queryKey: ["/api/ads/serve", "football-detail"],
    queryFn: async () => {
      const res = await fetch("/api/ads/serve");
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 1000 * 60 * 10,
  });

  const streams: SrcStream[] = detail?.streams ?? [];
  const firstStreamEmbed = streams[0]?.embed_url || streams[0]?.url || null;
  const embedUrl = activeStream || detail?.embed_url || firstStreamEmbed || null;
  const homeScore = detail?.score?.current?.home ?? match.score.current.home;
  const awayScore = detail?.score?.current?.away ?? match.score.current.away;
  const cls = classifyStatus(match.status);

  const enterFullscreen = () => {
    setIsFullscreen(true);
    lockLandscape();
  };

  const exitFullscreen = () => {
    setIsFullscreen(false);
    unlockOrientation();
  };

  const rotateToggle = () => {
    try {
      const so = (screen as any).orientation;
      if (so?.lock) {
        const cur = so.type || "";
        if (cur.includes("landscape")) so.lock("portrait").catch(() => {});
        else so.lock("landscape").catch(() => {});
      }
    } catch {}
  };

  // Exit CSS-fullscreen when back button is pressed
  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") exitFullscreen(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isFullscreen]);

  return (
    <>
      {/* CSS fullscreen overlay — sits above everything */}
      <AnimatePresence>
        {isFullscreen && embedUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[500] bg-black flex items-center justify-center"
          >
            <iframe
              key={`fs-${embedUrl}`}
              src={embedUrl}
              className="w-full h-full"
              allowFullScreen
              allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
              referrerPolicy="no-referrer-when-downgrade"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation allow-pointer-lock"
              title="Match Stream Fullscreen"
            />
            {/* Exit button — positioned at top edge, clear of iframe content */}
            <button
              onClick={exitFullscreen}
              className="absolute top-3 right-3 z-10 flex items-center gap-1.5 bg-black/80 backdrop-blur-md border border-white/15 rounded-xl px-3 py-2 active:scale-90 transition-all"
              data-testid="button-exit-fullscreen"
            >
              <Minimize className="w-4 h-4 text-white" />
              <span className="text-[10px] text-white/70 font-bold">Exit</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

    <motion.div
      initial={{ opacity: 0, y: "100%" }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 280 }}
      className="fixed inset-0 z-[200] bg-[#050505] flex flex-col overflow-y-auto"
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-black/80 backdrop-blur-sm border-b border-white/5 sticky top-0 z-10">
        <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center active:scale-95 transition-transform">
          <ChevronLeft className="w-5 h-5 text-white" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-white text-xs font-black line-clamp-1">{match.teams.home.name} vs {match.teams.away.name}</p>
          <p className="text-white/30 text-[9px] truncate">{match.leagueName}</p>
        </div>
        {cls === "live" && (
          <span className="text-[9px] bg-red-500/20 border border-red-500/30 text-red-400 rounded-full px-2.5 py-1 font-black flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> LIVE
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center flex-1 py-24 gap-4">
          <Loader2 className="w-10 h-10 text-green-400 animate-spin" />
          <p className="text-white/30 text-sm">Loading streams…</p>
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center flex-1 py-24 gap-4 px-8">
          <AlertCircle className="w-12 h-12 text-red-400/50" />
          <p className="text-white/40 text-sm font-bold">Could not load match details</p>
          <p className="text-white/20 text-xs text-center">Make sure you have a valid SportSRC API key in the admin panel.</p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col">
          {/* Stream Player */}
          {embedUrl ? (
            <>
              <div className="w-full aspect-video bg-black flex-shrink-0">
                <iframe
                  key={embedUrl}
                  src={embedUrl}
                  className="w-full h-full"
                  allowFullScreen
                  allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                  referrerPolicy="no-referrer-when-downgrade"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation allow-pointer-lock"
                  title="Match Stream"
                />
              </div>
              {/* Stream control bar — sits BELOW iframe, no overlap, always tappable */}
              <div className="flex items-center justify-between px-4 py-2.5 bg-black/60 border-b border-white/5">
                <p className="text-[9px] text-white/25 font-medium">
                  {streams.length > 0 ? `${streams.length} stream${streams.length !== 1 ? "s" : ""} available` : "Live stream"}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={rotateToggle}
                    className="flex items-center gap-1.5 bg-white/8 border border-white/10 rounded-xl px-3 py-1.5 active:scale-90 transition-all"
                    data-testid="button-rotate-screen"
                  >
                    <RotateCw className="w-3.5 h-3.5 text-white/60" />
                    <span className="text-[10px] text-white/50 font-bold">Rotate</span>
                  </button>
                  <button
                    onClick={enterFullscreen}
                    className="flex items-center gap-1.5 bg-green-600/20 border border-green-500/30 rounded-xl px-3 py-1.5 active:scale-90 transition-all"
                    data-testid="button-football-fullscreen"
                  >
                    <Maximize className="w-3.5 h-3.5 text-green-400" />
                    <span className="text-[10px] text-green-400 font-bold">Fullscreen</span>
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="w-full aspect-video bg-zinc-950 flex items-center justify-center flex-shrink-0">
              <div className="text-center">
                <Tv2 className="w-14 h-14 text-white/10 mx-auto mb-3" />
                <p className="text-white/25 text-sm font-medium">No stream available yet</p>
                <p className="text-white/15 text-xs mt-1">Check back when the match starts</p>
              </div>
            </div>
          )}

          {/* VPN Warning Banner */}
          <AnimatePresence>
            {!vpnDismissed && embedUrl && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden px-4 pt-3"
              >
                <div className="flex items-start gap-3 bg-amber-500/8 border border-amber-500/15 rounded-2xl px-4 py-3">
                  <ShieldAlert className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-amber-300 text-xs font-black mb-0.5">Stream not loading? Use a VPN</p>
                    <p className="text-amber-400/60 text-[10px] leading-relaxed">
                      Some streams may be geo-blocked. Enable a VPN for unblocked access to live matches.
                    </p>
                  </div>
                  <button onClick={() => setVpnDismissed(true)} className="text-amber-400/40 flex-shrink-0">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="px-4 py-5 space-y-5">
            {/* Score Card */}
            <div className="bg-white/4 border border-white/6 rounded-2xl px-4 py-5">
              <div className="flex items-center justify-around">
                <div className="flex flex-col items-center gap-2 flex-1">
                  <TeamBadge src={match.teams.home.badge} name={match.teams.home.name} size={12} />
                  <p className="text-white text-xs font-black text-center max-w-[80px] leading-snug">{match.teams.home.name}</p>
                </div>
                <div className="text-center flex-shrink-0 px-4">
                  <div className="flex items-center gap-3">
                    <span className="text-4xl font-black text-white tabular-nums">{homeScore}</span>
                    <span className="text-white/20 font-black text-2xl">–</span>
                    <span className="text-4xl font-black text-white tabular-nums">{awayScore}</span>
                  </div>
                  <p className="text-[9px] text-white/30 mt-2 uppercase tracking-widest font-bold">{detail?.status_detail || match.status_detail}</p>
                  {match.round && <p className="text-[8px] text-white/20 mt-0.5">{match.round}</p>}
                </div>
                <div className="flex flex-col items-center gap-2 flex-1">
                  <TeamBadge src={match.teams.away.badge} name={match.teams.away.name} size={12} />
                  <p className="text-white text-xs font-black text-center max-w-[80px] leading-snug">{match.teams.away.name}</p>
                </div>
              </div>
              {detail?.score?.period_1 && (
                <div className="mt-3 pt-3 border-t border-white/5 flex justify-center gap-6 text-[9px] text-white/20 font-medium">
                  <span>HT: {detail.score.period_1.home} – {detail.score.period_1.away}</span>
                  {detail.score.period_2 && <span>2H: {detail.score.period_2.home} – {detail.score.period_2.away}</span>}
                </div>
              )}
            </div>

            {/* Banner Ad */}
            <FootballBannerAd ad={bannerAd} />

            {/* Stream quality picker */}
            {streams.length > 0 && (
              <div className="space-y-2">
                <p className="text-white/30 text-[9px] font-black uppercase tracking-widest">Available Streams ({streams.length})</p>
                {streams.map((s, i) => {
                  const streamEmbed = s.embed_url || s.url;
                  const activeEmbed = activeStream ?? firstStreamEmbed;
                  const isActive = activeEmbed === streamEmbed;
                  return (
                    <button
                      key={i}
                      onClick={() => setActiveStream(streamEmbed)}
                      className={`w-full flex items-center gap-3 rounded-2xl px-4 py-3 border transition-all active:scale-[0.98] ${
                        isActive ? "bg-green-600/20 border-green-500/30" : "bg-white/4 border-white/6 hover:bg-white/6"
                      }`}
                      data-testid={`button-stream-${i}`}
                    >
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${isActive ? "bg-green-500/20" : "bg-white/6"}`}>
                        <Play className={`w-3.5 h-3.5 ${isActive ? "text-green-400 fill-green-400" : "text-white/30"}`} />
                      </div>
                      <div className="text-left flex-1 min-w-0">
                        <p className="text-white text-sm font-bold">{s.name || `Stream ${i + 1}`}</p>
                        {s.quality && <p className="text-white/30 text-[10px]">{s.quality}</p>}
                      </div>
                      {isActive && <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}

            {streams.length === 0 && !embedUrl && (
              <div className="text-center py-6">
                <Tv2 className="w-10 h-10 text-white/8 mx-auto mb-3" />
                <p className="text-white/25 text-sm">No streams configured for this match</p>
                <p className="text-white/15 text-xs mt-1">Streams are usually added closer to kick-off</p>
              </div>
            )}
          </div>
        </div>
      )}
    </motion.div>
    </>
  );
}

// ─── League Group Header ──────────────────────────────────────────────────────

function LeagueHeader({ name, flag, logo, country }: { name: string; flag?: string; logo?: string; country: string }) {
  return (
    <div className="flex items-center gap-2.5 px-1 mt-5 mb-2 first:mt-2">
      {(flag || logo) ? (
        <img src={flag || logo} alt={name} className="w-5 h-5 object-contain flex-shrink-0" />
      ) : (
        <Shield className="w-4 h-4 text-white/20 flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-white/60 text-xs font-black uppercase tracking-wider truncate">{name}</p>
        <p className="text-white/20 text-[9px]">{country}</p>
      </div>
      <div className="h-px flex-1 bg-white/5" />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const STATUS_TABS = [
  { key: "live",     label: "Live",     icon: <Radio className="w-3.5 h-3.5" /> },
  { key: "upcoming", label: "Upcoming", icon: <Calendar className="w-3.5 h-3.5" /> },
  { key: "finished", label: "Finished", icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
];

export default function Football() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("live");
  const [selectedMatch, setSelectedMatch] = useState<FlatMatch | null>(null);

  const { data: rawData, isLoading, isError, refetch, isFetching } = useQuery<any>({
    queryKey: ["/api/football/matches"],
    queryFn: async () => {
      const res = await fetch("/api/football/matches");
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to load matches");
      }
      return res.json();
    },
    refetchInterval: 60_000,
    retry: false,
  });

  // Fetch a banner ad for the match list
  const { data: listBannerAd } = useQuery<Ad | null>({
    queryKey: ["/api/ads/serve", "football-list"],
    queryFn: async () => {
      const res = await fetch("/api/ads/serve");
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 1000 * 60 * 10,
  });

  const leagueGroups: SrcLeagueGroup[] = Array.isArray(rawData)
    ? rawData
    : Array.isArray(rawData?.data)
      ? rawData.data
      : [];
  const allMatches: FlatMatch[] = flattenMatches(leagueGroups);

  const liveCount = allMatches.filter(m => classifyStatus(m.status) === "live").length;

  // Auto-switch to "live" if there are live matches and we haven't manually changed tabs
  const filtered = allMatches.filter(m => classifyStatus(m.status) === activeTab);

  // Group filtered matches by league
  const groupedFiltered: { leagueName: string; leagueFlag?: string; leagueLogo?: string; leagueCountry: string; matches: FlatMatch[] }[] = [];
  for (const m of filtered) {
    const existing = groupedFiltered.find(g => g.leagueName === m.leagueName);
    if (existing) existing.matches.push(m);
    else groupedFiltered.push({ leagueName: m.leagueName, leagueFlag: m.leagueFlag, leagueLogo: m.leagueLogo, leagueCountry: m.leagueCountry, matches: [m] });
  }

  const noKeys = isError && !isLoading;

  // Build flat list with ad injections (every 2 matches)
  type ListItem = { type: "match"; match: FlatMatch; league: string; leagueFlag?: string; leagueLogo?: string; leagueCountry: string }
                | { type: "ad"; key: string }
                | { type: "header"; leagueName: string; leagueFlag?: string; leagueLogo?: string; leagueCountry: string };

  const listItems: ListItem[] = [];
  let matchCount = 0;
  for (const group of groupedFiltered) {
    listItems.push({ type: "header", leagueName: group.leagueName, leagueFlag: group.leagueFlag, leagueLogo: group.leagueLogo, leagueCountry: group.leagueCountry });
    for (const m of group.matches) {
      listItems.push({ type: "match", match: m, league: group.leagueName, leagueFlag: group.leagueFlag, leagueLogo: group.leagueLogo, leagueCountry: group.leagueCountry });
      matchCount++;
      if (matchCount % 2 === 0 && listBannerAd) {
        listItems.push({ type: "ad", key: `ad-${matchCount}` });
      }
    }
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white pb-20">
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-[#050505]/95 backdrop-blur-md border-b border-white/5 px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setLocation("/app")}
            className="w-9 h-9 rounded-full bg-white/8 flex items-center justify-center active:scale-95 transition-transform flex-shrink-0"
          >
            <ChevronLeft className="w-5 h-5 text-white" />
          </button>
          <div className="flex items-center gap-2 flex-1">
            <Trophy className="w-4 h-4 text-green-400" />
            <h1 className="text-sm font-black text-white tracking-tight">Football Live</h1>
            {allMatches.length > 0 && (
              <span className="text-[9px] bg-white/8 border border-white/10 text-white/40 rounded-full px-2 py-0.5 font-bold">{allMatches.length} matches</span>
            )}
            {liveCount > 0 && (
              <span className="text-[9px] bg-red-500/20 border border-red-500/30 text-red-400 rounded-full px-2 py-0.5 font-black flex items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-red-500 animate-pulse" /> {liveCount} LIVE
              </span>
            )}
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center active:scale-95 transition-transform disabled:opacity-40"
            data-testid="button-refresh-matches"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? "text-green-400 animate-spin" : "text-white/40"}`} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-3 bg-white/4 rounded-xl p-1">
          {STATUS_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === tab.key
                  ? tab.key === "live"
                    ? "bg-red-600 text-white shadow-lg shadow-red-500/20"
                    : "bg-green-600 text-white shadow-lg shadow-green-500/20"
                  : "text-white/40 hover:text-white/60"
              }`}
              data-testid={`tab-${tab.key}`}
            >
              {tab.icon}
              {tab.label}
              {tab.key === "live" && liveCount > 0 && (
                <span className={`text-[8px] font-black rounded-full px-1.5 py-0.5 ${activeTab === "live" ? "bg-white/20" : "bg-red-500/80 text-white"}`}>
                  {liveCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="pt-[124px] px-4">
        {isLoading ? (
          <div className="space-y-3 mt-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white/4 border border-white/6 rounded-2xl p-4 animate-pulse">
                <div className="flex justify-between mb-3">
                  <div className="h-2 bg-white/6 rounded-full w-32" />
                  <div className="h-2 bg-white/6 rounded-full w-14" />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-col items-center gap-2 flex-1">
                    <div className="w-9 h-9 rounded-lg bg-white/6" />
                    <div className="h-2 bg-white/6 rounded-full w-16" />
                  </div>
                  <div className="h-8 w-20 bg-white/6 rounded-xl" />
                  <div className="flex flex-col items-center gap-2 flex-1">
                    <div className="w-9 h-9 rounded-lg bg-white/6" />
                    <div className="h-2 bg-white/6 rounded-full w-16" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : noKeys ? (
          <div className="flex flex-col items-center justify-center py-28 text-center px-8">
            <div className="w-20 h-20 rounded-3xl bg-red-500/8 border border-red-500/15 flex items-center justify-center mb-5">
              <AlertCircle className="w-10 h-10 text-red-400/40" />
            </div>
            <p className="text-white/40 text-sm font-bold mb-2">No API Keys Configured</p>
            <p className="text-white/20 text-xs leading-relaxed max-w-xs">
              Add your SportSRC API keys in the Admin → Football section to start watching live matches.
            </p>
          </div>
        ) : listItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-28 text-center">
            <div className="w-20 h-20 rounded-3xl bg-green-500/8 border border-green-500/15 flex items-center justify-center mb-5">
              <Trophy className="w-10 h-10 text-green-400/30" />
            </div>
            <p className="text-white/40 text-sm font-bold mb-2">
              {activeTab === "live" ? "No live matches right now" : activeTab === "upcoming" ? "No upcoming matches" : "No finished matches"}
            </p>
            <p className="text-white/20 text-xs">
              {activeTab === "live" ? "Check the Upcoming tab for scheduled matches" : "Try refreshing or check another tab"}
            </p>
          </div>
        ) : (
          <div className="space-y-2 mt-2">
            {listItems.map((item, idx) => {
              if (item.type === "header") {
                return <LeagueHeader key={`header-${item.leagueName}-${idx}`} name={item.leagueName} flag={item.leagueFlag} logo={item.leagueLogo} country={item.leagueCountry} />;
              }
              if (item.type === "ad") {
                return <FootballBannerAd key={item.key} ad={listBannerAd} />;
              }
              return (
                <MatchCard
                  key={item.match.id}
                  match={item.match}
                  onClick={() => setSelectedMatch(item.match)}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Match Detail Sheet */}
      <AnimatePresence>
        {selectedMatch && (
          <MatchDetailSheet
            key={selectedMatch.id}
            match={selectedMatch}
            onClose={() => setSelectedMatch(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
