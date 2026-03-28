import { useEffect, useRef, useState, useCallback } from "react";
import videojs from "video.js";
import "video.js/dist/video-js.css";
import {
  X, Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  Download, Film, Radio, Loader2, RotateCcw, RotateCw,
  ChevronDown, Settings, Gauge, PictureInPicture2,
  RotateCw as Rotate, Lock, Megaphone,
} from "lucide-react";
import { AdRenderer } from "@/components/AdRenderer";
import { type Ad } from "@shared/schema";

export interface VideoSource {
  label: string;
  url: string;
  type: "mp4" | "hls";
}

interface VideoPlayerProps {
  sources: VideoSource[];
  poster?: string;
  title?: string;
  onClose: () => void;
  showMidrollAd?: boolean;
  showPrerollAd?: boolean;
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

function formatTime(s: number) {
  if (!isFinite(s) || s < 0) return "0:00";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function toProxied(src: VideoSource) {
  if (src.type === "hls") {
    // Local HLS URLs (our own server) — pass directly, no proxy needed
    if (src.url.startsWith("/")) {
      return { src: src.url, type: "application/x-mpegURL" };
    }
    return {
      src: `/api/proxy/stream?url=${encodeURIComponent(src.url)}`,
      type: "application/x-mpegURL",
    };
  }
  return { src: src.url, type: "video/mp4" };
}

function lockLandscape() {
  try {
    const so = (screen as any).orientation;
    if (so?.lock) so.lock("landscape").catch(() => {});
  } catch {}
}

function lockPortrait() {
  try {
    const so = (screen as any).orientation;
    if (so?.lock) so.lock("portrait").catch(() => {});
  } catch {}
}

function unlockOrientation() {
  try {
    const so = (screen as any).orientation;
    if (so?.unlock) so.unlock();
  } catch {}
}

export function VideoPlayer({ sources, poster, title, onClose, showMidrollAd = false, showPrerollAd = false }: VideoPlayerProps) {
  const wrapperRef    = useRef<HTMLDivElement>(null);
  const containerRef  = useRef<HTMLDivElement>(null);
  const playerRef     = useRef<ReturnType<typeof videojs> | null>(null);
  const hideTimer     = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [activeIndex,      setActiveIndex]      = useState(0);
  const [playing,          setPlaying]          = useState(false);
  const [loading,          setLoading]          = useState(true);
  const [error,            setError]            = useState(false);
  const [currentTime,      setCurrentTime]      = useState(0);
  const [duration,         setDuration]         = useState(0);
  const [buffered,         setBuffered]         = useState(0);
  const [volume,           setVolume]           = useState(1);
  const [muted,            setMuted]            = useState(false);
  const [fullscreen,       setFullscreen]       = useState(false);
  const [controlsVisible,  setControlsVisible]  = useState(true);
  const [qualityOpen,      setQualityOpen]      = useState(false);
  const [speedOpen,        setSpeedOpen]        = useState(false);
  const [playbackSpeed,    setPlaybackSpeed]    = useState(1);
  const [downloading,      setDownloading]      = useState(false);
  const [showPlayPulse,    setShowPlayPulse]    = useState(false);
  const [isPortrait,       setIsPortrait]       = useState(false);
  const [orientationLocked,setOrientationLocked]= useState(false);
  const [pipAvailable,     setPipAvailable]     = useState(false);
  const [isPip,            setIsPip]            = useState(false);

  // Mid-roll ad state
  const [adVisible,    setAdVisible]    = useState(false);
  const [adData,       setAdData]       = useState<Ad | null>(null);
  const [adCountdown,  setAdCountdown]  = useState(10);
  const [adSkippable,  setAdSkippable]  = useState(false);
  const adShown        = useRef(false);
  const adTimerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const showMidrollRef = useRef(showMidrollAd);
  useEffect(() => { showMidrollRef.current = showMidrollAd; }, [showMidrollAd]);

  // Pre-roll ad state
  const [prerollVisible,   setPrerollVisible]   = useState(false);
  const [prerollData,      setPrerollData]      = useState<Ad | null>(null);
  const [prerollCountdown, setPrerollCountdown] = useState(15);
  const [prerollSkippable, setPrerollSkippable] = useState(false);
  const prerollShown    = useRef(false);
  const prerollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const showPrerollRef  = useRef(showPrerollAd);
  useEffect(() => { showPrerollRef.current = showPrerollAd; }, [showPrerollAd]);

  const resetHide = useCallback((isPlaying: boolean) => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setControlsVisible(true);
    if (isPlaying) {
      hideTimer.current = setTimeout(() => setControlsVisible(false), 3500);
    }
  }, []);

  const closeAd = useCallback(() => {
    if (adTimerRef.current) { clearInterval(adTimerRef.current); adTimerRef.current = null; }
    setAdVisible(false);
    setAdData(null);
    setAdCountdown(10);
    setAdSkippable(false);
    const p = playerRef.current;
    if (p && !p.isDisposed()) p.play();
  }, []);

  const triggerMidrollAd = useCallback(() => {
    const p = playerRef.current;
    if (p && !p.isDisposed()) p.pause();
    fetch("/api/ads/serve")
      .then(r => r.json())
      .then((ad: Ad | null) => {
        if (!ad) { const p2 = playerRef.current; if (p2 && !p2.isDisposed()) p2.play(); return; }
        setAdData(ad);
        setAdCountdown(10);
        setAdSkippable(false);
        setAdVisible(true);
        let count = 10;
        adTimerRef.current = setInterval(() => {
          count -= 1;
          setAdCountdown(count);
          if (count <= 5) setAdSkippable(true);
          if (count <= 0) {
            if (adTimerRef.current) { clearInterval(adTimerRef.current); adTimerRef.current = null; }
            setAdVisible(false);
            setAdData(null);
            const p2 = playerRef.current;
            if (p2 && !p2.isDisposed()) p2.play();
          }
        }, 1000);
      })
      .catch(() => { const p2 = playerRef.current; if (p2 && !p2.isDisposed()) p2.play(); });
  }, []);

  const closePreroll = useCallback(() => {
    if (prerollTimerRef.current) { clearInterval(prerollTimerRef.current); prerollTimerRef.current = null; }
    setPrerollVisible(false);
    setPrerollData(null);
    setPrerollCountdown(15);
    setPrerollSkippable(false);
    const p = playerRef.current;
    if (p && !p.isDisposed()) p.play();
  }, []);

  const triggerPrerollAd = useCallback(() => {
    const p = playerRef.current;
    if (p && !p.isDisposed()) p.pause();
    fetch("/api/ads/serve")
      .then(r => r.json())
      .then((ad: Ad | null) => {
        if (!ad) { const p2 = playerRef.current; if (p2 && !p2.isDisposed()) p2.play(); return; }
        setPrerollData(ad);
        setPrerollCountdown(15);
        setPrerollSkippable(false);
        setPrerollVisible(true);
        let count = 15;
        prerollTimerRef.current = setInterval(() => {
          count -= 1;
          setPrerollCountdown(count);
          if (count <= 5) setPrerollSkippable(true);
          if (count <= 0) {
            if (prerollTimerRef.current) { clearInterval(prerollTimerRef.current); prerollTimerRef.current = null; }
            setPrerollVisible(false);
            setPrerollData(null);
            const p2 = playerRef.current;
            if (p2 && !p2.isDisposed()) p2.play();
          }
        }, 1000);
      })
      .catch(() => { const p2 = playerRef.current; if (p2 && !p2.isDisposed()) p2.play(); });
  }, []);

  const buildPlayer = useCallback((srcIndex: number) => {
    if (!containerRef.current) return;

    if (playerRef.current && !playerRef.current.isDisposed()) {
      playerRef.current.dispose();
      playerRef.current = null;
    }

    while (containerRef.current.firstChild) {
      containerRef.current.removeChild(containerRef.current.firstChild);
    }

    const videoEl = document.createElement("video-js");
    containerRef.current.appendChild(videoEl);

    const { src, type } = toProxied(sources[srcIndex]);

    const player = videojs(videoEl as HTMLVideoElement, {
      autoplay: true,
      controls: false,
      fluid: false,
      fill: true,
      poster,
      sources: [{ src, type }],
      html5: {
        vhs: { overrideNative: true, enableLowInitialPlaylist: true },
        nativeAudioTracks: false,
        nativeVideoTracks: false,
      },
    });

    player.on("play",     () => { setPlaying(true); setLoading(false); setError(false); resetHide(true); });
    player.on("pause",    () => { setPlaying(false); resetHide(false); });
    player.on("waiting",  () => setLoading(true));
    player.on("canplay",  () => setLoading(false));
    player.on("ended",    () => { setPlaying(false); setControlsVisible(true); });
    player.on("error",    () => { setError(true); setLoading(false); });

    // Safety timeout — if the player is still loading after 12 seconds, show error
    const loadTimeout = setTimeout(() => {
      if (playerRef.current && !playerRef.current.isDisposed()) {
        const readyState = (playerRef.current.el()?.querySelector("video") as HTMLVideoElement | null)?.readyState ?? 0;
        if (readyState < 2) {
          setError(true);
          setLoading(false);
        }
      }
    }, 12000);
    player.on("timeupdate", () => {
      const ct = player.currentTime() ?? 0;
      setCurrentTime(ct);
      setBuffered(player.bufferedEnd() ?? 0);
      // Trigger mid-roll ad after 15 seconds if enabled and not yet shown
      if (showMidrollRef.current && !adShown.current && ct >= 15) {
        adShown.current = true;
        triggerMidrollAd();
      }
    });
    player.on("durationchange", () => setDuration(player.duration() ?? 0));
    player.on("volumechange",   () => {
      setVolume(player.volume() ?? 1);
      setMuted(player.muted() ?? false);
    });
    player.on("ratechange", () => setPlaybackSpeed(player.playbackRate() ?? 1));

    // PiP support detection
    const internalEl = player.el()?.querySelector("video") as HTMLVideoElement | null;
    if (internalEl) {
      setPipAvailable(document.pictureInPictureEnabled && !internalEl.disablePictureInPicture);
      internalEl.addEventListener("enterpictureinpicture", () => setIsPip(true));
      internalEl.addEventListener("leavepictureinpicture", () => setIsPip(false));
    }

    setLoading(true);
    setError(false);
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);

    playerRef.current = player;

    // Trigger pre-roll once on first load
    if (showPrerollRef.current && !prerollShown.current) {
      prerollShown.current = true;
      // Wait for the player to be ready before pausing/showing pre-roll
      player.one("canplay", () => {
        clearTimeout(loadTimeout);
        triggerPrerollAd();
      });
    }
    player.one("play", () => clearTimeout(loadTimeout));
    player.one("error", () => clearTimeout(loadTimeout));
  }, [sources, poster, resetHide, triggerMidrollAd, triggerPrerollAd]);

  useEffect(() => {
    adShown.current = false;
    prerollShown.current = false;
    if (adTimerRef.current) { clearInterval(adTimerRef.current); adTimerRef.current = null; }
    if (prerollTimerRef.current) { clearInterval(prerollTimerRef.current); prerollTimerRef.current = null; }
    setAdVisible(false);
    setAdData(null);
    setPrerollVisible(false);
    setPrerollData(null);
    buildPlayer(activeIndex);
    return () => {
      if (playerRef.current && !playerRef.current.isDisposed()) {
        playerRef.current.dispose();
        playerRef.current = null;
      }
      if (adTimerRef.current) { clearInterval(adTimerRef.current); adTimerRef.current = null; }
      if (prerollTimerRef.current) { clearInterval(prerollTimerRef.current); prerollTimerRef.current = null; }
      unlockOrientation();
    };
  }, [activeIndex]);

  // Fullscreen change & orientation detection
  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);

    const mq = window.matchMedia("(orientation: portrait)");
    const onOrient = (e: MediaQueryListEvent) => setIsPortrait(e.matches);
    setIsPortrait(mq.matches);
    mq.addEventListener("change", onOrient);

    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      mq.removeEventListener("change", onOrient);
    };
  }, []);

  // Apply playback rate whenever it changes
  const applySpeed = (speed: number) => {
    const p = playerRef.current;
    if (!p) return;
    p.playbackRate(speed);
    setPlaybackSpeed(speed);
    setSpeedOpen(false);
  };

  const togglePlay = () => {
    const p = playerRef.current;
    if (!p) return;
    setShowPlayPulse(true);
    setTimeout(() => setShowPlayPulse(false), 600);
    if (p.paused()) p.play();
    else p.pause();
    resetHide(!p.paused());
  };

  const seek = (delta: number) => {
    const p = playerRef.current;
    if (!p) return;
    const t = (p.currentTime() ?? 0) + delta;
    p.currentTime(Math.max(0, Math.min(t, p.duration() ?? Infinity)));
    resetHide(playing);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const p = playerRef.current;
    if (!p || !isFinite(p.duration() ?? 0)) return;
    p.currentTime((parseFloat(e.target.value) / 1000) * (p.duration() ?? 0));
    resetHide(playing);
  };

  const handleVolume = (val: number) => {
    const p = playerRef.current;
    if (!p) return;
    p.volume(val);
    p.muted(val === 0);
  };

  const toggleMute = () => {
    const p = playerRef.current;
    if (!p) return;
    p.muted(!p.muted());
  };

  const toggleFullscreen = () => {
    const el = wrapperRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().catch(() => {});
      lockLandscape();
    } else {
      document.exitFullscreen().catch(() => {});
      if (!orientationLocked) unlockOrientation();
    }
  };

  const togglePortraitLock = () => {
    if (orientationLocked) {
      setOrientationLocked(false);
      unlockOrientation();
    } else {
      setOrientationLocked(true);
      if (isPortrait) lockPortrait();
      else lockLandscape();
    }
  };

  const rotateScreen = () => {
    const newPortrait = !isPortrait;
    setIsPortrait(newPortrait);
    if (newPortrait) lockPortrait();
    else lockLandscape();
  };

  const togglePip = async () => {
    const p = playerRef.current;
    if (!p) return;
    try {
      const vidEl = p.el()?.querySelector("video") as HTMLVideoElement;
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (vidEl) {
        await vidEl.requestPictureInPicture();
      }
    } catch {}
  };

  const handleDownload = () => {
    const src = sources[activeIndex];
    if (!src) return;
    setDownloading(true);
    const safeTitle = (title || src.label).replace(/[^a-z0-9_\-\s]/gi, "_");

    // Telegram stream — use the stream endpoint directly with ?download=1
    let url: string;
    if (src.url.startsWith("/api/stream/telegram/")) {
      url = `${src.url}?download=1`;
    } else {
      url = `/api/proxy/download?url=${encodeURIComponent(src.url)}&type=${src.type}&title=${encodeURIComponent(title || src.label)}`;
    }

    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeTitle}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => setDownloading(false), 3000);
  };

  const currentSrc = sources[activeIndex];
  const progress    = duration > 0 ? (currentTime / duration) * 1000 : 0;
  const bufferedPct = duration > 0 ? (buffered / duration) * 100 : 0;

  return (
    <div
      ref={wrapperRef}
      className="fixed inset-0 z-[400] bg-black flex flex-col overflow-hidden"
      onMouseMove={() => resetHide(playing)}
      onTouchStart={() => resetHide(playing)}
      onClick={(e) => { if (e.target === e.currentTarget) { setQualityOpen(false); setSpeedOpen(false); } }}
    >
      {/* VIDEO.JS */}
      <div ref={containerRef} className="absolute inset-0 [&_.video-js]:w-full [&_.video-js]:h-full [&_.video-js]:bg-black" />

      {/* LOADING */}
      {loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border-[3px] border-white/8" />
            <div className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-red-500 animate-spin" />
            <Film className="absolute inset-0 m-auto w-5 h-5 text-white/20" />
          </div>
        </div>
      )}

      {/* ERROR */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 pointer-events-none z-10">
          <div className="w-20 h-20 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center">
            <Film className="w-8 h-8 text-white/20" />
          </div>
          <p className="text-white/40 text-sm font-bold text-center px-8 max-w-xs">
            Couldn't load this source. Try a different quality.
          </p>
        </div>
      )}

      {/* PRE-ROLL AD OVERLAY */}
      {prerollVisible && prerollData && (
        <div className="absolute inset-0 z-[150] flex flex-col bg-black overflow-hidden">
          <div className="flex-1 relative overflow-hidden">
            <AdRenderer ad={prerollData} />

            {/* Top-left: "Ad" badge + label */}
            <div className="absolute top-4 left-4 z-10 flex items-center gap-1.5 bg-black/60 border border-white/10 backdrop-blur-sm rounded-full px-2.5 py-1 pointer-events-none">
              <Megaphone className="w-3 h-3 text-yellow-400" />
              <span className="text-yellow-400 text-[9px] font-black uppercase tracking-widest">Pre-roll Ad</span>
            </div>

            {/* Top-right: skip / countdown pill */}
            <div className="absolute top-4 right-4 z-10">
              {prerollSkippable ? (
                <button
                  onClick={closePreroll}
                  data-testid="player-preroll-skip"
                  className="flex items-center gap-1.5 bg-black/80 border border-white/20 backdrop-blur-md text-white text-[11px] font-black px-3 py-2 rounded-full active:scale-95 transition-all hover:bg-white/15"
                >
                  Skip Ad <X className="w-3 h-3" />
                </button>
              ) : (
                <div className="flex items-center gap-1.5 bg-black/70 border border-white/10 backdrop-blur-md text-white/70 text-[11px] font-black px-3 py-2 rounded-full pointer-events-none select-none">
                  Skip in {prerollCountdown}s
                </div>
              )}
            </div>

            {/* Bottom-right: countdown ring */}
            <div className="absolute bottom-4 right-4 z-10 pointer-events-none">
              <div className="relative w-9 h-9">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="2.5" />
                  <circle
                    cx="18" cy="18" r="15.9" fill="none"
                    stroke={prerollSkippable ? "#ef4444" : "rgba(255,255,255,0.4)"}
                    strokeWidth="2.5"
                    strokeDasharray={`${(prerollCountdown / 15) * 100} 100`}
                    strokeLinecap="round"
                    style={{ transition: "stroke-dasharray 1s linear, stroke 0.3s" }}
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-[10px] text-white/60 font-black">{prerollCountdown}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MID-ROLL AD OVERLAY */}
      {adVisible && adData && (
        <div className="absolute inset-0 z-[150] flex flex-col bg-black overflow-hidden">
          {/* Ad content fills the player */}
          <div className="flex-1 relative overflow-hidden">
            <AdRenderer ad={adData} />

            {/* Top-right: skip / countdown pill */}
            <div className="absolute top-4 right-4 z-10">
              {adSkippable ? (
                <button
                  onClick={closeAd}
                  data-testid="player-ad-skip"
                  className="flex items-center gap-1.5 bg-black/80 border border-white/20 backdrop-blur-md text-white text-[11px] font-black px-3 py-2 rounded-full active:scale-95 transition-all hover:bg-white/15"
                >
                  Skip Ad <X className="w-3 h-3" />
                </button>
              ) : (
                <div className="flex items-center gap-1.5 bg-black/70 border border-white/10 backdrop-blur-md text-white/70 text-[11px] font-black px-3 py-2 rounded-full pointer-events-none select-none">
                  Skip in {adCountdown}s
                </div>
              )}
            </div>

            {/* Bottom-left: "Ad" badge */}
            <div className="absolute bottom-4 left-4 z-10 flex items-center gap-1.5 bg-black/60 border border-white/10 backdrop-blur-sm rounded-full px-2.5 py-1 pointer-events-none">
              <Megaphone className="w-3 h-3 text-yellow-400" />
              <span className="text-yellow-400 text-[9px] font-black uppercase tracking-widest">Ad</span>
            </div>

            {/* Countdown ring (decorative) */}
            <div className="absolute bottom-4 right-4 z-10 pointer-events-none">
              <div className="relative w-9 h-9">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="2.5" />
                  <circle
                    cx="18" cy="18" r="15.9" fill="none"
                    stroke={adSkippable ? "#ef4444" : "rgba(255,255,255,0.4)"}
                    strokeWidth="2.5"
                    strokeDasharray={`${(adCountdown / 10) * 100} 100`}
                    strokeLinecap="round"
                    style={{ transition: "stroke-dasharray 1s linear, stroke 0.3s" }}
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-[10px] text-white/60 font-black">{adCountdown}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PLAY PULSE */}
      {showPlayPulse && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <div className="w-20 h-20 rounded-full bg-black/50 backdrop-blur-md border border-white/20 flex items-center justify-center animate-in zoom-in-50 fade-in duration-150">
            {playing
              ? <Pause className="w-8 h-8 text-white fill-white" />
              : <Play  className="w-8 h-8 text-white fill-white ml-1" />}
          </div>
        </div>
      )}

      {/* SPEED BADGE (floating) */}
      {playbackSpeed !== 1 && !speedOpen && controlsVisible && (
        <div className="absolute top-20 right-4 z-30 pointer-events-none">
          <div className="bg-amber-500/90 backdrop-blur-sm rounded-full px-2.5 py-1 text-[10px] text-black font-black">
            {playbackSpeed}×
          </div>
        </div>
      )}

      {/* TAP ZONE */}
      <div className="absolute inset-0 z-10" onClick={togglePlay} />

      {/* SEEK SKIP ZONES */}
      <button
        className="absolute left-0 top-0 w-1/4 h-full z-20 flex items-center justify-start pl-4 opacity-0 active:opacity-100 transition-opacity"
        onDoubleClick={(e) => { e.stopPropagation(); seek(-10); }}
      >
        <div className="flex flex-col items-center gap-1 bg-black/50 backdrop-blur-md rounded-2xl px-3 py-3">
          <RotateCcw className="w-5 h-5 text-white" />
          <span className="text-white text-[10px] font-black">10s</span>
        </div>
      </button>
      <button
        className="absolute right-0 top-0 w-1/4 h-full z-20 flex items-center justify-end pr-4 opacity-0 active:opacity-100 transition-opacity"
        onDoubleClick={(e) => { e.stopPropagation(); seek(10); }}
      >
        <div className="flex flex-col items-center gap-1 bg-black/50 backdrop-blur-md rounded-2xl px-3 py-3">
          <RotateCw className="w-5 h-5 text-white" />
          <span className="text-white text-[10px] font-black">10s</span>
        </div>
      </button>

      {/* CONTROLS OVERLAY */}
      <div
        className={`absolute inset-0 flex flex-col justify-between z-30 transition-opacity duration-300 pointer-events-none ${
          controlsVisible ? "opacity-100" : "opacity-0"
        }`}
      >
        {/* TOP BAR */}
        <div className="pointer-events-auto flex items-center gap-2 px-4 pt-5 pb-10 bg-gradient-to-b from-black/80 via-black/20 to-transparent">
          <button
            onClick={onClose}
            data-testid="player-close"
            className="w-10 h-10 rounded-full bg-white/10 border border-white/15 backdrop-blur-md flex items-center justify-center active:scale-90 transition-transform hover:bg-white/20 flex-shrink-0"
          >
            <X className="w-4 h-4 text-white" />
          </button>

          <div className="flex-1 min-w-0">
            {title && (
              <p className="text-white text-sm font-black line-clamp-1 tracking-tight drop-shadow-lg">{title}</p>
            )}
            {currentSrc && (
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-1 ${
                  currentSrc.type === "hls"
                    ? "bg-blue-500/20 border border-blue-500/30 text-blue-400"
                    : "bg-red-500/20 border border-red-500/30 text-red-400"
                }`}>
                  {currentSrc.type === "hls" ? <Radio className="w-2.5 h-2.5" /> : <Film className="w-2.5 h-2.5" />}
                  {currentSrc.label}
                </div>
                {playing && !loading && (
                  <div className="flex items-center gap-1 text-green-400/70 text-[9px] font-black uppercase tracking-widest">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    Live
                  </div>
                )}
              </div>
            )}
          </div>

          {/* PiP */}
          {pipAvailable && (
            <button
              onClick={togglePip}
              data-testid="player-pip"
              className={`w-9 h-9 rounded-full border backdrop-blur-md flex items-center justify-center active:scale-90 transition-all ${
                isPip ? "bg-blue-500/20 border-blue-500/30" : "bg-white/10 border-white/15 hover:bg-white/20"
              }`}
              title="Picture in Picture"
            >
              <PictureInPicture2 className={`w-4 h-4 ${isPip ? "text-blue-400" : "text-white"}`} />
            </button>
          )}

          {/* Rotate */}
          <button
            onClick={rotateScreen}
            data-testid="player-rotate"
            className="w-9 h-9 rounded-full bg-white/10 border border-white/15 backdrop-blur-md flex items-center justify-center active:scale-90 transition-all hover:bg-white/20"
            title="Rotate"
          >
            <Rotate className="w-4 h-4 text-white" />
          </button>

          {/* Orientation lock */}
          <button
            onClick={togglePortraitLock}
            data-testid="player-orientation-lock"
            className={`w-9 h-9 rounded-full border backdrop-blur-md flex items-center justify-center active:scale-90 transition-all ${
              orientationLocked ? "bg-amber-500/20 border-amber-500/30" : "bg-white/10 border-white/15 hover:bg-white/20"
            }`}
            title={orientationLocked ? "Unlock Orientation" : "Lock Orientation"}
          >
            <Lock className={`w-3.5 h-3.5 ${orientationLocked ? "text-amber-400" : "text-white/60"}`} />
          </button>

          {/* Download */}
          <button
            onClick={handleDownload}
            data-testid="player-download"
            disabled={downloading}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-full bg-white/10 border border-white/15 backdrop-blur-md text-white/80 text-[10px] font-black uppercase tracking-wider hover:bg-white/20 active:scale-95 transition-all disabled:opacity-50"
          >
            {downloading
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Download className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{downloading ? "Starting…" : "Save"}</span>
          </button>
        </div>

        {/* BOTTOM CONTROLS */}
        <div className="pointer-events-auto flex flex-col gap-2 px-4 pt-10 pb-7 bg-gradient-to-t from-black/90 via-black/50 to-transparent">
          {/* SEEK BAR */}
          <div className="relative w-full h-8 flex items-center">
            <div className="absolute left-0 right-0 h-1 rounded-full bg-white/10" />
            <div
              className="absolute left-0 h-1 rounded-full bg-white/25 pointer-events-none"
              style={{ width: `${bufferedPct}%` }}
            />
            <div
              className="absolute left-0 h-1 rounded-full bg-gradient-to-r from-red-600 to-red-400 pointer-events-none"
              style={{ width: `${(progress / 1000) * 100}%` }}
            />
            <input
              type="range"
              min={0}
              max={1000}
              step={1}
              value={Math.round(progress)}
              onChange={handleSeek}
              data-testid="player-seek"
              className="w-full h-full appearance-none bg-transparent cursor-pointer z-10
                [&::-webkit-slider-thumb]:appearance-none
                [&::-webkit-slider-thumb]:w-4
                [&::-webkit-slider-thumb]:h-4
                [&::-webkit-slider-thumb]:rounded-full
                [&::-webkit-slider-thumb]:bg-white
                [&::-webkit-slider-thumb]:shadow-lg
                [&::-webkit-slider-thumb]:shadow-black/60
                [&::-webkit-slider-thumb]:border-2
                [&::-webkit-slider-thumb]:border-white/80
                [&::-moz-range-thumb]:w-4
                [&::-moz-range-thumb]:h-4
                [&::-moz-range-thumb]:rounded-full
                [&::-moz-range-thumb]:bg-white
                [&::-moz-range-thumb]:border-0"
            />
          </div>

          {/* TIME */}
          <div className="flex items-center justify-between px-0.5 mb-1">
            <span className="text-white/50 text-[11px] font-black tabular-nums">{formatTime(currentTime)}</span>
            <span className="text-white/30 text-[11px] font-black tabular-nums">{formatTime(duration)}</span>
          </div>

          {/* CONTROL ROW */}
          <div className="flex items-center gap-2">
            {/* Play/Pause */}
            <button
              onClick={togglePlay}
              data-testid="player-play-pause"
              className="w-11 h-11 rounded-full bg-white text-black flex items-center justify-center hover:bg-white/90 active:scale-90 transition-all shadow-lg shadow-black/50"
            >
              {playing
                ? <Pause className="w-5 h-5 fill-black" />
                : <Play  className="w-5 h-5 fill-black ml-0.5" />}
            </button>

            {/* Skip -10 */}
            <button
              onClick={() => seek(-10)}
              className="w-9 h-9 rounded-full bg-white/8 border border-white/10 flex items-center justify-center hover:bg-white/15 active:scale-90 transition-all"
            >
              <RotateCcw className="w-4 h-4 text-white/70" />
            </button>

            {/* Skip +10 */}
            <button
              onClick={() => seek(10)}
              className="w-9 h-9 rounded-full bg-white/8 border border-white/10 flex items-center justify-center hover:bg-white/15 active:scale-90 transition-all"
            >
              <RotateCw className="w-4 h-4 text-white/70" />
            </button>

            <div className="flex-1" />

            {/* Volume (desktop) */}
            <div className="hidden sm:flex items-center gap-2">
              <button onClick={toggleMute} className="text-white/50 hover:text-white transition-colors">
                {muted || volume === 0
                  ? <VolumeX className="w-4 h-4" />
                  : <Volume2 className="w-4 h-4" />}
              </button>
              <div className="relative w-20 h-1 bg-white/15 rounded-full">
                <div
                  className="absolute left-0 top-0 h-full rounded-full bg-white/60"
                  style={{ width: `${(muted ? 0 : volume) * 100}%` }}
                />
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={muted ? 0 : volume}
                  onChange={(e) => handleVolume(parseFloat(e.target.value))}
                  className="absolute inset-0 w-full opacity-0 cursor-pointer h-4 -top-1.5"
                />
              </div>
            </div>

            {/* Volume mobile */}
            <button onClick={toggleMute} className="sm:hidden text-white/50 hover:text-white transition-colors">
              {muted || volume === 0
                ? <VolumeX className="w-4 h-4" />
                : <Volume2 className="w-4 h-4" />}
            </button>

            {/* Speed picker */}
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setSpeedOpen(p => !p); setQualityOpen(false); }}
                data-testid="player-speed"
                className={`flex items-center gap-1 px-2.5 py-2 rounded-xl border text-[10px] font-black hover:bg-white/15 transition-all ${
                  playbackSpeed !== 1
                    ? "bg-amber-500/20 border-amber-500/30 text-amber-400"
                    : "bg-white/10 border-white/15 text-white/70"
                }`}
              >
                <Gauge className="w-3 h-3" />
                {playbackSpeed}×
              </button>
              {speedOpen && (
                <div className="absolute bottom-full right-0 mb-3 bg-[#111]/95 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-2xl shadow-black/80 min-w-[110px]">
                  <div className="px-3 py-2 border-b border-white/5">
                    <p className="text-[9px] text-white/30 font-black uppercase tracking-widest">Speed</p>
                  </div>
                  {SPEEDS.map(s => (
                    <button
                      key={s}
                      onClick={(e) => { e.stopPropagation(); applySpeed(s); }}
                      className={`w-full flex items-center justify-between px-4 py-2.5 text-xs font-black transition-colors hover:bg-white/8 ${
                        s === playbackSpeed ? "text-amber-400" : "text-white/50"
                      }`}
                    >
                      {s === 1 ? "Normal" : `${s}×`}
                      {s === playbackSpeed && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Quality picker */}
            {sources.length > 1 && (
              <div className="relative">
                <button
                  onClick={(e) => { e.stopPropagation(); setQualityOpen(p => !p); setSpeedOpen(false); }}
                  data-testid="player-quality"
                  className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl bg-white/10 border border-white/15 text-white/70 text-[10px] font-black hover:bg-white/20 transition-all"
                >
                  <Settings className="w-3 h-3" />
                  {currentSrc?.label}
                  <ChevronDown className={`w-3 h-3 transition-transform ${qualityOpen ? "rotate-180" : ""}`} />
                </button>
                {qualityOpen && (
                  <div className="absolute bottom-full right-0 mb-3 bg-[#111]/95 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-2xl shadow-black/80 min-w-[140px]">
                    <div className="px-3 py-2 border-b border-white/5">
                      <p className="text-[9px] text-white/30 font-black uppercase tracking-widest">Quality</p>
                    </div>
                    {sources.map((s, i) => (
                      <button
                        key={s.label}
                        onClick={(e) => { e.stopPropagation(); setActiveIndex(i); setQualityOpen(false); }}
                        className={`w-full flex items-center gap-2.5 px-4 py-3 text-xs font-black text-left transition-colors hover:bg-white/8 ${
                          i === activeIndex ? "text-red-400" : "text-white/50"
                        }`}
                      >
                        {s.type === "hls"
                          ? <Radio className="w-3 h-3 flex-shrink-0" />
                          : <Film  className="w-3 h-3 flex-shrink-0" />}
                        {s.label}
                        {i === activeIndex && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Fullscreen */}
            <button
              onClick={toggleFullscreen}
              data-testid="player-fullscreen"
              className="w-9 h-9 rounded-full bg-white/10 border border-white/15 flex items-center justify-center hover:bg-white/20 active:scale-90 transition-all"
            >
              {fullscreen
                ? <Minimize className="w-4 h-4 text-white" />
                : <Maximize className="w-4 h-4 text-white" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
