import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Timer, Download, Sparkles, ShieldCheck } from "lucide-react";
import { type Ad } from "@shared/schema";
import { useRecordImpression } from "@/hooks/use-ads";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AdOverlayProps {
  ad: Ad | null | undefined;
  onComplete: () => void;
  isLoading: boolean;
  smartLinkUrl?: string;
}

export function AdOverlay({ ad, onComplete, isLoading, smartLinkUrl }: AdOverlayProps) {
  const [timeLeft, setTimeLeft] = useState(8);
  const [canSkip, setCanSkip] = useState(false);
  const { mutate: recordImpression } = useRecordImpression();
  const hasRecordedImpression = useRef(false);

  useEffect(() => {
    if (ad && !hasRecordedImpression.current) {
      recordImpression(ad.id);
      hasRecordedImpression.current = true;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          setCanSkip(true);
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [ad, recordImpression]);

  if (isLoading) return null;

  if (!ad && !isLoading) {
    onComplete();
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black p-4 sm:p-6"
      >
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 blur-[120px] rounded-full animate-pulse" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/10 blur-[120px] rounded-full animate-pulse delay-700" />
        </div>

        <div className="w-full max-w-lg bg-[#111] border border-white/10 rounded-[2.5rem] overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)] relative flex flex-col">

          {/* Header */}
          <div className="p-6 flex items-center justify-between border-b border-white/5 bg-white/5">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white leading-tight">Premium Content</h3>
                <p className="text-[10px] text-white/40 uppercase tracking-tighter">Sponsored Support</p>
              </div>
            </div>
            <div className="bg-white/5 border border-white/10 px-4 py-2 rounded-2xl text-[11px] font-bold text-white/80 flex items-center gap-2">
              <Timer className="w-3.5 h-3.5 text-primary" />
              {canSkip ? "Ready" : `Wait ${timeLeft}s`}
            </div>
          </div>

          {/* Ad Content Area */}
          <div className="relative w-full bg-black overflow-hidden" style={{ height: '300px' }}>
            {smartLinkUrl ? (
              <iframe
                key={smartLinkUrl}
                src={smartLinkUrl}
                title="Sponsored Content"
                className="w-full h-full"
                style={{ border: 'none' }}
                sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-top-navigation"
              />
            ) : ad && (ad.type === 'custom_banner' || ad.type === 'adsterra') && ad.content ? (
              <iframe
                key={ad.id}
                title="Advertisement"
                className="w-full h-full"
                style={{ border: 'none' }}
                srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{margin:0;padding:0;box-sizing:border-box;}body{background:#000;display:flex;align-items:center;justify-content:center;min-height:100%;}</style></head><body>${ad.content}</body></html>`}
              />
            ) : null}
          </div>

          {/* Footer */}
          <div className="p-6 bg-[#181818] border-t border-white/5">
            <div className="flex items-center gap-3 mb-4 px-4 py-3 rounded-2xl bg-primary/10 border border-primary/20">
              <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-white font-bold text-sm leading-tight">Watch Ad to Support</p>
                <p className="text-[10px] text-white/40 mt-0.5">Keeps this service free for everyone</p>
              </div>
              <div className="ml-auto shrink-0">
                <ShieldCheck className="w-5 h-5 text-primary/60" />
              </div>
            </div>
            <Button
              onClick={onComplete}
              disabled={!canSkip}
              size="lg"
              className={cn(
                "w-full rounded-2xl font-bold transition-all duration-500 h-14",
                canSkip
                  ? "bg-primary hover:bg-primary/90 text-white shadow-[0_10px_30px_rgba(225,29,72,0.3)] scale-100"
                  : "bg-white/5 text-white/20 border border-white/5 scale-[0.98]"
              )}
            >
              {canSkip ? (
                <span className="flex items-center gap-2">Unlock Movie Now <Download className="w-5 h-5" /></span>
              ) : (
                <span className="flex items-center gap-2">Ready in {timeLeft}s <Timer className="w-4 h-4 animate-pulse" /></span>
              )}
            </Button>
          </div>

        </div>
      </motion.div>
    </AnimatePresence>
  );
}
