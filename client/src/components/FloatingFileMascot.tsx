import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import { useQuery } from "@tanstack/react-query";
import type { MascotSettings } from "@shared/schema";

// ─── Random safe positions on screen (% from edges, avoids nav/header) ────────
const POSITIONS = [
  { top: "auto", bottom: "96px",  left: "16px",   right: "auto" },
  { top: "auto", bottom: "96px",  left: "auto",    right: "16px" },
  { top: "auto", bottom: "160px", left: "16px",    right: "auto" },
  { top: "auto", bottom: "160px", left: "auto",    right: "16px" },
  { top: "120px", bottom: "auto", left: "16px",    right: "auto" },
  { top: "120px", bottom: "auto", left: "auto",    right: "16px" },
];

function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─── Random Dancing Mascot Overlay ────────────────────────────────────────────
export function FloatingFileMascot() {
  const [visible, setVisible] = useState(false);
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const [position, setPosition] = useState(POSITIONS[1]);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: settings } = useQuery<MascotSettings>({
    queryKey: ["/api/mascot/settings"],
    refetchInterval: 30_000, // re-check every 30 s so toggle takes effect live
  });

  useEffect(() => {
    const clear = () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (showTimer.current) clearTimeout(showTimer.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };

    if (!settings?.enabled) {
      clear();
      setVisible(false);
      return;
    }

    const files: string[] = (settings.files as string[]) || [];
    if (files.length === 0) {
      clear();
      setVisible(false);
      return;
    }

    const intervalMs = (settings.intervalSeconds ?? 120) * 1000;
    const durationMs = (settings.showDurationSeconds ?? 6) * 1000;

    const show = () => {
      setCurrentFile(randomPick(files));
      setPosition(randomPick(POSITIONS));
      setVisible(true);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setVisible(false), durationMs);
    };

    // First show after 10 s
    showTimer.current = setTimeout(() => {
      show();
      intervalRef.current = setInterval(show, intervalMs);
    }, 10_000);

    return clear;
  }, [settings]);

  if (!settings?.enabled || !currentFile) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key={currentFile + JSON.stringify(position)}
          initial={{ opacity: 0, scale: 0.2 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.2 }}
          transition={{ type: "spring", damping: 16, stiffness: 260 }}
          style={{
            position: "fixed",
            top: position.top,
            bottom: position.bottom,
            left: position.left,
            right: position.right,
            zIndex: 100,
            background: "transparent",
            cursor: "pointer",
            userSelect: "none",
          }}
          onClick={() => setVisible(false)}
          title="Tap to dismiss"
        >
          <DotLottieReact
            src={`/lottie/${currentFile}`}
            loop
            autoplay
            style={{
              width: 120,
              height: 120,
              background: "transparent",
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Card Placeholder: Movie ───────────────────────────────────────────────────
export function AnimatedMovieIcon({ className }: { className?: string }) {
  return (
    <div className={className} style={{ background: "transparent" }}>
      <DotLottieReact
        src="/lottie/movie-theatre.lottie"
        loop
        autoplay
        style={{ width: 64, height: 64, background: "transparent" }}
      />
    </div>
  );
}

// ─── Card Placeholder: Series ─────────────────────────────────────────────────
export function AnimatedSeriesIcon({ className }: { className?: string }) {
  return (
    <div className={className} style={{ background: "transparent" }}>
      <DotLottieReact
        src="/lottie/no-signal-tv.lottie"
        loop
        autoplay
        style={{ width: 64, height: 64, background: "transparent" }}
      />
    </div>
  );
}
