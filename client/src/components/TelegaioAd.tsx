import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Timer } from "lucide-react";
import { useState } from "react";

interface TelegaioAdBannerProps {
  script: string;
  className?: string;
}

/**
 * Renders a telega.io banner ad by injecting the admin-configured script
 * into a sandboxed iframe. Place on Movie/Series detail pages.
 */
export function TelegaioAdBanner({ script, className = "" }: TelegaioAdBannerProps) {
  if (!script) return null;

  const srcDoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>*{margin:0;padding:0;box-sizing:border-box;overflow:hidden}body{background:transparent;display:flex;align-items:center;justify-content:center;width:100%;height:100%}</style></head><body>${script}</body></html>`;

  return (
    <div className={`w-full flex justify-center ${className}`}>
      <iframe
        srcDoc={srcDoc}
        className="w-full border-0"
        style={{ height: "60px", maxWidth: "360px" }}
        title="Sponsored"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-top-navigation"
        scrolling="no"
      />
    </div>
  );
}

interface TelegaioFullscreenAdProps {
  script: string;
  onClose: () => void;
}

/**
 * Renders a telega.io fullscreen interstitial ad. Shows a 5-second countdown
 * before the user can close it.
 */
export function TelegaioFullscreenAd({ script, onClose }: TelegaioFullscreenAdProps) {
  const [timeLeft, setTimeLeft] = useState(5);
  const [canClose, setCanClose] = useState(false);
  const hasRecorded = useRef(false);

  useEffect(() => {
    if (!hasRecorded.current) {
      hasRecorded.current = true;
    }
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setCanClose(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const srcDoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>*{margin:0;padding:0;box-sizing:border-box}body{background:#000;display:flex;align-items:center;justify-content:center;width:100vw;height:100vh;overflow:hidden}</style></head><body>${script}</body></html>`;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex flex-col bg-black"
      >
        {/* Top bar */}
        <div className="relative z-10 flex items-center justify-between p-4 pt-safe bg-black/80">
          <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-full px-4 py-2">
            <span className="text-[10px] uppercase tracking-widest text-white/50 font-bold">Sponsored</span>
          </div>
          {canClose ? (
            <motion.button
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              onClick={onClose}
              className="w-11 h-11 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center active:scale-95 transition-all"
            >
              <X className="w-5 h-5 text-white" />
            </motion.button>
          ) : (
            <div className="w-11 h-11 rounded-full bg-black/60 backdrop-blur-md border border-white/10 flex items-center justify-center">
              <div className="flex items-center gap-1">
                <Timer className="w-3 h-3 text-white/60" />
                <span className="text-[11px] font-bold text-white/80">{timeLeft}</span>
              </div>
            </div>
          )}
        </div>

        {/* Ad content */}
        <div className="flex-1 relative">
          <iframe
            srcDoc={srcDoc}
            className="w-full h-full border-0"
            title="Sponsored"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-top-navigation"
          />
        </div>

        {canClose && (
          <div className="p-4 pb-safe bg-black/80">
            <button
              onClick={onClose}
              className="w-full text-center text-[11px] text-white/40 hover:text-white/60 transition-colors py-2"
            >
              Close Ad
            </button>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
