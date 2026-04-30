/**
 * Telega.io InApp SDK helpers.
 *
 * The SDK script is loaded once via the <script> tag in client/index.html.
 * It exposes `window.TelegaIn.AdsController.create_miniapp({ token })`, whose
 * instance has `ad_show({ adBlockUuid })`.
 *
 * IMPORTANT: telega.io's mini-app monetization only works inside Telegram.
 * The SDK posts `window.Telegram.WebApp.initData` to authenticate; outside
 * Telegram (e.g. a normal browser preview) initData is null and ads will not
 * load. Always test from the bot's menu button.
 *
 * There is no banner widget — every ad format goes through ad_show().
 */

function getAdsController(token: string) {
  if (!token) return null;
  const TelegaIn = (window as any).TelegaIn;
  if (!TelegaIn?.AdsController?.create_miniapp) {
    console.warn("[telega.io] SDK not loaded (TelegaIn missing). Are you online and inside Telegram?");
    return null;
  }
  const cacheKey = `__telegaInAds_${token}`;
  if (!(window as any)[cacheKey]) {
    try {
      (window as any)[cacheKey] = TelegaIn.AdsController.create_miniapp({ token });
    } catch (e) {
      console.error("[telega.io] create_miniapp failed:", e);
      return null;
    }
  }
  return (window as any)[cacheKey];
}

export function isInsideTelegram(): boolean {
  const tg = (window as any).Telegram?.WebApp;
  return !!(tg && tg.initData && tg.initData.length > 0);
}

export function isTelegaioSdkLoaded(): boolean {
  const TelegaIn = (window as any).TelegaIn;
  return !!TelegaIn?.AdsController?.create_miniapp;
}

export async function showTelegaioAd(token: string, adBlockUuid: string): Promise<boolean> {
  if (!token || !adBlockUuid) {
    console.warn("[telega.io] Missing token or adBlockUuid — skipping ad.");
    return false;
  }
  if (!isInsideTelegram()) {
    console.warn(
      "[telega.io] Not running inside Telegram (Telegram.WebApp.initData is empty). " +
        "Telega.io ads only work when the mini app is opened from the bot's menu button. " +
        "Open the app via your bot in Telegram to test ads."
    );
    return false;
  }
  const ads = getAdsController(token);
  if (!ads?.ad_show) {
    console.warn("[telega.io] AdsController unavailable — skipping ad.");
    return false;
  }
  try {
    console.log("[telega.io] ad_show start", { adBlockUuid });
    await ads.ad_show({ adBlockUuid });
    console.log("[telega.io] ad_show finished");
    return true;
  } catch (e) {
    console.error("[telega.io] ad_show error:", e);
    return false;
  }
}
