import { useEffect, useRef, useState, useCallback } from "react";

interface Props {
  onDone: () => void;
}

const SLIDE_THRESHOLD = 0.72;

export default function SplashScreen({ onDone }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const [videoEnded, setVideoEnded] = useState(false);
  const [fading, setFading] = useState(false);
  const [slideX, setSlideX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const dragStartX = useRef(0);
  const dragStartSlide = useRef(0);
  const hasLoopedRef = useRef(false);

  // Preload home sections while splash plays
  useEffect(() => {
    fetch("/api/home/sections", { credentials: "include" }).catch(() => {});
  }, []);

  const finish = useCallback(() => {
    setFading(true);
    setTimeout(onDone, 700);
  }, [onDone]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleEnd = () => {
      // On first end → show slide UI and loop the video
      if (!hasLoopedRef.current) {
        hasLoopedRef.current = true;
        setVideoEnded(true);
      }
      // Restart video to loop
      video.currentTime = 0;
      video.play().catch(() => {});
    };

    video.addEventListener("ended", handleEnd);

    // Fallback: show slide after 12s if video never ends
    const fallback = setTimeout(() => {
      if (!hasLoopedRef.current) {
        hasLoopedRef.current = true;
        setVideoEnded(true);
      }
    }, 12000);

    video.play().catch(() => {
      clearTimeout(fallback);
      setVideoEnded(true);
    });

    return () => {
      video.removeEventListener("ended", handleEnd);
      clearTimeout(fallback);
    };
  }, []);

  // Pointer drag logic
  const getHandleMax = () => {
    const trackW = trackRef.current?.clientWidth ?? 280;
    return trackW - 60;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    dragStartX.current = e.clientX;
    dragStartSlide.current = slideX;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartX.current;
    const max = getHandleMax();
    const clamped = Math.max(0, Math.min(1, dragStartSlide.current + dx / max));
    setSlideX(clamped);
    if (clamped >= SLIDE_THRESHOLD) {
      setSlideX(1);
      setIsDragging(false);
      setTimeout(finish, 120);
    }
  };

  const onPointerUp = () => {
    if (!isDragging) return;
    setIsDragging(false);
    if (slideX < SLIDE_THRESHOLD) setSlideX(0);
  };

  const thumbPx = slideX * getHandleMax();

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black flex items-center justify-center overflow-hidden"
      style={{
        opacity: fading ? 0 : 1,
        transition: "opacity 0.7s ease-in-out",
        pointerEvents: fading ? "none" : "auto",
      }}
      data-testid="splash-screen"
    >
      {/* Background video — loops manually */}
      <video
        ref={videoRef}
        src="/api/splash/video"
        playsInline
        muted
        autoPlay
        className="absolute inset-0 w-full h-full object-cover"
        onError={() => {
          if (!hasLoopedRef.current) {
            hasLoopedRef.current = true;
            setVideoEnded(true);
          }
        }}
      />

      {/* Cinematic vignette */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-black/40 pointer-events-none" />

      {/* Slide to Enter — fades in after first video play */}
      <div
        className="absolute bottom-16 left-0 right-0 flex flex-col items-center gap-3 px-10"
        style={{
          opacity: videoEnded ? 1 : 0,
          transform: videoEnded ? "translateY(0)" : "translateY(20px)",
          transition: "opacity 0.6s ease, transform 0.6s ease",
          pointerEvents: videoEnded ? "auto" : "none",
        }}
      >
        <p
          className="text-xs font-bold uppercase tracking-[0.25em] text-white/50 mb-1"
          style={{ fontFamily: "'Orbitron', sans-serif" }}
        >
          Slide to Enter
        </p>

        {/* Track */}
        <div
          ref={trackRef}
          className="relative w-full max-w-xs h-14 rounded-full overflow-hidden"
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.12)",
            boxShadow: slideX > 0
              ? `0 0 ${24 + slideX * 30}px ${8 + slideX * 16}px rgba(220,38,38,${0.15 + slideX * 0.35})`
              : undefined,
          }}
        >
          {/* Fill */}
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              width: `${thumbPx + 60}px`,
              background: "linear-gradient(90deg, rgba(220,38,38,0.35) 0%, rgba(220,38,38,0.08) 100%)",
              transition: isDragging ? "none" : "width 0.35s cubic-bezier(0.25,0.46,0.45,0.94)",
            }}
          />

          {/* Chevrons */}
          <div className="absolute inset-0 flex items-center justify-end pr-5 gap-1.5 pointer-events-none select-none">
            {[0, 1, 2].map((i) => (
              <svg key={i} width="10" height="16" viewBox="0 0 10 16" fill="none" style={{ opacity: 0.18 + i * 0.08 }}>
                <path d="M1 1L8 8L1 15" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ))}
          </div>

          {/* Thumb */}
          <div
            className="absolute top-1.5 bottom-1.5 flex items-center justify-center rounded-full select-none touch-none"
            style={{
              left: `${thumbPx + 6}px`,
              width: "48px",
              background: "linear-gradient(135deg, #ef4444, #b91c1c)",
              boxShadow: `0 0 ${14 + slideX * 20}px ${4 + slideX * 8}px rgba(239,68,68,${0.4 + slideX * 0.4}), inset 0 1px 0 rgba(255,255,255,0.2)`,
              cursor: "grab",
              transition: isDragging ? "none" : "left 0.35s cubic-bezier(0.25,0.46,0.45,0.94)",
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            data-testid="splash-slide-thumb"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M5 12H19M19 12L12 5M19 12L12 19" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
