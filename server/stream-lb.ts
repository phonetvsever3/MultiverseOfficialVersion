/**
 * Stream Load Balancer
 *
 * Distributes /api/hls/* and /api/stream/* traffic across multiple
 * Replit backend instances using round-robin rotation with automatic
 * failover. Each backend independently fetches from Telegram, so any
 * backend can serve any chunk.
 *
 * Routes intercepted (when LB is enabled):
 *   GET /api/hls/:type/:id/playlist.m3u8
 *   GET /api/hls/:type/:id/chunk/:index.ts
 *   GET /api/stream/:type/:id
 */

import type { Express, Request, Response } from "express";
import https from "https";
import http from "http";
import { storage } from "./storage";
import type { StreamBackend } from "@shared/schema";

let roundRobinIndex = 0;

function pickBackend(backends: StreamBackend[]): StreamBackend | null {
  const healthy = backends.filter(b => b.isActive && b.isHealthy !== false);
  if (healthy.length === 0) {
    const active = backends.filter(b => b.isActive);
    if (active.length === 0) return null;
    const idx = roundRobinIndex % active.length;
    roundRobinIndex = (roundRobinIndex + 1) % active.length;
    return active[idx];
  }
  const idx = roundRobinIndex % healthy.length;
  roundRobinIndex = (roundRobinIndex + 1) % healthy.length;
  return healthy[idx];
}

function proxyToBackend(
  backendUrl: string,
  req: Request,
  res: Response
): Promise<boolean> {
  return new Promise((resolve) => {
    const target = new URL(backendUrl);
    const options = {
      hostname: target.hostname,
      port: target.port || (target.protocol === "https:" ? 443 : 80),
      path: req.url,
      method: req.method,
      headers: {
        ...req.headers,
        host: target.hostname,
        "x-forwarded-for": req.ip || "",
        "x-lb-proxy": "1",
      },
      timeout: 30000,
    };

    const protocol = target.protocol === "https:" ? https : http;

    const proxyReq = protocol.request(options, (proxyRes) => {
      if (res.headersSent) { resolve(true); return; }
      res.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers as any);
      proxyRes.pipe(res);
      proxyRes.on("end", () => resolve(true));
      proxyRes.on("error", () => resolve(false));
    });

    proxyReq.on("timeout", () => {
      proxyReq.destroy();
      resolve(false);
    });

    proxyReq.on("error", () => resolve(false));

    if (req.method !== "GET" && req.method !== "HEAD") {
      req.pipe(proxyReq);
    } else {
      proxyReq.end();
    }
  });
}

async function checkBackendHealth(url: string): Promise<boolean> {
  try {
    const target = new URL(url);
    const healthPath = "/api/settings";
    return await new Promise((resolve) => {
      const options = {
        hostname: target.hostname,
        port: target.port || (target.protocol === "https:" ? 443 : 80),
        path: healthPath,
        method: "HEAD",
        timeout: 8000,
      };
      const protocol = target.protocol === "https:" ? https : http;
      const req = protocol.request(options, (res) => {
        resolve(res.statusCode !== undefined && res.statusCode < 500);
        res.resume();
      });
      req.on("error", () => resolve(false));
      req.on("timeout", () => { req.destroy(); resolve(false); });
      req.end();
    });
  } catch {
    return false;
  }
}

export async function runStreamBackendHealthCheck() {
  try {
    const backends = await storage.getStreamBackends();
    if (backends.length === 0) return;
    await Promise.all(
      backends.map(async (b) => {
        const healthy = await checkBackendHealth(b.url);
        await storage.updateStreamBackendHealth(b.id, healthy);
        console.log(`[StreamLB] ${b.label || b.url} → ${healthy ? "✓ OK" : "✗ FAIL"}`);
      })
    );
  } catch (e) {
    console.error("[StreamLB] Health check error:", e);
  }
}

const STREAM_PATHS = [
  /^\/api\/hls\//,
  /^\/api\/stream\//,
];

function isStreamPath(path: string): boolean {
  return STREAM_PATHS.some(re => re.test(path));
}

export function registerStreamLbRoutes(app: Express) {
  app.use(async (req: Request, res: Response, next) => {
    if (!isStreamPath(req.path)) return next();

    try {
      const settings = await storage.getSettings();
      if (!settings?.lbEnabled) return next();

      const backends = await storage.getActiveStreamBackends();
      if (backends.length === 0) return next();

      const backend = pickBackend(backends);
      if (!backend) return next();

      console.log(`[StreamLB] ${req.method} ${req.path} → ${backend.label || backend.url}`);

      storage.incrementStreamBackendRequestCount(backend.id).catch(() => {});

      const success = await proxyToBackend(backend.url, req, res);

      if (!success && !res.headersSent) {
        const remaining = backends.filter(b => b.id !== backend.id && b.isActive);
        for (const fallback of remaining) {
          console.log(`[StreamLB] Fallback to ${fallback.label || fallback.url}`);
          const ok = await proxyToBackend(fallback.url, req, res);
          if (ok) return;
        }
        if (!res.headersSent) {
          res.status(502).json({ message: "All stream backends are unavailable. Please try again later." });
        }
      }
    } catch (err: any) {
      console.error("[StreamLB] Error:", err?.message);
      if (!res.headersSent) next();
    }
  });
}

export function initStreamLbHealthCheck() {
  runStreamBackendHealthCheck();
  setInterval(runStreamBackendHealthCheck, 5 * 60 * 1000);
  console.log("[StreamLB] Health checks initialized — every 5 minutes.");
}
