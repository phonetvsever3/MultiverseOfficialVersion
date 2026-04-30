import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  showTelegaioAd,
  isInsideTelegram,
  isTelegaioSdkLoaded,
} from "@/components/TelegaioAd";
import { Loader2, Play, RefreshCw } from "lucide-react";

type TelegaioConfig = {
  rewardToken?: string;
  rewardAdBlockUuid?: string;
  fullscreenEnabled?: boolean;
  rewardEnabled?: boolean;
};

function Row({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-white/10 last:border-0">
      <div className="text-xs uppercase tracking-wider text-muted-foreground shrink-0">
        {label}
      </div>
      <div
        className={`text-sm font-mono text-right break-all ${
          ok === true ? "text-green-400" : ok === false ? "text-red-400" : "text-foreground"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

export default function DiagPage() {
  const [tick, setTick] = useState(0);
  const [testResult, setTestResult] = useState<string>("(not run yet)");
  const [testing, setTesting] = useState(false);

  // Re-render every 1s for live updates
  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(i);
  }, []);

  const { data: cfg } = useQuery<TelegaioConfig>({
    queryKey: ["/api/public/telegaio-ad"],
    staleTime: 30_000,
  });

  const tg = (window as any).Telegram?.WebApp;
  const initData: string = tg?.initData || "";
  const initDataUnsafe = tg?.initDataUnsafe || {};
  const platform = tg?.platform || "(unknown)";
  const version = tg?.version || "(unknown)";
  const inTelegram = isInsideTelegram();
  const sdkLoaded = isTelegaioSdkLoaded();

  const userAgent = navigator.userAgent;
  const isTgUserAgent =
    /Telegram/i.test(userAgent) || /TgWebView/i.test(userAgent);

  const runTest = async () => {
    if (!cfg?.rewardToken || !cfg?.rewardAdBlockUuid) {
      setTestResult("❌ No token / adBlockUuid configured in admin");
      return;
    }
    setTesting(true);
    setTestResult("⏳ Calling SDK ad_show...");
    const ts = Date.now();
    try {
      const ok = await showTelegaioAd(cfg.rewardToken, cfg.rewardAdBlockUuid);
      const ms = Date.now() - ts;
      setTestResult(
        ok
          ? `✅ ad_show resolved (true) in ${ms}ms — ad displayed`
          : `❌ ad_show returned false in ${ms}ms — see console for details`,
      );
    } catch (e: any) {
      setTestResult(`❌ Threw: ${e?.message || String(e)}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-4 pb-20">
      <div className="max-w-md mx-auto">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">Telega.io Diagnostics</h1>
          <button
            onClick={() => setTick((t) => t + 1)}
            className="p-2 rounded-lg border border-border"
            data-testid="button-diag-refresh"
            aria-label="refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-muted-foreground mb-4">
          Open this page from your bot's <strong>menu button</strong> in Telegram (NOT a link
          tap). If "Inside Telegram" shows ✓ and initData has a length &gt; 0, the SDK should
          work.
        </p>

        {/* Telegram WebApp environment */}
        <div className="bg-card border border-border rounded-xl p-4 mb-4">
          <div className="text-sm font-bold mb-2">Telegram WebApp</div>
          <Row
            label="Telegram.WebApp"
            value={tg ? "defined" : "MISSING"}
            ok={!!tg}
          />
          <Row
            label="Inside Telegram"
            value={inTelegram ? "YES ✓" : "NO ✗"}
            ok={inTelegram}
          />
          <Row
            label="initData length"
            value={String(initData.length)}
            ok={initData.length > 0}
          />
          <Row label="platform" value={platform} />
          <Row label="version" value={version} />
          <Row
            label="user.id"
            value={String(initDataUnsafe?.user?.id || "(none)")}
            ok={!!initDataUnsafe?.user?.id}
          />
          <Row
            label="user.username"
            value={initDataUnsafe?.user?.username || "(none)"}
          />
          <Row
            label="UA contains Telegram"
            value={isTgUserAgent ? "yes" : "no"}
            ok={isTgUserAgent}
          />
        </div>

        {/* Telega.io SDK */}
        <div className="bg-card border border-border rounded-xl p-4 mb-4">
          <div className="text-sm font-bold mb-2">Telega.io SDK</div>
          <Row label="SDK loaded" value={sdkLoaded ? "YES ✓" : "NO ✗"} ok={sdkLoaded} />
          <Row
            label="Token configured"
            value={cfg?.rewardToken ? `${cfg.rewardToken.slice(0, 8)}…` : "MISSING"}
            ok={!!cfg?.rewardToken}
          />
          <Row
            label="AdBlock UUID"
            value={
              cfg?.rewardAdBlockUuid ? `${cfg.rewardAdBlockUuid.slice(0, 8)}…` : "MISSING"
            }
            ok={!!cfg?.rewardAdBlockUuid}
          />
          <Row
            label="Fullscreen toggle"
            value={cfg?.fullscreenEnabled ? "on" : "off"}
            ok={cfg?.fullscreenEnabled}
          />
          <Row
            label="Reward toggle"
            value={cfg?.rewardEnabled ? "on" : "off"}
            ok={cfg?.rewardEnabled}
          />
        </div>

        {/* Test button */}
        <div className="bg-card border border-border rounded-xl p-4 mb-4">
          <div className="text-sm font-bold mb-2">Run live test</div>
          <button
            onClick={runTest}
            disabled={testing || !sdkLoaded}
            className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-lg py-3 font-semibold disabled:opacity-50"
            data-testid="button-diag-test-ad"
          >
            {testing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            Fire telega.io ad now
          </button>
          <div className="mt-3 p-2 rounded bg-black/30 text-xs font-mono break-all">
            {testResult}
          </div>
        </div>

        {/* Hints */}
        {!inTelegram && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-100">
            <div className="font-bold mb-1">⚠ You're NOT inside Telegram.</div>
            <div>
              If you opened this URL in a normal browser tab, the InApp SDK can't
              authenticate. Open <code className="font-mono">@MultiverseMovies_Bot</code> in
              Telegram, tap the squared <strong>menu button</strong> at the bottom-left of the
              chat (next to the message input), then navigate to{" "}
              <code className="font-mono">/diag</code>.
            </div>
          </div>
        )}

        {inTelegram && initData.length === 0 && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-100">
            <div className="font-bold mb-1">⚠ Inside Telegram but initData is empty.</div>
            <div>
              You probably opened the page via a chat link, not the bot's menu button. Go
              back to the bot chat and tap the squared menu button to launch the WebApp
              properly.
            </div>
          </div>
        )}

        <div className="mt-6 text-[10px] text-muted-foreground text-center">
          tick #{tick} · {new Date().toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
}
