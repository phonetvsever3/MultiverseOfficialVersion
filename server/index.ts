import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import path from "path";
import fs from "fs";
import session from "express-session";
import MemoryStore from "memorystore";
import { initUrlChecker } from "./url-checker";

const SessionStore = MemoryStore(session);

const app = express();
const httpServer = createServer(app);

// ── Security: block sourcemap files from being served externally ──────────────
// In production, source maps are disabled anyway. In dev, block .map requests
// so even if a map file were generated, it won't be downloadable.
app.use((req, res, next) => {
  if (req.path.endsWith(".map")) {
    return res.status(404).end();
  }
  next();
});

// ── Security: HTTP headers ────────────────────────────────────────────────────
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

// ── Security: login rate limiter (max 10 attempts per 15 min per IP) ─────────
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const LOGIN_MAX = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

function loginRateLimiter(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (req.method !== "POST" || req.path !== "/api/admin/login") return next();
  const ip = (req.headers["x-forwarded-for"] as string || req.socket.remoteAddress || "unknown").split(",")[0].trim();
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (entry && now < entry.resetAt) {
    if (entry.count >= LOGIN_MAX) {
      const wait = Math.ceil((entry.resetAt - now) / 60000);
      return res.status(429).json({ message: `Too many login attempts. Try again in ${wait} minute(s).` });
    }
    entry.count++;
  } else {
    loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
  }
  next();
}
// Clean up stale entries every 30 min
setInterval(() => {
  const now = Date.now();
  for (const [ip, e] of loginAttempts.entries()) {
    if (now >= e.resetAt) loginAttempts.delete(ip);
  }
}, 30 * 60 * 1000);

// Prevent unhandled promise rejections from crashing the process
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
});

// Apply login rate limiter early (before body parsing so it's fast)
app.use(loginRateLimiter);

// Serve uploaded files statically
const uploadsDir = path.resolve("public/uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use("/uploads", express.static(uploadsDir));

// Serve lottie animation files statically
const lottieDir = path.resolve("public/lottie");
if (!fs.existsSync(lottieDir)) fs.mkdirSync(lottieDir, { recursive: true });
app.use("/lottie", express.static(lottieDir));

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "cinebot-admin-secret-key-2024",
    resave: false,
    saveUninitialized: false,
    store: new SessionStore({ checkPeriod: 3600000, max: 500 }),
    cookie: {
      httpOnly: true,
      secure: false,
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
);

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);
  initUrlChecker();

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    console.error(`[Error] ${status} — ${message}`, err.stack || "");
    if (!res.headersSent) res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );

  // Graceful shutdown — ensures the port is released before the process exits
  // so that a restarted instance doesn't hit EADDRINUSE
  const shutdown = () => {
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
})();
