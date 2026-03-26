import { storage } from "./storage";
import { db } from "./db";
import { appUrls } from "@shared/schema";
import { eq } from "drizzle-orm";

const CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

async function checkUrl(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    const res = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);
    return res.ok || res.status === 405; // 405 = Method Not Allowed means server responded
  } catch {
    // Try GET as fallback if HEAD fails
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(url, {
        method: "GET",
        signal: controller.signal,
        redirect: "follow",
      });
      clearTimeout(timeout);
      return res.ok || res.status === 405;
    } catch {
      return false;
    }
  }
}

async function runHealthCheck() {
  try {
    const urls = await storage.getAppUrls();
    if (urls.length === 0) return;

    console.log(`[URL Checker] Checking ${urls.length} URL(s)...`);

    await Promise.all(
      urls.map(async (entry) => {
        const healthy = await checkUrl(entry.url);
        await db.update(appUrls)
          .set({ isHealthy: healthy, lastChecked: new Date() })
          .where(eq(appUrls.id, entry.id));
        console.log(`[URL Checker] ${entry.url} → ${healthy ? "✓ OK" : "✗ FAIL"}`);
      })
    );

    console.log("[URL Checker] Health check complete.");
  } catch (e) {
    console.error("[URL Checker] Error during health check:", e);
  }
}

export { runHealthCheck };

export function initUrlChecker() {
  // Run immediately on start
  runHealthCheck();
  // Then every 10 minutes
  setInterval(runHealthCheck, CHECK_INTERVAL_MS);
  console.log("[URL Checker] Initialized — checks every 10 minutes.");
}
