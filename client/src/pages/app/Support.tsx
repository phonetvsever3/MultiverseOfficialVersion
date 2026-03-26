import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ChevronLeft, MessageCircle, Megaphone, ChevronRight, Check, ExternalLink, Package } from "lucide-react";

interface SupportConfig {
  adminTelegramUsername: string | null;
  supportPackages: { name: string; price: string; description: string }[];
}

export default function Support() {
  const [, setLocation] = useLocation();
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);

  const { data: config, isLoading } = useQuery<SupportConfig>({
    queryKey: ["/api/support/config"],
  });

  const telegramUrl = (username: string) =>
    `https://t.me/${username.replace(/^@/, "")}`;

  const handleTalkToAdmin = () => {
    if (!config?.adminTelegramUsername) return;
    window.open(telegramUrl(config.adminTelegramUsername), "_blank");
  };

  const handlePackageChat = (pkgName: string) => {
    if (!config?.adminTelegramUsername) return;
    const msg = encodeURIComponent(`Hi! I'm interested in the "${pkgName}" advertising package. Can you give me more details?`);
    window.open(`https://t.me/${config.adminTelegramUsername.replace(/^@/, "")}?text=${msg}`, "_blank");
  };

  const packageColors = [
    { bg: "from-blue-900/40 to-blue-800/20", border: "border-blue-500/30", badge: "bg-blue-500/20 text-blue-300", dot: "bg-blue-400" },
    { bg: "from-purple-900/40 to-purple-800/20", border: "border-purple-500/30", badge: "bg-purple-500/20 text-purple-300", dot: "bg-purple-400" },
    { bg: "from-amber-900/40 to-amber-800/20", border: "border-amber-500/30", badge: "bg-amber-500/20 text-amber-300", dot: "bg-amber-400" },
    { bg: "from-green-900/40 to-green-800/20", border: "border-green-500/30", badge: "bg-green-500/20 text-green-300", dot: "bg-green-400" },
    { bg: "from-rose-900/40 to-rose-800/20", border: "border-rose-500/30", badge: "bg-rose-500/20 text-rose-300", dot: "bg-rose-400" },
  ];

  return (
    <div className="min-h-screen bg-black pb-10">
      {/* Top Bar */}
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center gap-3 px-4 pt-safe pb-3 bg-gradient-to-b from-black to-transparent">
        <button
          onClick={() => setLocation("/app")}
          className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center active:scale-95 transition-transform"
          data-testid="button-back"
        >
          <ChevronLeft className="w-5 h-5 text-white" />
        </button>
        <h1 className="text-sm font-black text-white uppercase tracking-wider">Support</h1>
      </div>

      <div className="pt-16 px-4 space-y-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Talk to Admin Card */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
            >
              <div className="rounded-3xl bg-gradient-to-br from-[#0088cc]/20 to-[#0088cc]/5 border border-[#0088cc]/30 p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-11 h-11 rounded-2xl bg-[#0088cc]/20 flex items-center justify-center">
                    <MessageCircle className="w-5 h-5 text-[#0088cc]" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-white">Talk to Admin</p>
                    <p className="text-[11px] text-white/40">Get direct support via Telegram</p>
                  </div>
                </div>
                {config?.adminTelegramUsername ? (
                  <button
                    onClick={handleTalkToAdmin}
                    data-testid="button-talk-to-admin"
                    className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-[#0088cc]/20 border border-[#0088cc]/30 active:scale-95 transition-all"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-[#0088cc] flex items-center justify-center">
                        <span className="text-white font-black text-xs">TG</span>
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-bold text-white">@{config.adminTelegramUsername.replace(/^@/, "")}</p>
                        <p className="text-[10px] text-white/40">Open in Telegram</p>
                      </div>
                    </div>
                    <ExternalLink className="w-4 h-4 text-[#0088cc]" />
                  </button>
                ) : (
                  <div className="text-center py-3 text-white/30 text-sm">Admin contact not configured yet.</div>
                )}
              </div>
            </motion.div>

            {/* Advertising Info */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.08 }}
            >
              <div className="rounded-3xl bg-white/5 border border-white/10 p-5">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-11 h-11 rounded-2xl bg-primary/20 flex items-center justify-center">
                    <Megaphone className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-white">Advertising Info</p>
                    <p className="text-[11px] text-white/40">Promote your brand to our audience</p>
                  </div>
                </div>

                {(config?.supportPackages?.length ?? 0) > 0 ? (
                  <div className="space-y-3">
                    {config!.supportPackages.map((pkg, i) => {
                      const colors = packageColors[i % packageColors.length];
                      const isSelected = selectedPackage === pkg.name;
                      return (
                        <motion.div
                          key={pkg.name}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => setSelectedPackage(isSelected ? null : pkg.name)}
                          data-testid={`card-package-${i}`}
                          className={`rounded-2xl bg-gradient-to-br ${colors.bg} border ${colors.border} p-4 cursor-pointer transition-all ${isSelected ? "ring-1 ring-primary/50" : ""}`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${colors.dot}`} />
                              <span className="text-sm font-black text-white">{pkg.name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-bold px-2.5 py-1 rounded-xl ${colors.badge}`}>{pkg.price}</span>
                              {isSelected && <Check className="w-4 h-4 text-primary" />}
                            </div>
                          </div>
                          {pkg.description && (
                            <p className="text-[11px] text-white/50 leading-relaxed">{pkg.description}</p>
                          )}
                          {isSelected && config?.adminTelegramUsername && (
                            <motion.button
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              onClick={(e) => { e.stopPropagation(); handlePackageChat(pkg.name); }}
                              data-testid={`button-chat-package-${i}`}
                              className="mt-3 w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary font-bold text-white text-xs active:scale-95 transition-all shadow-lg shadow-primary/20"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                              Chat with Admin about this Package
                            </motion.button>
                          )}
                        </motion.div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <Package className="w-12 h-12 text-white/10 mb-3" />
                    <p className="text-white/30 text-sm">No advertising packages available yet.</p>
                    {config?.adminTelegramUsername && (
                      <button
                        onClick={handleTalkToAdmin}
                        className="mt-4 flex items-center gap-2 text-primary text-sm font-bold active:scale-95 transition-transform"
                      >
                        <MessageCircle className="w-4 h-4" /> Contact Admin Directly
                      </button>
                    )}
                  </div>
                )}

                {/* General enquiry button */}
                {(config?.supportPackages?.length ?? 0) > 0 && config?.adminTelegramUsername && (
                  <button
                    onClick={handleTalkToAdmin}
                    data-testid="button-general-enquiry"
                    className="mt-4 w-full flex items-center justify-between p-3.5 rounded-2xl bg-white/5 border border-white/10 active:scale-95 transition-all"
                  >
                    <div className="flex items-center gap-2 text-sm text-white/60 font-semibold">
                      <ChevronRight className="w-4 h-4 text-primary" />
                      General Advertising Enquiry
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-white/30" />
                  </button>
                )}
              </div>
            </motion.div>
          </>
        )}
      </div>
    </div>
  );
}
