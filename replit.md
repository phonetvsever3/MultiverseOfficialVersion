# CineBot - Telegram Movie Bot Admin Panel

## Overview

CineBot is a Telegram Mini App and Bot platform for managing and distributing movies and series content. It consists of three main parts:

1. **Admin Dashboard** - Web-based management interface for movies, channels, ads, and GitHub backups
2. **Telegram Bot** - Handles user interactions, movie delivery, search by name/cast/year, and adult content filtering
3. **Mini App** - User-facing Netflix-like interface accessed through Telegram for browsing and watching content

The platform enables administrators to manage a movie library, configure source/backup Telegram channels, run ad campaigns (including fullscreen interstitials), track user analytics, backup data to GitHub, and auto-add movies from filenames via TMDB.

## Recent Features Added
- **Landing Page with Smart Link Redirect** (`public/landing.html`, `server/routes.ts`, `client/src/pages/admin/Settings.tsx`, `shared/schema.ts`): A self-contained premium cinema-themed landing page served at `/landing.html`. Features two large touch-friendly buttons ("Watch Now" and "Download Now") that trigger a full-screen dark overlay with a 5-second countdown timer, progress bar, spinner, and "Continue ▶️" / "Skip ▶️" buttons. Users can click Continue or Skip at any time — no forced waiting. When the countdown ends or user clicks, the page redirects in the same tab to the configured Smart Link URL. The Smart Link URL is set via Admin → Settings → "Landing Page Smart Link" card and stored in the `smart_link_url` column in settings. A public API endpoint `/api/public/smart-link` serves the URL without authentication so the HTML page can fetch it dynamically.


- **TikTok Generator — Trailer Clip Position + Custom Audio** (`client/src/pages/admin/TikTokDashboard.tsx`, `server/tiktok-video.ts`, `server/routes.ts`): Added two major controls to the Movie Promo Generator: (1) **Trailer Clip Position** — choose which part of the YouTube trailer to cut into Scene 2: Beginning (10%), Action (42%), Climax (65%), or Final (80%). The scene badge and preview update in real-time to reflect the chosen position. (2) **Audio Track** — paste any direct MP3 URL or YouTube music link to use as custom background audio, completely replacing the generated music. If the custom URL fails to download it falls back to generated music. Music style picker only appears when no custom audio URL is set. `server/tiktok-video.ts` gained a `downloadCustomAudio()` helper and updated `downloadTrailerClip()` to accept a `seekPercent` parameter.


- **Advanced Python TikTok Video Generator** (`tiktok_generator/generate_video.py`): Full Python module that generates cinematic 1080x1920 TikTok-ready MP4 videos using FFmpeg. Features: blurred poster background, Ken Burns slow-zoom foreground, fade in/out transitions, timed text overlays (hook, title, hashtags), and optional background music with audio fades. Accepts `--title`, `--poster_url`, `--hook`, `--bot_token`, `--chat_id` CLI args. Called from `server/tiktok-video.ts` via Python subprocess. Requires Python 3.11+ (installed as a module). Background music can be added at `tiktok_generator/assets/background_music.mp3`.

- **Auto-Fullscreen + Landscape Lock on Player Open** (`client/src/components/VideoPlayer.tsx`): When the video player mounts (user opens a stream), it automatically calls `Telegram.WebApp.requestFullscreen()` to enter native fullscreen and locks the device to landscape orientation. On player close (unmount), it exits fullscreen and unlocks orientation. The `lockLandscape()` and `unlockOrientation()` utilities were already present; this adds an auto-trigger `useEffect` on mount.
- **Multi-Quality Stream Support** (`shared/schema.ts`, `client/src/pages/app/Stream.tsx`, `client/src/pages/admin/Movies.tsx`): Added `qualityUrls` JSONB column to the `movies` table. Admins can add per-movie quality stream URLs (480p, 720p, 1080p, 4K — MP4 or HLS) from the movie edit dialog. Stream.tsx parses these and builds a `VideoSource[]` array; the quality picker in VideoPlayer (already functional when `sources.length > 1`) then shows all options. The built-in Telegram stream is always appended as "Auto".
- **Stream ON/OFF Master Switch** (`shared/schema.ts`, `server/hls-stream.ts`, `client/src/pages/admin/FileStreamBot.tsx`): Added `streamEnabled` boolean column to settings. All `/api/hls/` and `/api/stream/` routes check this flag at the top and return 503 if disabled. Admin can toggle streaming on/off instantly from a prominent card on the FileStreamBot page — shows green/red status with descriptive text.
- **Bot API Fallback on MTProto Expiry** (`server/hls-stream.ts`): When MTProto streaming fails with `FILE_REFERENCE_EXPIRED` (even after refresh attempt), both the HLS chunk handler and the direct MP4 stream handler now automatically fall back to calling the Bot API `getFile` endpoint to obtain a fresh CDN URL and proxy from there. Works for files ≤ 20 MB; for larger files with unresolvable references, returns a clear actionable error message.
- **HLS Streaming with Built-in MTProto** (`server/hls-stream.ts`, `server/tg-stream.ts`): Generates M3U8 playlists and streams 1 MB `.ts` byte-range chunks. Priority: (1) FSB `streamUrl` if set, (2) **built-in MTProto via gramjs** — connects using `fsbApiId`/`fsbApiHash`/`fsbBotToken` from settings, decodes the Bot API fileId, and streams any file size directly from Telegram's MTProto API, bypassing the 20 MB limit, (3) Bot HTTP API fallback for small files ≤ 20 MB. Routes: `GET /api/hls/[movie|episode]/:id/playlist.m3u8`, `GET /api/hls/[movie|episode]/:id/chunk/:index.ts`. Gramjs singleton client is reused across requests.
- **Support Page** (`/app/support`): New user-facing page with "Talk to Admin" (opens Telegram chat) and "Advertising Info" section showing configurable packages. Users click a package to start a pre-filled Telegram chat with the admin.
- **Support & Advertising Settings**: Admin Settings page now has a "Support & Advertising" card to set the admin Telegram username and add/remove advertising packages (name, price, description).
- **Fullscreen Ad Scheduling**: Fullscreen interstitial ads now support Start Date/Time and Expire Date/Time. The `/api/ads/fullscreen` endpoint only returns ads within their active schedule window. Admin panel shows Live/Scheduled/Expired status badges.
- **Premium Movie/Series Sections on Home**: Added "New Movies", "New Series", and "Action" as premium-styled sections with larger cards, colored gradient headers, crown badges, and separate section identities.
- **Support Button in App Top Bar**: Headphones icon in the top bar of the home page navigates to the Support page.
- **URL Manager** (`/admin/app-urls`): Add unlimited bot Open App URLs, enable/disable rotation (ON/OFF toggle), track visit count per URL. Bot randomly picks an active URL when rotation is ON.
- **Users Page** (`/admin/users`): Dedicated page with total user count, admin count, and full user table separated from Overview.
- **Database Tables Viewer** (`/admin/db-tables`): Browse all 12 database tables individually — movies, episodes, channels, users, ads, settings, backups, mascot_settings, football_api_keys, view_logs, synced_files, app_urls.
- **Dashboard Quick Links**: Overview now shows shortcut cards to Users, URL Manager, and DB Tables instead of embedding user table inline.
- **Netflix-like Home Screen** (`/app`): Hero slider, Latest Uploads, Top Movies, Top Series, Most Viewed sections
- **Search Page** (`/app/search`): Real-time search with movie/series filter tabs
- **Fullscreen Interstitial Ads**: Admin can create ads with image/video URL, ad text, button text & URL. Shows randomly on movie/series detail pages with 5-second auto-close timer
- **Auto-Add Movie from Filename**: In Synced Files, click "Auto Add" to parse filename, fetch TMDB details, and create movie automatically. Supports formats like `Movie.Title.2025.720p.WEB-DL.mp4` and `Movie Title (2025) 1080p.mp4`
- **Adult Shows** (`/app/adult`): 8 adult-content categories in horizontal scroll (series style), 320x50px banner ads after categories 2, 4 and 8, fullscreen ad on entry
- **Football Live** (`/app/football`): Live match scores & streams via SportSRC API. Tabs for Live/Upcoming/Finished. Click any match to view stream.
- **Football Admin** (`/admin/football`): Add/remove/toggle unlimited SportSRC API keys. One key is chosen randomly per API call for load balancing.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with custom cinema dark theme
- **Build Tool**: Vite with HMR support
- **Animations**: Framer Motion for smooth transitions

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript with ESM modules
- **API Design**: RESTful endpoints defined in shared/routes.ts with Zod validation
- **Bot Integration**: node-telegram-bot-api for Telegram Bot functionality
- **GitHub Integration**: GitHub API for automated backups

### Data Storage
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM with drizzle-zod for schema validation
- **Schema Location**: shared/schema.ts contains all table definitions
- **Migrations**: Drizzle Kit with `db:push` command

### Database Schema
Key tables include:
- `movies` - Movie/series metadata with file references and genres
- `episodes` - Series episode details
- `channels` - Telegram source and backup channel configuration  
- `users` - Bot user tracking
- `ads` - Advertisement campaign management
- `settings` - Global bot settings including bot token, TMDB API key, and GitHub configuration
- `backups` - Backup history with status and timestamps
- `synced_files` - Files synced from Telegram channels
- `football_api_keys` - SportSRC API keys for football streaming (multiple supported, random rotation)

### Project Structure
```
client/           # React frontend
  src/
    components/   # UI components including shadcn/ui
    hooks/        # React Query hooks for API calls
    pages/        # Route components (admin/*, app/*)
    lib/          # Utilities and query client
server/           # Express backend
  bot.ts          # Telegram bot logic with search and menu commands
  db.ts           # Database connection
  routes.ts       # API route handlers
  storage.ts      # Data access layer
  github-backup.ts # GitHub backup functionality
  backup-scheduler.ts # Auto-backup scheduling
shared/           # Shared code between client/server
  schema.ts       # Drizzle database schema including backups table
  routes.ts       # API route definitions with Zod schemas
```

### API Structure
Routes are defined declaratively in `shared/routes.ts` with:
- Path templates
- HTTP methods
- Input validation schemas (Zod)
- Response type definitions

This enables type-safe API consumption on both client and server.

## Recent Features

### GitHub Backup System (NEW)
- **Manual Backup**: One-click backup of movies, episodes, channels, and ads to GitHub
- **Auto Backup**: Automatic daily backups (configurable in settings)
- **Backup History**: View all backup attempts with success/failure status and timestamps
- **GitHub Configuration**: Store GitHub personal access token and repository details securely in database
- **Backup Location**: Files stored in `backups/` directory in your GitHub repo

### Telegram Bot Enhancements (NEW)
- **Search Command**: `/search <name/actor/year>` - Search by movie name, actor name, or release year
- **Top Rated Menu**: `/top` or "🔥 Top Rated" button to view top movies
- **Adult Section**: "👁️ Adult Only" menu button with premium access placeholder
- **Menu Commands**: Bot displays search and top rated commands in Telegram menu

### Movie/Series Enhancements (NEW)
- **Genre Field**: Add genres (e.g., "Action, Drama, Comedy") when creating/editing movies
- **File Size Display**: Shows file sizes in MB or GB (≥1GB displays as GB)
- **Ad Rendering**: Improved ad display with support for Adsterra scripts, custom HTML, images, and videos

## External Dependencies

### Telegram Integration
- **node-telegram-bot-api**: Bot polling and message handling
- Bot token stored in database settings or `TELEGRAM_BOT_TOKEN` environment variable
- Mini App integration via Telegram Web App API

### Database
- **PostgreSQL**: Primary database via `DATABASE_URL` environment variable
- **Drizzle ORM**: Type-safe database operations

### GitHub Integration
- **GitHub API**: For creating backups as JSON files in GitHub repositories
- Personal access token required (with `repo` scope)
- Automatic daily backups available when configured

### Ad Networks
- Support for Adsterra and custom banner/redirect/native ads
- Ad serving with impression tracking
- Dynamic ad rendering with script execution support

### Development Tools
- Replit-specific Vite plugins for development banners and error overlays
- ESBuild for production server bundling

## Setup Instructions

### GitHub Backup Setup
1. Go to GitHub Settings → Developer settings → Personal access tokens
2. Create a new token with `repo` scope
3. In CineBot admin, go to GitHub Backup page
4. Click "Configure GitHub"
5. Paste your token, enter repository (owner/repo), and branch name
6. Toggle "Enable Auto Backup" for daily automatic backups
7. Click "Backup Now" to test

### Bot Search Features
- Users can search by `/search <query>` in Telegram
- Search queries match movie titles, actor names, and release years
- "🔍 Search Movie" button prompts for manual search input
