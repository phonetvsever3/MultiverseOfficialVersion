import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ExternalLink, Timer } from "lucide-react";
import { type Ad } from "@shared/schema";

interface FullScreenInterstitialAdProps {
  ad: Ad | null | undefined;
  onClose: () => void;
}

export function FullScreenInterstitialAd({ ad, onClose }: FullScreenInterstitialAdProps) {
  const [timeLeft, setTimeLeft] = useState(5);
  const [canClose, setCanClose] = useState(false);
  const hasRecorded = useRef(false);

  useEffect(() => {
    if (!ad) {
      onClose();
      return;
    }

    if (!hasRecorded.current) {
      fetch(`/api/ads/${ad.id}/impression`, { method: "POST" }).catch(() => {});
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
  }, [ad, onClose]);

  if (!ad) return null;

  const isVideo = ad.videoUrl && (ad.videoUrl.includes('.mp4') || ad.videoUrl.includes('.webm') || ad.videoUrl.includes('.mov') || ad.videoUrl.includes('video'));

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex flex-col bg-black"
      >
        {/* Media Background */}
        <div className="absolute inset-0">
          {isVideo ? (
            <video
              src={ad.videoUrl!}
              autoPlay
              muted
              loop
              playsInline
              className="w-full h-full object-cover"
            />
          ) : ad.imageUrl ? (
            <img
              src={ad.imageUrl}
              alt={ad.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-black via-gray-900 to-black" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-black/50" />
        </div>

        {/* Top bar */}
        <div className="relative z-10 flex items-center justify-between p-4 pt-safe">
          <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-full px-4 py-2 flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-widest text-white/50 font-bold">Ad</span>
          </div>

          {canClose ? (
            <motion.button
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              onClick={onClose}
              className="w-11 h-11 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center hover:bg-white/20 transition-all active:scale-95"
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

        {/* Bottom content */}
        <div className="relative z-10 mt-auto p-6 pb-safe">
          {ad.title && (
            <h2 className="text-xl font-black text-white mb-2 drop-shadow-lg">{ad.title}</h2>
          )}
          {ad.adText && (
            <p className="text-sm text-white/70 mb-5 leading-relaxed">{ad.adText}</p>
          )}

          {ad.buttonUrl && (
            <a
              href={ad.buttonUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-4 rounded-2xl bg-primary font-bold text-white text-sm hover:bg-primary/90 transition-all active:scale-[0.98] shadow-lg shadow-primary/30"
            >
              <ExternalLink className="w-4 h-4" />
              {ad.buttonText || "Learn More"}
            </a>
          )}

          {!canClose && (
            <p className="text-center text-[11px] text-white/30 mt-4">
              Ad closes in {timeLeft} second{timeLeft !== 1 ? 's' : ''}
            </p>
          )}
          {canClose && (
            <button
              onClick={onClose}
              className="w-full mt-3 text-center text-[11px] text-white/40 hover:text-white/60 transition-colors"
            >
              Close Ad
            </button>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
