import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, ArrowRight, X } from "lucide-react";
import { type Ad } from "@shared/schema";

interface FullscreenInterstitialAdProps {
  ad: Ad;
  mode: "watch" | "download";
  countdown?: number;
  onProceed: () => void;
}

export function FullscreenInterstitialAd({
  ad,
  mode,
  countdown: initialCountdown = 5,
  onProceed,
}: FullscreenInterstitialAdProps) {
  const [timeLeft, setTimeLeft] = useState(initialCountdown);
  const [canSkip, setCanSkip] = useState(initialCountdown === 0);

  useEffect(() => {
    if (initialCountdown === 0) { setCanSkip(true); return; }
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) { clearInterval(timer); setCanSkip(true); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [initialCountdown]);

  const handleProceed = () => { if (canSkip) onProceed(); };

  const handleAdClick = () => {
    if (ad.buttonUrl) window.open(ad.buttonUrl, "_blank");
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[300] flex flex-col"
        style={{ background: "#000" }}
      >
        {/* Background image or video */}
        {ad.videoUrl ? (
          <video
            src={ad.videoUrl}
            autoPlay
            muted
            loop
            playsInline
            className="absolute inset-0 w-full h-full object-cover"
            style={{ opacity: 0.85 }}
          />
        ) : ad.imageUrl ? (
          <img
            src={ad.imageUrl}
            alt="Ad"
            className="absolute inset-0 w-full h-full object-cover"
            style={{ opacity: 0.85 }}
          />
        ) : null}

        {/* Gradient overlay */}
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.15) 40%, rgba(0,0,0,0.8) 100%)" }}
        />

        {/* Top bar: sponsored badge + timer / close */}
        <div className="relative z-10 flex items-center justify-between p-4 pt-safe">
          <div
            className="rounded-full px-4 py-1.5"
            style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            <span className="text-[10px] uppercase tracking-widest text-white/50 font-bold">Sponsored</span>
          </div>
          {canSkip ? (
            <motion.button
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              onClick={handleProceed}
              data-testid="button-skip-fullscreen-ad"
              className="w-11 h-11 rounded-full flex items-center justify-center active:scale-95 transition-all"
              style={{ background: "rgba(255,255,255,0.15)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.2)" }}
            >
              <X className="w-5 h-5 text-white" />
            </motion.button>
          ) : (
            <div
              className="rounded-full px-4 py-1.5"
              style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.1)" }}
            >
              <span className="text-sm font-black text-white">{timeLeft}s</span>
            </div>
          )}
        </div>

        {/* Center: clickable ad content */}
        <div
          className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 gap-5 cursor-pointer"
          onClick={handleAdClick}
        >
          {(ad.adText || ad.content) && (
            <div className="text-center">
              {ad.adText && (
                <h2 className="text-2xl font-black text-white mb-2 leading-tight drop-shadow-2xl">
                  {ad.adText}
                </h2>
              )}
              {ad.content && (
                <p className="text-sm text-white/70 leading-relaxed">{ad.content}</p>
              )}
            </div>
          )}
          {ad.buttonUrl && ad.buttonText && (
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={(e) => { e.stopPropagation(); handleAdClick(); }}
              className="px-8 py-3 rounded-2xl font-black text-white text-sm flex items-center gap-2"
              style={{
                background: "linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)",
                boxShadow: "0 8px 32px rgba(220,38,38,0.45)",
              }}
            >
              {ad.buttonText} <ArrowRight className="w-4 h-4" />
            </motion.button>
          )}
        </div>

        {/* Bottom: unlock / proceed button */}
        <div className="relative z-10 p-4 pb-safe">
          <button
            onClick={handleProceed}
            data-testid="button-unlock-fullscreen"
            className="w-full py-4 rounded-2xl font-black text-base flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
            style={{
              background: canSkip
                ? "linear-gradient(135deg, #ef4444, #b91c1c)"
                : "rgba(255,255,255,0.08)",
              boxShadow: canSkip ? "0 8px 32px rgba(220,38,38,0.4)" : "none",
              color: canSkip ? "white" : "rgba(255,255,255,0.3)",
              cursor: canSkip ? "pointer" : "not-allowed",
              backdropFilter: "blur(12px)",
              border: canSkip ? "none" : "1px solid rgba(255,255,255,0.08)",
            }}
          >
            {mode === "download" ? (
              <>
                <Download className="w-5 h-5" />
                {canSkip ? "Unlock Download Now" : `Wait ${timeLeft}s...`}
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
                {canSkip ? "Watch Now" : `Wait ${timeLeft}s...`}
              </>
            )}
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
