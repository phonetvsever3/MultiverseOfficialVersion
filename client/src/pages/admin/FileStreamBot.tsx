import { useState, useRef } from "react";
import { AdminSidebar } from "@/components/AdminSidebar";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Loader2, Zap, Search, Link2, LinkIcon, Unlink, ChevronLeft, ChevronRight,
  CheckCircle2, XCircle, ExternalLink, Tv, Film, Edit2, X, Check,
  ChevronDown, ChevronUp, Server, Bot, Settings2, Copy, ArrowRight,
  AlertCircle, Info, Globe, Save,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { buildFsbUrl } from "@/lib/fsb";
import { type Settings } from "@shared/schema";

interface FsbMovie {
  id: number;
  title: string;
  type: "movie" | "series";
  quality: string;
  posterPath: string | null;
  streamUrl: string | null;
  fileId: string | null;
  fileSize: number | null;
}

interface FsbMoviesResponse {
  items: FsbMovie[];
  total: number;
  page: number;
  totalPages: number;
}

interface Episode {
  id: number;
  movieId: number;
  seasonNumber: number;
  episodeNumber: number;
  title: string | null;
  streamUrl: string | null;
  fileId: string | null;
}

// ── Small helpers ────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="ml-1 inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors"
      title="Copy"
    >
      {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

function StepBadge({ n, done }: { n: number; done: boolean }) {
  return (
    <div className={cn(
      "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 border-2 transition-colors",
      done
        ? "bg-green-500 border-green-500 text-white"
        : "bg-transparent border-primary/40 text-primary"
    )}>
      {done ? <Check className="w-3.5 h-3.5" /> : n}
    </div>
  );
}

// ── Setup Guide ──────────────────────────────────────────────────────────────

function SetupGuide({ settings, onTest, testing, testResult, onClearTest }: {
  settings: Settings | undefined;
  onTest: () => void;
  testing: boolean;
  testResult: { ok: boolean; message: string } | null;
  onClearTest: () => void;
}) {
  const [open, setOpen] = useState(!settings?.fsbEnabled);

  const step1Done = true; // always available (just needs reading)
  const step2Done = !!settings?.fsbBaseUrl;
  const step3Done = !!settings?.fsbEnabled && testResult?.ok === true;
  const allDone = step2Done && settings?.fsbEnabled;

  return (
    <Card className={cn("mb-6 border-2 transition-colors", allDone ? "border-green-500/30 bg-green-500/5" : "border-yellow-500/20 bg-yellow-500/5")}>
      <button
        className="w-full text-left"
        onClick={() => setOpen(o => !o)}
        data-testid="button-toggle-setup-guide"
      >
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-3 text-base">
              {allDone
                ? <CheckCircle2 className="w-5 h-5 text-green-400" />
                : <AlertCircle className="w-5 h-5 text-yellow-400" />}
              {allDone ? "FileStreamBot is configured and active" : "Setup Required — How FileStreamBot Works"}
            </CardTitle>
            {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </div>
          {!open && !allDone && (
            <p className="text-xs text-muted-foreground ml-8">Click to expand the setup guide</p>
          )}
          {!open && allDone && (
            <p className="text-xs text-muted-foreground ml-8">
              Base URL: <code className="font-mono text-primary">{settings?.fsbBaseUrl}</code>
            </p>
          )}
        </CardHeader>
      </button>

      {open && (
        <CardContent className="space-y-0 pt-0 pb-6">

          {/* What is it */}
          <div className="mb-6 px-1">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
              <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-foreground/80 leading-relaxed space-y-1.5">
                <p><strong className="text-foreground">What is TG-FileStreamBot?</strong></p>
                <p>
                  Telegram only allows downloading files up to <strong>20 MB</strong> through the normal bot API. Your movies are much larger (300–900 MB),
                  so a normal bot can't stream them directly.
                </p>
                <p>
                  <strong>TG-FileStreamBot</strong> is a separate web server you run that connects to Telegram using the <em>MTProto</em> protocol
                  (the same one Telegram apps use). It can stream <strong>any size file</strong> from Telegram over a normal HTTP URL —
                  so users can watch directly in a browser without downloading the whole file.
                </p>
                <p className="text-muted-foreground">
                  You need: a server (VPS/cloud) to run it, a Telegram API ID &amp; Hash (free from my.telegram.org), and your bot token.
                </p>
              </div>
            </div>
          </div>

          {/* Steps */}
          <div className="space-y-6 px-1">

            {/* Step 1 */}
            <div className="flex gap-4">
              <StepBadge n={1} done={false} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <Server className="w-4 h-4 text-primary" />
                  <h3 className="font-semibold text-sm text-foreground">Deploy TG-FileStreamBot on a server</h3>
                </div>
                <div className="text-xs text-muted-foreground space-y-3 leading-relaxed">
                  <p>You need a public server (e.g. a cheap VPS like DigitalOcean, Hetzner, or any cloud). The bot must be accessible over the internet.</p>

                  <div className="bg-muted/30 rounded-xl border border-border/50 p-4 space-y-3">
                    <p className="text-foreground font-semibold text-[11px] uppercase tracking-wider">Quick deploy steps:</p>

                    <div className="space-y-2">
                      <p className="font-medium text-foreground/80">① Get your Telegram API credentials (free)</p>
                      <div className="pl-3 space-y-1 text-muted-foreground">
                        <p>→ Go to <a href="https://my.telegram.org" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">my.telegram.org</a> → Log in → "API development tools"</p>
                        <p>→ Create an app — copy your <strong className="text-foreground">API_ID</strong> and <strong className="text-foreground">API_HASH</strong></p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="font-medium text-foreground/80">② Clone and run FileStreamBot on your server</p>
                      <div className="pl-3 space-y-2">
                        <div className="bg-black/40 rounded-lg px-3 py-2 font-mono text-[11px] text-green-400 space-y-1">
                          <div className="flex items-center justify-between">
                            <span>git clone https://github.com/EverythingSuckz/TG-FileStreamBot</span>
                            <CopyButton text="git clone https://github.com/EverythingSuckz/TG-FileStreamBot" />
                          </div>
                          <div>cd TG-FileStreamBot</div>
                          <div>cp .env.sample .env</div>
                          <div>nano .env  <span className="text-white/40"># fill in your values</span></div>
                          <div>pip install -r requirements.txt</div>
                          <div>python -m bot</div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="font-medium text-foreground/80">③ Required .env variables</p>
                      <div className="pl-3">
                        <div className="bg-black/40 rounded-lg px-3 py-2 font-mono text-[11px] space-y-1 text-foreground/80">
                          <div><span className="text-yellow-400">API_ID</span>=<span className="text-green-400">12345678</span><span className="text-white/30"> # from my.telegram.org</span></div>
                          <div><span className="text-yellow-400">API_HASH</span>=<span className="text-green-400">abc123...</span><span className="text-white/30"> # from my.telegram.org</span></div>
                          <div><span className="text-yellow-400">BOT_TOKEN</span>=<span className="text-green-400">123456:ABC...</span><span className="text-white/30"> # your bot token</span></div>
                          <div><span className="text-yellow-400">BIN_CHANNEL</span>=<span className="text-green-400">-1001234567890</span><span className="text-white/30"> # a private channel ID (bot must be admin)</span></div>
                          <div><span className="text-yellow-400">PORT</span>=<span className="text-green-400">8000</span></div>
                          <div><span className="text-yellow-400">FQDN</span>=<span className="text-green-400">your-server-domain.com</span><span className="text-white/30"> # your public IP or domain</span></div>
                          <div><span className="text-yellow-400">HAS_SSL</span>=<span className="text-green-400">False</span><span className="text-white/30"> # True if you have HTTPS</span></div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="font-medium text-foreground/80">④ Or use Docker (easier)</p>
                      <div className="pl-3">
                        <div className="bg-black/40 rounded-lg px-3 py-2 font-mono text-[11px] text-green-400 space-y-1">
                          <div className="flex items-center justify-between">
                            <span>docker-compose up -d</span>
                            <CopyButton text="docker-compose up -d" />
                          </div>
                        </div>
                      </div>
                    </div>

                    <p className="text-muted-foreground text-[11px]">
                      Once running, your FSB will be accessible at <code className="text-primary font-mono">http://your-server-ip:8000</code> (or your domain if you set up a reverse proxy with HTTPS).
                    </p>
                  </div>

                  <a
                    href="https://github.com/EverythingSuckz/TG-FileStreamBot"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                    data-testid="link-fsb-github"
                  >
                    <ExternalLink className="w-3 h-3" /> TG-FileStreamBot on GitHub →
                  </a>
                </div>
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-border/30 ml-4" />

            {/* Step 2 */}
            <div className="flex gap-4">
              <StepBadge n={2} done={step2Done} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <Settings2 className="w-4 h-4 text-primary" />
                  <h3 className="font-semibold text-sm text-foreground">Configure the URL in Settings</h3>
                  {step2Done && <Badge variant="outline" className="text-[9px] h-4 text-green-400 border-green-500/30">Done</Badge>}
                </div>
                <div className="text-xs text-muted-foreground space-y-2 leading-relaxed">
                  <p>Go to <a href="/admin/settings" className="text-primary hover:underline" data-testid="link-to-settings">Admin → Settings → FileStreamBot section</a> and fill in:</p>
                  <ul className="pl-4 space-y-1 list-disc">
                    <li><strong className="text-foreground">FSB Base URL</strong> — the public address of your running FSB (e.g. <code className="font-mono text-primary text-[11px]">https://stream.yourdomain.com</code>)</li>
                    <li><strong className="text-foreground">Hash Length</strong> — leave at <code className="font-mono text-[11px]">6</code> unless you changed it in your FSB config</li>
                    <li><strong className="text-foreground">Enable FileStreamBot</strong> — toggle ON to show Play buttons to users</li>
                  </ul>
                  {!step2Done && (
                    <a
                      href="/admin/settings"
                      className="inline-flex items-center gap-1.5 mt-1 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors"
                      data-testid="link-go-settings"
                    >
                      Open Settings <ArrowRight className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-border/30 ml-4" />

            {/* Step 3 */}
            <div className="flex gap-4">
              <StepBadge n={3} done={testResult?.ok === true} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="w-4 h-4 text-yellow-400" />
                  <h3 className="font-semibold text-sm text-foreground">Test the connection</h3>
                  {testResult?.ok && <Badge variant="outline" className="text-[9px] h-4 text-green-400 border-green-500/30">Reachable</Badge>}
                </div>
                <div className="text-xs text-muted-foreground space-y-3">
                  <p>Click the button to verify your admin dashboard can reach your FileStreamBot server.</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={onTest}
                    disabled={testing || !step2Done}
                    data-testid="button-test-fsb-guide"
                    className="h-8"
                  >
                    {testing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2 text-yellow-400" />}
                    Test Connection
                  </Button>
                  {!step2Done && <p className="text-yellow-500/70 text-[11px]">Set the Base URL in Settings first.</p>}
                  {testResult && (
                    <div className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-lg border text-xs",
                      testResult.ok ? "bg-green-500/10 border-green-500/30 text-green-400" : "bg-red-500/10 border-red-500/30 text-red-400"
                    )}>
                      {testResult.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                      <span>{testResult.message}</span>
                      <button onClick={onClearTest} className="ml-auto"><X className="w-3 h-3" /></button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-border/30 ml-4" />

            {/* Step 4 */}
            <div className="flex gap-4">
              <StepBadge n={4} done={false} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <Bot className="w-4 h-4 text-primary" />
                  <h3 className="font-semibold text-sm text-foreground">Get stream URLs for your movies</h3>
                </div>
                <div className="text-xs text-muted-foreground space-y-3 leading-relaxed">
                  <p>For each movie you want to stream, you need its FSB stream URL. Here's how:</p>

                  <div className="space-y-3">
                    <div className="flex gap-3 items-start p-3 rounded-xl bg-muted/20 border border-border/40">
                      <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
                      <div>
                        <p className="font-medium text-foreground/80 mb-0.5">Forward the file to your FileStreamBot</p>
                        <p className="text-muted-foreground">Open Telegram → find the movie file in your channel → forward it to your FSB's Telegram bot (the same bot token you configured in FSB).</p>
                      </div>
                    </div>

                    <div className="flex gap-3 items-start p-3 rounded-xl bg-muted/20 border border-border/40">
                      <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
                      <div>
                        <p className="font-medium text-foreground/80 mb-0.5">Bot replies with a stream link</p>
                        <p className="text-muted-foreground">The bot will reply with a URL that looks like:</p>
                        <div className="mt-1.5 bg-black/30 rounded-lg px-3 py-2 font-mono text-[11px] text-primary flex items-center gap-2">
                          <span className="truncate">https://stream.yourdomain.com/stream/12345?hash=a1b2c3</span>
                          <CopyButton text="https://stream.yourdomain.com/stream/12345?hash=a1b2c3" />
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-3 items-start p-3 rounded-xl bg-muted/20 border border-border/40">
                      <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
                      <div>
                        <p className="font-medium text-foreground/80 mb-0.5">Paste the URL in the table below</p>
                        <p className="text-muted-foreground">Find the movie in the list below → click <strong className="text-foreground">"Add stream URL"</strong> → paste the URL → press Enter or click the green checkmark.</p>
                      </div>
                    </div>

                    <div className="flex gap-3 items-start p-3 rounded-xl bg-green-500/10 border border-green-500/20">
                      <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-green-400 mb-0.5">Done! Play button appears automatically</p>
                        <p className="text-muted-foreground">Once a movie has a stream URL and FSB is enabled, a green <strong className="text-white">▶ Watch Now</strong> button will appear on that movie's page in the Mini App for all users.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ── Inline URL editor ─────────────────────────────────────────────────────────

function InlineEdit({
  value, onSave, onClear, fileId, fsbBaseUrl, fsbHashLength,
}: {
  value: string | null;
  onSave: (v: string) => void;
  onClear: () => void;
  fileId?: string | null;
  fsbBaseUrl?: string;
  fsbHashLength?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState<"url" | "id">("url");
  const [draft, setDraft] = useState(value || "");
  const [idDraft, setIdDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = (prefillId?: string) => {
    if (prefillId) {
      setMode("id");
      setIdDraft(prefillId);
    } else {
      setMode("url");
      setDraft(value || "");
    }
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const getPreviewUrl = () => {
    if (!idDraft.trim() || !fsbBaseUrl) return null;
    return buildFsbUrl(fsbBaseUrl, idDraft.trim(), fsbHashLength ?? 6);
  };

  const save = () => {
    if (mode === "id") {
      const preview = getPreviewUrl();
      if (preview) onSave(preview);
      else onClear();
    } else {
      const trimmed = draft.trim();
      if (trimmed) onSave(trimmed);
      else onClear();
    }
    setEditing(false);
  };

  if (editing) {
    const previewUrl = mode === "id" ? getPreviewUrl() : null;
    return (
      <div className="flex flex-col gap-1.5 w-full">
        {/* Mode toggle */}
        <div className="flex items-center gap-1 mb-0.5">
          <button
            onClick={() => setMode("url")}
            className={cn("text-[10px] px-2 py-0.5 rounded font-semibold transition-colors", mode === "url" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground")}
          >Full URL</button>
          <button
            onClick={() => { setMode("id"); if (!idDraft && fileId) setIdDraft(fileId); }}
            className={cn("text-[10px] px-2 py-0.5 rounded font-semibold transition-colors", mode === "id" ? "bg-blue-500/20 text-blue-400" : "text-muted-foreground hover:text-foreground")}
          >From ID</button>
        </div>

        <div className="flex items-center gap-1.5 w-full">
          {mode === "url" ? (
            <Input
              ref={inputRef}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
              placeholder="https://stream.yourdomain.com/stream/123?hash=abc123"
              className="h-7 text-xs font-mono flex-1"
              data-testid="input-stream-url"
            />
          ) : (
            <div className="flex-1 flex flex-col gap-1">
              <Input
                ref={inputRef}
                value={idDraft}
                onChange={e => setIdDraft(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
                placeholder="Enter message ID (e.g. 12345)"
                className="h-7 text-xs font-mono"
                data-testid="input-stream-id"
              />
              {previewUrl && (
                <p className="text-[10px] font-mono text-blue-400/70 truncate px-1">
                  → {previewUrl}
                </p>
              )}
              {!fsbBaseUrl && (
                <p className="text-[10px] text-yellow-400/70 px-1">Set FSB Base URL in Quick Settings first</p>
              )}
            </div>
          )}
          <button onClick={save} className="h-7 w-7 flex-shrink-0 flex items-center justify-center rounded-lg bg-green-500/10 hover:bg-green-500/20 text-green-400 transition-colors">
            <Check className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setEditing(false)} className="h-7 w-7 flex-shrink-0 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 text-muted-foreground transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 min-w-0 flex-1">
      {value ? (
        <>
          <a
            href={value}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-mono text-blue-400 hover:text-blue-300 truncate max-w-[260px] flex items-center gap-1"
            data-testid="link-stream-url"
          >
            <ExternalLink className="w-3 h-3 flex-shrink-0" />
            {value.replace(/^https?:\/\//, "").substring(0, 50)}{value.length > 60 ? "…" : ""}
          </a>
          <button onClick={() => startEdit()} className="flex-shrink-0 h-6 w-6 flex items-center justify-center rounded hover:bg-white/10 text-muted-foreground hover:text-white transition-colors" title="Edit URL">
            <Edit2 className="w-3 h-3" />
          </button>
          <button onClick={onClear} className="flex-shrink-0 h-6 w-6 flex items-center justify-center rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors" title="Remove URL">
            <Unlink className="w-3 h-3" />
          </button>
        </>
      ) : (
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => startEdit()}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors group"
            data-testid="button-add-stream-url"
          >
            <LinkIcon className="w-3 h-3 group-hover:text-primary" />
            <span>Add URL</span>
          </button>
          {fileId && fsbBaseUrl && (
            <button
              onClick={() => startEdit(fileId)}
              className="flex items-center gap-1 text-[10px] text-blue-400/60 hover:text-blue-400 transition-colors border border-blue-500/20 hover:border-blue-500/40 rounded px-1.5 py-0.5"
              data-testid="button-from-file-id"
              title="Generate URL from file ID"
            >
              <Zap className="w-2.5 h-2.5" />
              From ID
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Episode row ───────────────────────────────────────────────────────────────

function EpisodeRow({ ep, onSave, onClear, fsbBaseUrl, fsbHashLength }: {
  ep: Episode;
  onSave: (id: number, url: string) => void;
  onClear: (id: number) => void;
  fsbBaseUrl?: string;
  fsbHashLength?: number;
}) {
  return (
    <div className="flex items-center gap-3 py-2 px-4 border-b border-border/30 last:border-0 hover:bg-muted/10 transition-colors">
      <div className="w-16 text-xs text-muted-foreground font-mono flex-shrink-0">
        S{ep.seasonNumber}E{ep.episodeNumber}
      </div>
      <div className="flex-1 text-xs text-foreground/70 truncate min-w-0">
        {ep.title || `Episode ${ep.episodeNumber}`}
      </div>
      <div className="flex-shrink-0">
        {ep.streamUrl
          ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
          : <XCircle className="w-3.5 h-3.5 text-muted-foreground/40" />}
      </div>
      <div className="min-w-[260px] max-w-xs">
        <InlineEdit
          value={ep.streamUrl}
          onSave={url => onSave(ep.id, url)}
          onClear={() => onClear(ep.id)}
          fileId={ep.fileId}
          fsbBaseUrl={fsbBaseUrl}
          fsbHashLength={fsbHashLength}
        />
      </div>
    </div>
  );
}

// ── Series expander ───────────────────────────────────────────────────────────

function SeriesExpander({ movie, fsbBaseUrl, fsbHashLength }: {
  movie: FsbMovie;
  fsbBaseUrl?: string;
  fsbHashLength?: number;
}) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const { data: eps, isLoading, refetch } = useQuery<Episode[]>({
    queryKey: [`/api/admin/fsb/series/${movie.id}/episodes`],
    enabled: open,
  });

  const saveMut = useMutation({
    mutationFn: ({ id, url }: { id: number; url: string | null }) =>
      apiRequest("PATCH", `/api/admin/episodes/${id}/stream-url`, { streamUrl: url }).then(r => r.json()),
    onSuccess: () => { refetch(); toast({ title: "Episode URL updated" }); },
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-primary transition-colors mt-1"
        data-testid={`button-expand-series-${movie.id}`}
      >
        <Tv className="w-3 h-3" />
        {open ? "Hide episodes" : "Manage episodes"}
        <ChevronRight className={cn("w-3 h-3 transition-transform", open && "rotate-90")} />
      </button>
      {open && (
        <div className="mt-2 bg-background border border-border/50 rounded-xl overflow-hidden">
          {isLoading && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          )}
          {eps?.map(ep => (
            <EpisodeRow
              key={ep.id}
              ep={ep}
              onSave={(id, url) => saveMut.mutate({ id, url })}
              onClear={id => saveMut.mutate({ id, url: null })}
              fsbBaseUrl={fsbBaseUrl}
              fsbHashLength={fsbHashLength}
            />
          ))}
          {eps?.length === 0 && (
            <p className="text-xs text-muted-foreground px-4 py-3">No episodes found.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── FSB Quick Settings ────────────────────────────────────────────────────────

function FsbQuickSettings({ settings }: { settings: Settings | undefined }) {
  const { toast } = useToast();
  const [baseUrl, setBaseUrl] = useState(settings?.fsbBaseUrl || "");
  const [hashLength, setHashLength] = useState(settings?.fsbHashLength ?? 6);
  const [enabled, setEnabled] = useState(settings?.fsbEnabled ?? false);
  const [dirty, setDirty] = useState(false);

  const syncFromSettings = (s: Settings | undefined) => {
    if (!s) return;
    setBaseUrl(s.fsbBaseUrl || "");
    setHashLength(s.fsbHashLength ?? 6);
    setEnabled(s.fsbEnabled ?? false);
    setDirty(false);
  };

  const prevSettings = useRef<Settings | undefined>(undefined);
  if (settings && settings !== prevSettings.current) {
    prevSettings.current = settings;
    syncFromSettings(settings);
  }

  const saveMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/settings", { fsbBaseUrl: baseUrl.trim(), fsbHashLength: hashLength, fsbEnabled: enabled });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      setDirty(false);
      toast({ title: "FSB settings saved" });
    },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  const markDirty = () => setDirty(true);

  const useReplitUrl = () => {
    const url = window.location.origin;
    setBaseUrl(url);
    setDirty(true);
  };

  return (
    <Card className="mb-6 border-yellow-500/20 bg-yellow-500/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Settings2 className="w-4 h-4 text-yellow-400" />
          FSB Quick Settings
          {dirty && <Badge variant="outline" className="text-[9px] h-4 text-yellow-400 border-yellow-500/40 ml-auto">Unsaved changes</Badge>}
        </CardTitle>
        <CardDescription className="text-xs">Configure FileStreamBot directly — no need to go to Settings.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid sm:grid-cols-[1fr_auto_auto] gap-3 items-end">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">FSB Base URL</label>
            <div className="flex gap-2">
              <Input
                value={baseUrl}
                onChange={e => { setBaseUrl(e.target.value); markDirty(); }}
                placeholder="https://your-filestream-bot.example.com"
                className="font-mono text-xs flex-1"
                data-testid="input-fsb-base-url-quick"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={useReplitUrl}
                className="flex-shrink-0 gap-1.5 text-xs h-9 border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                data-testid="button-use-replit-url"
                title="Auto-fill with this Replit app's URL"
              >
                <Globe className="w-3.5 h-3.5" />
                Use Replit URL
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">The public URL of your FSB instance (no trailing slash).</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Hash Length</label>
            <Input
              type="number"
              min={4}
              max={32}
              value={hashLength}
              onChange={e => { setHashLength(parseInt(e.target.value) || 6); markDirty(); }}
              className="w-24 text-sm"
              data-testid="input-fsb-hash-length-quick"
            />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-yellow-500/20 bg-yellow-500/5 px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Enable FileStreamBot</p>
            <p className="text-xs text-muted-foreground mt-0.5">Show Play buttons for movies with a stream URL</p>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={v => { setEnabled(v); markDirty(); }}
            data-testid="switch-fsb-enabled-quick"
          />
        </div>

        <div className="flex justify-end">
          <Button
            size="sm"
            disabled={!dirty || saveMut.isPending}
            onClick={() => saveMut.mutate()}
            data-testid="button-save-fsb-settings"
            className="gap-1.5"
          >
            {saveMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save Settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminFileStreamBot() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "linked" | "unlinked">("all");
  const [page, setPage] = useState(1);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>();

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const { data: settings } = useQuery<Settings>({ queryKey: ["/api/settings"] });

  const { data, isLoading, refetch } = useQuery<FsbMoviesResponse>({
    queryKey: [`/api/admin/fsb/movies`, debouncedSearch, filter, page],
    queryFn: async () => {
      const params = new URLSearchParams({ search: debouncedSearch, filter, page: String(page) });
      const res = await fetch(`/api/admin/fsb/movies?${params}`, { credentials: "include" });
      return res.json();
    },
  });

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/fsb/test", { credentials: "include" });
      const result = await res.json();
      setTestResult(result);
    } catch (e: any) {
      setTestResult({ ok: false, message: e.message });
    } finally {
      setTesting(false);
    }
  };

  const saveMut = useMutation({
    mutationFn: ({ id, url }: { id: number; url: string | null }) =>
      apiRequest("PATCH", `/api/admin/movies/${id}/stream-url`, { streamUrl: url }).then(r => r.json()),
    onSuccess: () => { refetch(); toast({ title: "Stream URL updated" }); },
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  const handleSearchChange = (v: string) => {
    setSearch(v);
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => { setDebouncedSearch(v); setPage(1); }, 400);
  };

  const fsbConfigured = !!settings?.fsbBaseUrl && !!settings?.fsbEnabled;

  return (
    <div className="min-h-screen bg-background flex">
      <AdminSidebar />
      <main className="flex-1 md:ml-64 p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto">

          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold font-display text-foreground flex items-center gap-3">
              <Zap className="h-7 w-7 text-yellow-400" />
              FileStreamBot
            </h1>
            <p className="text-muted-foreground mt-1">
              Stream large Telegram movie files directly to users — bypassing the 20 MB download limit.
            </p>
          </div>

          {/* Setup Guide */}
          <SetupGuide
            settings={settings}
            onTest={handleTest}
            testing={testing}
            testResult={testResult}
            onClearTest={() => setTestResult(null)}
          />

          {/* Quick Settings */}
          <FsbQuickSettings settings={settings} />

          {/* Stats bar */}
          {data && fsbConfigured && (
            <div className="flex items-center gap-6 mb-6 px-5 py-4 rounded-xl border border-border/50 bg-muted/10">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-xs text-muted-foreground">FSB Active</span>
              </div>
              <div className="h-4 border-r border-border/50" />
              <div className="text-xs"><span className="font-bold text-green-400">{data.total > 0 ? Math.round(data.items.filter(m => m.streamUrl).length / Math.min(data.items.length, data.total) * data.total) : 0}</span> <span className="text-muted-foreground">linked</span></div>
              <div className="text-xs"><span className="font-bold text-muted-foreground">{data.total}</span> <span className="text-muted-foreground">total movies</span></div>
              <div className="ml-auto text-xs text-muted-foreground font-mono">
                {settings?.fsbBaseUrl?.replace(/^https?:\/\//, "")}
              </div>
            </div>
          )}

          {/* Search & Filter — only shown after setup */}
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => handleSearchChange(e.target.value)}
                placeholder="Search movies..."
                className="pl-9"
                data-testid="input-search-movies"
              />
            </div>
            <div className="flex rounded-xl overflow-hidden border border-border/50">
              {(["all", "linked", "unlinked"] as const).map(f => (
                <button
                  key={f}
                  onClick={() => { setFilter(f); setPage(1); }}
                  className={cn(
                    "px-4 py-2 text-xs font-semibold capitalize transition-colors",
                    filter === f ? "bg-primary text-white" : "bg-muted/30 text-muted-foreground hover:bg-muted"
                  )}
                  data-testid={`filter-${f}`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Movies Table */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-5 border-b border-border/30">
              <CardTitle className="text-sm flex items-center gap-2">
                <Link2 className="w-4 h-4 text-primary" /> Stream URL Manager
              </CardTitle>
              <CardDescription className="text-xs">
                Paste the stream URL from your FileStreamBot for each movie. The Play button appears automatically.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : data?.items.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground text-sm">No movies found.</div>
              ) : (
                <div>
                  {/* Header */}
                  <div className="grid grid-cols-[auto_1fr_auto_1fr] gap-4 items-center px-5 py-3 border-b border-border/30 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    <span className="w-8"></span>
                    <span>Title</span>
                    <span className="w-20 text-center">Linked</span>
                    <span>Stream URL (from FileStreamBot)</span>
                  </div>

                  {data?.items.map(movie => (
                    <div key={movie.id} className="border-b border-border/20 last:border-0 hover:bg-muted/5 transition-colors">
                      <div className="grid grid-cols-[auto_1fr_auto_1fr] gap-4 items-start px-5 py-4">
                        {/* Poster */}
                        <div className="w-8 h-12 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                          {movie.posterPath ? (
                            <img
                              src={movie.posterPath.startsWith("http") ? movie.posterPath : `https://image.tmdb.org/t/p/w92${movie.posterPath}`}
                              alt={movie.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              {movie.type === "series" ? <Tv className="w-4 h-4 text-muted-foreground" /> : <Film className="w-4 h-4 text-muted-foreground" />}
                            </div>
                          )}
                        </div>

                        {/* Title */}
                        <div className="min-w-0">
                          <div className="font-semibold text-sm text-foreground truncate">{movie.title}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Badge variant="outline" className="text-[9px] h-4 px-1.5 capitalize">{movie.type}</Badge>
                            <span className="text-[10px] text-muted-foreground">{movie.quality}</span>
                          </div>
                          {movie.type === "series" && (
                            <SeriesExpander
                              movie={movie}
                              fsbBaseUrl={settings?.fsbBaseUrl ?? ""}
                              fsbHashLength={settings?.fsbHashLength ?? 6}
                            />
                          )}
                        </div>

                        {/* Status */}
                        <div className="w-20 flex justify-center">
                          {movie.streamUrl
                            ? <CheckCircle2 className="w-5 h-5 text-green-400" />
                            : <XCircle className="w-5 h-5 text-muted-foreground/20" />}
                        </div>

                        {/* Stream URL */}
                        <div className="min-w-0 flex items-center">
                          <InlineEdit
                            value={movie.streamUrl}
                            onSave={url => saveMut.mutate({ id: movie.id, url })}
                            onClear={() => saveMut.mutate({ id: movie.id, url: null })}
                            fileId={movie.fileId}
                            fsbBaseUrl={settings?.fsbBaseUrl ?? ""}
                            fsbHashLength={settings?.fsbHashLength ?? 6}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pagination */}
          {data && data.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-xs text-muted-foreground">
                Page {data.page} of {data.totalPages} · {data.total} movies
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)} data-testid="button-prev-page">
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button size="sm" variant="outline" disabled={page >= data.totalPages} onClick={() => setPage(p => p + 1)} data-testid="button-next-page">
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
