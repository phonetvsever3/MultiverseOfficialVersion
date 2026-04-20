import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, ArrowRight, Shield } from "lucide-react";

interface SmartLinkAdBoxProps {
  smartLinkUrl: string;
  countdown: number;
  onProceed: () => void;
  onClose: () => void;
  mode?: "watch" | "download";
}

export function SmartLinkAdBox({ smartLinkUrl, countdown: initialCountdown, onProceed, onClose, mode = "watch" }: SmartLinkAdBoxProps) {
  const [timeLeft, setTimeLeft] = useState(initialCountdown > 0 ? initialCountdown : 0);
  const [canSkip, setCanSkip] = useState(initialCountdown === 0);

  useEffect(() => {
    if (initialCountdown === 0) {
      setCanSkip(true);
      return;
    }
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setCanSkip(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [initialCountdown]);

  const handleProceed = () => {
    if (!canSkip) return;
    onProceed();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[300] flex items-end justify-center"
        style={{ background: "rgba(0,0,0,0.88)" }}
        onClick={onClose}
      >
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: "spring", stiffness: 340, damping: 32 }}
          className="w-full max-w-sm mb-6 mx-4 rounded-3xl overflow-hidden"
          style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.07)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3" style={{ background: "#1f1f1f", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(220,38,38,0.15)", border: "1px solid rgba(220,38,38,0.3)" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="#dc2626" stroke="#dc2626" strokeWidth="1.5" strokeLinejoin="round" />
                </svg>
              </div>
              <div>
                <div className="text-sm font-black text-white leading-none">Premium Content</div>
                <div className="text-[9px] text-white/30 font-bold uppercase tracking-widest mt-0.5">Sponsored Support</div>
              </div>
            </div>
            {canSkip ? (
              <motion.button
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                onClick={handleProceed}
                data-testid="button-skip-ad"
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl font-black text-xs text-white active:scale-95 transition-all"
                style={{ background: "#22c55e", boxShadow: "0 4px 16px rgba(34,197,94,0.35)" }}
              >
                Skip Ad <ArrowRight className="w-3.5 h-3.5" />
              </motion.button>
            ) : (
              <div className="flex items-center gap-1.5 px-4 py-2 rounded-xl font-black text-xs text-white/60" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <span className="text-white font-black">{timeLeft}s</span>
              </div>
            )}
          </div>

          {/* Ad iframe */}
          <div className="relative w-full bg-black flex items-center justify-center" style={{ height: "180px" }}>
            {smartLinkUrl ? (
              <iframe
                src={smartLinkUrl}
                className="w-full h-full border-0"
                title="Ad Content"
                sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
              />
            ) : (
              <div className="w-full h-full bg-black" />
            )}
          </div>

          {/* Bottom section */}
          <div className="px-5 py-4" style={{ background: "#141414" }}>
            <div className="text-center mb-4">
              <div className="text-base font-black text-white mb-1">Your link is generating</div>
              <div className="flex items-center justify-center gap-1.5">
                <Shield className="w-3 h-3 text-white/25" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/25">Verified by Cinebot Security</span>
              </div>
            </div>

            <button
              onClick={handleProceed}
              data-testid="button-unlock"
              className="w-full py-4 rounded-2xl font-black text-base text-white flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
              style={{
                background: canSkip ? "linear-gradient(135deg, #ef4444, #b91c1c)" : "#2a2a2a",
                boxShadow: canSkip ? "0 8px 32px rgba(220,38,38,0.4)" : "none",
                color: canSkip ? "white" : "rgba(255,255,255,0.25)",
                cursor: canSkip ? "pointer" : "not-allowed",
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
                  {canSkip ? "Unlock Movie Now" : `Wait ${timeLeft}s...`}
                </>
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
