import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { AdminSidebar } from "@/components/AdminSidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useLocation, useParams } from "wouter";
import {
  ArrowLeft, Save, Plus, Trash2, GripVertical, Copy, CheckCheck,
  AlignLeft, AlignCenter, AlignRight, Smartphone,
} from "lucide-react";
import type { TiktokProject } from "@shared/schema";
import { useState, useEffect, useRef } from "react";

const EMOJIS = ["🔥", "💡", "🚀", "⚡", "💥", "👀", "😱", "🎯", "💰", "🤯", "✅", "❗", "🎬", "📱", "💎"];

const GRADIENTS = [
  { name: "Night", from: "#1a1a2e", to: "#16213e" },
  { name: "TikTok", from: "#010101", to: "#2d0b1e" },
  { name: "Viral Red", from: "#1a0000", to: "#3d0000" },
  { name: "Ocean", from: "#0d1b2a", to: "#1b4965" },
  { name: "Purple", from: "#1a0533", to: "#3b0f6e" },
  { name: "Gold", from: "#1a1200", to: "#3d2b00" },
  { name: "Matrix", from: "#001a00", to: "#003300" },
  { name: "Smoke", from: "#111111", to: "#2a2a2a" },
];

const ACCENT_COLORS = [
  "#ff0050", "#00f2ea", "#fe2c55", "#ff6b35",
  "#7c3aed", "#2563eb", "#16a34a", "#eab308",
];

const DEFAULT_PROJECT: Partial<TiktokProject> = {
  title: "",
  hookText: "",
  hookEmoji: "🔥",
  bodyPoints: [],
  ctaText: "Follow for more!",
  backgroundStyle: "gradient",
  gradientFrom: "#1a1a2e",
  gradientTo: "#16213e",
  backgroundColor: "#0a0a0a",
  textColor: "#ffffff",
  accentColor: "#ff0050",
  hookFontSize: 52,
  bodyFontSize: 26,
  ctaFontSize: 30,
  fontWeight: "bold",
  textAlign: "center",
  showEmoji: true,
  overlayStyle: "none",
  status: "draft",
};

function TikTokPreview({ p }: { p: Partial<TiktokProject> }) {
  const bg = p.backgroundStyle === "gradient"
    ? `linear-gradient(160deg, ${p.gradientFrom || "#1a1a2e"} 0%, ${p.gradientTo || "#16213e"} 100%)`
    : (p.backgroundColor || "#0a0a0a");

  const hookSize = Math.max(16, Math.min((p.hookFontSize || 52) * 0.38, 42));
  const bodySize = Math.max(10, Math.min((p.bodyFontSize || 26) * 0.38, 22));
  const ctaSize = Math.max(10, Math.min((p.ctaFontSize || 30) * 0.38, 24));
  const accentColor = p.accentColor || "#ff0050";
  const textColor = p.textColor || "#ffffff";
  const bodyPoints: string[] = Array.isArray(p.bodyPoints) ? p.bodyPoints : [];

  return (
    <div
      data-testid="preview-tiktok"
      className="relative rounded-2xl overflow-hidden shadow-2xl shadow-black/50 flex-shrink-0"
      style={{ width: 270, height: 480, background: bg }}
    >
      {p.overlayStyle === "dark" && (
        <div className="absolute inset-0 bg-black/40 z-0" />
      )}
      {p.overlayStyle === "neon" && (
        <div
          className="absolute inset-0 z-0"
          style={{
            boxShadow: `inset 0 0 60px ${accentColor}40`,
            background: `radial-gradient(ellipse at center, ${accentColor}15 0%, transparent 70%)`,
          }}
        />
      )}

      <div className="absolute inset-0 z-10 flex flex-col items-center justify-between p-5">
        <div className="w-full text-center pt-2" style={{ textAlign: (p.textAlign as any) || "center" }}>
          {p.showEmoji !== false && p.hookEmoji && (
            <div className="mb-2" style={{ fontSize: hookSize * 0.8 }}>{p.hookEmoji}</div>
          )}
          <p
            className="leading-tight"
            style={{
              color: textColor,
              fontSize: hookSize,
              fontWeight: p.fontWeight || "bold",
              textShadow: "0 2px 8px rgba(0,0,0,0.5)",
              lineHeight: 1.2,
            }}
          >
            {p.hookText || <span style={{ opacity: 0.3 }}>Your hook here...</span>}
          </p>
        </div>

        <div className="w-full flex flex-col gap-1.5" style={{ textAlign: (p.textAlign as any) || "center" }}>
          {bodyPoints.length > 0 ? bodyPoints.map((point, i) => (
            <div
              key={i}
              className="flex items-start gap-2"
              style={{ justifyContent: p.textAlign === "right" ? "flex-end" : p.textAlign === "center" ? "center" : "flex-start" }}
            >
              <span style={{ color: accentColor, fontSize: bodySize, fontWeight: "bold", flexShrink: 0 }}>{i + 1}.</span>
              <span style={{ color: textColor, fontSize: bodySize, lineHeight: 1.4, opacity: 0.9 }}>{point}</span>
            </div>
          )) : (
            <p style={{ color: textColor, fontSize: bodySize, opacity: 0.25, textAlign: "center" }}>
              Body points appear here...
            </p>
          )}
        </div>

        <div className="w-full text-center">
          <div
            className="inline-block px-4 py-2 rounded-full font-bold"
            style={{
              background: accentColor,
              color: "#fff",
              fontSize: ctaSize,
              boxShadow: `0 4px 15px ${accentColor}60`,
            }}
          >
            {p.ctaText || "Follow for more!"}
          </div>
          <div className="mt-3 flex items-center justify-center gap-1 opacity-30">
            <div className="w-12 h-1 rounded-full bg-white" />
          </div>
        </div>
      </div>

      <div className="absolute top-3 right-3 z-20 flex flex-col items-center gap-3 opacity-60">
        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-xs text-white">♥</div>
        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-xs text-white">💬</div>
        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-xs text-white">↗</div>
      </div>

      <div className="absolute bottom-14 left-3 z-20 opacity-60">
        <div className="w-8 h-8 rounded-full bg-white/10 border border-white/30" />
      </div>
    </div>
  );
}

export default function TikTokEditor() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [p, setP] = useState<Partial<TiktokProject>>(DEFAULT_PROJECT);
  const [isDirty, setIsDirty] = useState(false);
  const [newPoint, setNewPoint] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Refs to avoid stale closures
  const pRef = useRef<Partial<TiktokProject>>(DEFAULT_PROJECT);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialized = useRef(false);

  const { data: project, isLoading } = useQuery<TiktokProject>({
    queryKey: ["/api/admin/tiktok/projects", id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/tiktok/projects/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    staleTime: Infinity, // Don't re-fetch while we're editing
  });

  // Only initialize from server data once
  useEffect(() => {
    if (project && !isInitialized.current) {
      setP(project);
      pRef.current = project;
      isInitialized.current = true;
    }
  }, [project]);

  const doSave = async (data: Partial<TiktokProject>) => {
    try {
      setIsSaving(true);
      await apiRequest("PUT", `/api/admin/tiktok/projects/${id}`, data);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tiktok/projects"] });
      setIsDirty(false);
      toast({ title: "Saved ✓", description: "Project saved successfully" });
    } catch {
      toast({ title: "Error", description: "Failed to save — please try again", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const update = (field: string, value: unknown) => {
    const next = { ...pRef.current, [field]: value };
    pRef.current = next;
    setP({ ...next });
    setIsDirty(true);

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      doSave(pRef.current);
    }, 1800);
  };

  const bodyPoints: string[] = Array.isArray(p.bodyPoints) ? p.bodyPoints : [];

  const addBodyPoint = () => {
    if (!newPoint.trim()) return;
    update("bodyPoints", [...bodyPoints, newPoint.trim()]);
    setNewPoint("");
  };

  const removeBodyPoint = (i: number) => {
    const pts = [...bodyPoints];
    pts.splice(i, 1);
    update("bodyPoints", pts);
  };

  const updateBodyPoint = (i: number, value: string) => {
    const pts = [...bodyPoints];
    pts[i] = value;
    update("bodyPoints", pts);
  };

  const copyScript = () => {
    const script = [
      `🎬 HOOK: ${p.hookEmoji || ""} ${p.hookText || ""}`,
      "",
      bodyPoints.map((pt, i) => `${i + 1}. ${pt}`).join("\n"),
      "",
      `📣 CTA: ${p.ctaText || ""}`,
    ].join("\n");
    navigator.clipboard.writeText(script).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen bg-background">
        <AdminSidebar />
        <main className="flex-1 md:ml-64 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <AdminSidebar />
      <main className="flex-1 md:ml-64">

        {/* Header */}
        <div className="border-b border-border/50 px-6 py-4 flex items-center justify-between bg-card/30 backdrop-blur-sm sticky top-0 z-40">
          <div className="flex items-center gap-3">
            <Button
              data-testid="button-back"
              variant="ghost"
              size="icon"
              className="rounded-xl"
              onClick={() => navigate("/admin/tiktok")}
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <Input
                data-testid="input-project-title"
                value={p.title || ""}
                onChange={e => update("title", e.target.value)}
                className="border-0 bg-transparent text-lg font-semibold p-0 h-auto focus-visible:ring-0 text-foreground"
                placeholder="Project Title"
              />
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant={p.status === "ready" ? "default" : "secondary"} className="text-[10px]">
                  {p.status === "ready" ? "Ready" : "Draft"}
                </Badge>
                {isDirty && !isSaving && (
                  <span className="text-[10px] text-muted-foreground">Unsaved changes...</span>
                )}
                {isSaving && (
                  <span className="text-[10px] text-primary flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-primary animate-pulse inline-block" />
                    Saving...
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              data-testid="button-copy-script"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={copyScript}
            >
              {copied ? <CheckCheck className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              {copied ? "Copied!" : "Copy Script"}
            </Button>
            <Button
              data-testid="button-save"
              size="sm"
              className="gap-2"
              disabled={isSaving}
              onClick={() => {
                if (saveTimer.current) clearTimeout(saveTimer.current);
                doSave(pRef.current);
              }}
            >
              <Save className="w-4 h-4" />
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-col xl:flex-row h-[calc(100vh-65px)] overflow-hidden">

          {/* Left — Editor */}
          <div className="flex-1 overflow-y-auto p-6">
            <Tabs defaultValue="content">
              <TabsList className="mb-6 bg-card/50">
                <TabsTrigger data-testid="tab-content" value="content">Content</TabsTrigger>
                <TabsTrigger data-testid="tab-style" value="style">Style</TabsTrigger>
                <TabsTrigger data-testid="tab-settings" value="settings">Settings</TabsTrigger>
              </TabsList>

              {/* ── CONTENT TAB ────────────────────────────── */}
              <TabsContent value="content" className="space-y-5">

                {/* Hook */}
                <div className="rounded-2xl border border-border/40 bg-card p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-[#ff0050]" />
                    <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Hook</h3>
                  </div>
                  <p className="text-xs text-muted-foreground -mt-2">The attention-grabbing first line — make it stop the scroll!</p>

                  <div className="space-y-2">
                    <Label className="text-xs">Emoji</Label>
                    <div className="flex flex-wrap gap-2">
                      {EMOJIS.map(emoji => (
                        <button
                          key={emoji}
                          data-testid={`button-emoji-${emoji}`}
                          onClick={() => update("hookEmoji", emoji)}
                          className={`w-9 h-9 rounded-xl text-lg flex items-center justify-center transition-all ${
                            p.hookEmoji === emoji
                              ? "bg-primary text-primary-foreground scale-110 shadow-md"
                              : "bg-muted hover:bg-muted/80"
                          }`}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">Hook Text</Label>
                    <Textarea
                      data-testid="input-hook-text"
                      value={p.hookText || ""}
                      onChange={e => update("hookText", e.target.value)}
                      placeholder="POV: You just discovered this life-changing hack..."
                      className="resize-none text-sm bg-background/50"
                      rows={3}
                    />
                    <p className="text-[10px] text-muted-foreground text-right">{(p.hookText || "").length} chars</p>
                  </div>
                </div>

                {/* Body Points */}
                <div className="rounded-2xl border border-border/40 bg-card p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                    <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Body Points</h3>
                  </div>
                  <p className="text-xs text-muted-foreground -mt-2">Key talking points — keep them short and punchy.</p>

                  <div className="space-y-2">
                    {bodyPoints.map((point, i) => (
                      <div key={i} className="flex items-center gap-2 group">
                        <GripVertical className="w-4 h-4 text-muted-foreground/30 flex-shrink-0" />
                        <span className="text-xs font-bold text-[#ff0050] w-5 flex-shrink-0">{i + 1}.</span>
                        <Input
                          data-testid={`input-body-point-${i}`}
                          value={point}
                          onChange={e => updateBodyPoint(i, e.target.value)}
                          className="flex-1 text-sm bg-background/50 h-9"
                          placeholder={`Point ${i + 1}...`}
                        />
                        <button
                          data-testid={`button-remove-point-${i}`}
                          onClick={() => removeBodyPoint(i)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-500 p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <Input
                      data-testid="input-new-point"
                      value={newPoint}
                      onChange={e => setNewPoint(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addBodyPoint(); } }}
                      placeholder="Add a new point and press Enter..."
                      className="flex-1 text-sm bg-background/50 h-9"
                    />
                    <Button
                      data-testid="button-add-point"
                      variant="outline"
                      size="sm"
                      onClick={addBodyPoint}
                      className="gap-1.5 h-9 flex-shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add
                    </Button>
                  </div>
                </div>

                {/* CTA */}
                <div className="rounded-2xl border border-border/40 bg-card p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Call to Action</h3>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">CTA Text</Label>
                    <Input
                      data-testid="input-cta-text"
                      value={p.ctaText || ""}
                      onChange={e => update("ctaText", e.target.value)}
                      placeholder="Follow for more!"
                      className="text-sm bg-background/50"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {["Follow for more!", "Like & share!", "Save this! 📌"].map(cta => (
                      <button
                        key={cta}
                        data-testid={`button-cta-${cta}`}
                        onClick={() => update("ctaText", cta)}
                        className={`px-2 py-2.5 rounded-xl text-xs border transition-all ${
                          p.ctaText === cta
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border/40 text-muted-foreground hover:border-primary/30"
                        }`}
                      >
                        {cta}
                      </button>
                    ))}
                  </div>
                </div>
              </TabsContent>

              {/* ── STYLE TAB ──────────────────────────────── */}
              <TabsContent value="style" className="space-y-5">

                {/* Background */}
                <div className="rounded-2xl border border-border/40 bg-card p-5 space-y-4">
                  <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Background</h3>

                  <div className="flex gap-3">
                    {(["solid", "gradient"] as const).map(style => (
                      <button
                        key={style}
                        data-testid={`button-bg-${style}`}
                        onClick={() => update("backgroundStyle", style)}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all capitalize ${
                          p.backgroundStyle === style
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border/40 text-muted-foreground hover:border-primary/30"
                        }`}
                      >
                        {style}
                      </button>
                    ))}
                  </div>

                  {p.backgroundStyle === "gradient" ? (
                    <>
                      <div className="grid grid-cols-4 gap-2">
                        {GRADIENTS.map(g => (
                          <button
                            key={g.name}
                            data-testid={`button-gradient-${g.name}`}
                            onClick={() => { update("gradientFrom", g.from); update("gradientTo", g.to); }}
                            title={g.name}
                            className={`relative h-12 rounded-xl overflow-hidden border-2 transition-all ${
                              p.gradientFrom === g.from ? "border-primary scale-105" : "border-transparent"
                            }`}
                            style={{ background: `linear-gradient(135deg, ${g.from}, ${g.to})` }}
                          >
                            <span className="absolute inset-0 flex items-end justify-center pb-1">
                              <span className="text-[9px] text-white/70">{g.name}</span>
                            </span>
                          </button>
                        ))}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs">From</Label>
                          <div className="flex gap-2">
                            <input type="color" value={p.gradientFrom || "#1a1a2e"} onChange={e => update("gradientFrom", e.target.value)} className="w-9 h-9 rounded-lg border border-border cursor-pointer bg-transparent" />
                            <Input value={p.gradientFrom || ""} onChange={e => update("gradientFrom", e.target.value)} className="flex-1 text-xs bg-background/50 h-9 font-mono" />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">To</Label>
                          <div className="flex gap-2">
                            <input type="color" value={p.gradientTo || "#16213e"} onChange={e => update("gradientTo", e.target.value)} className="w-9 h-9 rounded-lg border border-border cursor-pointer bg-transparent" />
                            <Input value={p.gradientTo || ""} onChange={e => update("gradientTo", e.target.value)} className="flex-1 text-xs bg-background/50 h-9 font-mono" />
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="space-y-1.5">
                      <Label className="text-xs">Color</Label>
                      <div className="flex gap-2">
                        <input type="color" value={p.backgroundColor || "#0a0a0a"} onChange={e => update("backgroundColor", e.target.value)} className="w-9 h-9 rounded-lg border border-border cursor-pointer bg-transparent" />
                        <Input value={p.backgroundColor || ""} onChange={e => update("backgroundColor", e.target.value)} className="flex-1 text-xs bg-background/50 h-9 font-mono" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Colors */}
                <div className="rounded-2xl border border-border/40 bg-card p-5 space-y-4">
                  <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Colors</h3>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Text Color</Label>
                    <div className="flex gap-2">
                      <input type="color" value={p.textColor || "#ffffff"} onChange={e => update("textColor", e.target.value)} className="w-9 h-9 rounded-lg border border-border cursor-pointer bg-transparent" />
                      <Input value={p.textColor || ""} onChange={e => update("textColor", e.target.value)} className="flex-1 text-xs bg-background/50 h-9 font-mono" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">Accent Color</Label>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {ACCENT_COLORS.map(color => (
                        <button
                          key={color}
                          data-testid={`button-accent-${color}`}
                          onClick={() => update("accentColor", color)}
                          className={`w-7 h-7 rounded-lg border-2 transition-all ${p.accentColor === color ? "border-white scale-110" : "border-transparent"}`}
                          style={{ background: color }}
                        />
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input type="color" value={p.accentColor || "#ff0050"} onChange={e => update("accentColor", e.target.value)} className="w-9 h-9 rounded-lg border border-border cursor-pointer bg-transparent" />
                      <Input value={p.accentColor || ""} onChange={e => update("accentColor", e.target.value)} className="flex-1 text-xs bg-background/50 h-9 font-mono" />
                    </div>
                  </div>
                </div>

                {/* Typography */}
                <div className="rounded-2xl border border-border/40 bg-card p-5 space-y-5">
                  <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Typography</h3>

                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <Label className="text-xs">Hook Size</Label>
                      <span className="text-xs text-muted-foreground">{p.hookFontSize || 52}px</span>
                    </div>
                    <Slider min={24} max={96} step={2} value={[p.hookFontSize || 52]} onValueChange={([v]) => update("hookFontSize", v)} />
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <Label className="text-xs">Body Size</Label>
                      <span className="text-xs text-muted-foreground">{p.bodyFontSize || 26}px</span>
                    </div>
                    <Slider min={14} max={52} step={1} value={[p.bodyFontSize || 26]} onValueChange={([v]) => update("bodyFontSize", v)} />
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <Label className="text-xs">CTA Size</Label>
                      <span className="text-xs text-muted-foreground">{p.ctaFontSize || 30}px</span>
                    </div>
                    <Slider min={14} max={56} step={1} value={[p.ctaFontSize || 30]} onValueChange={([v]) => update("ctaFontSize", v)} />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Font Weight</Label>
                    <Select value={p.fontWeight || "bold"} onValueChange={v => update("fontWeight", v)}>
                      <SelectTrigger className="bg-background/50 text-sm h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="600">Semi Bold</SelectItem>
                        <SelectItem value="bold">Bold</SelectItem>
                        <SelectItem value="900">Black</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Text Align</Label>
                    <div className="flex gap-2">
                      {([
                        { value: "left", icon: AlignLeft },
                        { value: "center", icon: AlignCenter },
                        { value: "right", icon: AlignRight },
                      ] as const).map(({ value, icon: Icon }) => (
                        <button
                          key={value}
                          data-testid={`button-align-${value}`}
                          onClick={() => update("textAlign", value)}
                          className={`flex-1 flex items-center justify-center h-9 rounded-lg border transition-all ${
                            p.textAlign === value
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border/40 text-muted-foreground hover:border-primary/30"
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Overlay & Extras */}
                <div className="rounded-2xl border border-border/40 bg-card p-5 space-y-4">
                  <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Overlay & Extras</h3>

                  <div className="grid grid-cols-3 gap-2">
                    {(["none", "dark", "neon"] as const).map(style => (
                      <button
                        key={style}
                        data-testid={`button-overlay-${style}`}
                        onClick={() => update("overlayStyle", style)}
                        className={`py-2.5 rounded-xl text-sm capitalize border transition-all ${
                          p.overlayStyle === style
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border/40 text-muted-foreground hover:border-primary/30"
                        }`}
                      >
                        {style}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Show Emoji in Preview</Label>
                    <Switch
                      data-testid="switch-show-emoji"
                      checked={p.showEmoji !== false}
                      onCheckedChange={v => update("showEmoji", v)}
                    />
                  </div>
                </div>
              </TabsContent>

              {/* ── SETTINGS TAB ───────────────────────────── */}
              <TabsContent value="settings" className="space-y-5">
                <div className="rounded-2xl border border-border/40 bg-card p-5 space-y-4">
                  <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Project Settings</h3>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Niche / Category</Label>
                    <Input
                      data-testid="input-niche"
                      value={p.niche || ""}
                      onChange={e => update("niche", e.target.value)}
                      placeholder="e.g. fitness, finance, motivation..."
                      className="text-sm bg-background/50"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Status</Label>
                    <Select value={p.status || "draft"} onValueChange={v => update("status", v)}>
                      <SelectTrigger className="bg-background/50 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="ready">Ready</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="rounded-2xl border border-border/40 bg-card p-5 space-y-3">
                  <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Full Script</h3>
                  <div className="bg-background/50 rounded-xl p-4 text-xs font-mono text-muted-foreground leading-relaxed whitespace-pre-wrap">
                    {`🎬 HOOK: ${p.hookEmoji || ""} ${p.hookText || "—"}\n\n${
                      bodyPoints.length > 0
                        ? bodyPoints.map((pt, i) => `${i + 1}. ${pt}`).join("\n")
                        : "— no body points yet —"
                    }\n\n📣 CTA: ${p.ctaText || "—"}`}
                  </div>
                  <Button
                    data-testid="button-copy-script-tab"
                    variant="outline"
                    size="sm"
                    className="w-full gap-2"
                    onClick={copyScript}
                  >
                    {copied ? <CheckCheck className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                    {copied ? "Copied!" : "Copy Full Script"}
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {/* Right — Live Preview */}
          <div className="xl:w-[340px] border-t xl:border-t-0 xl:border-l border-border/40 bg-card/20 flex flex-col items-center justify-center p-6 gap-4 flex-shrink-0">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
              <Smartphone className="w-4 h-4" />
              Live Preview (9:16)
            </div>
            <TikTokPreview p={p} />
            <p className="text-[10px] text-muted-foreground/50 text-center">
              Auto-saves 1.8s after your last change
            </p>
          </div>

        </div>
      </main>
    </div>
  );
}
