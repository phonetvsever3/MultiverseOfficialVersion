import { useState, useRef, useEffect } from "react";
import { AdminSidebar } from "@/components/AdminSidebar";
import { useAds, useCreateAd } from "@/hooks/use-ads";
import { Plus, MonitorPlay, MousePointerClick, Code, Eye, Trash2, Maximize2, Upload, ImageIcon, Film, X, Loader2, Calendar, Clock, Link2, Timer, RefreshCw, Save, Rows3, ToggleLeft, ToggleRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertAdSchema, type InsertAd, type Settings } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";

function SmartLinkSettings() {
  const { toast } = useToast();
  const { data: settings, isLoading } = useQuery<Settings>({ queryKey: ["/api/settings"], staleTime: 30000 });
  const [url, setUrl] = useState("");
  const [countdown, setCountdown] = useState(5);
  const [interval, setIntervalMin] = useState(0);

  useEffect(() => {
    if (settings) {
      setUrl(settings.smartLinkUrl || "");
      setCountdown(settings.smartLinkCountdown ?? 5);
      setIntervalMin(settings.smartLinkInterval ?? 0);
    }
  }, [settings]);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/settings", {
        smartLinkUrl: url,
        smartLinkCountdown: countdown,
        smartLinkInterval: interval,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/public/smart-link"] });
      toast({ title: "Smart Link settings saved" });
    },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  if (isLoading) return null;

  return (
    <div className="bg-card border border-border rounded-xl p-6 mb-8">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
          <Link2 className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h2 className="font-bold text-foreground">Smart Link Ad Settings</h2>
          <p className="text-xs text-muted-foreground">Controls the mini ad box shown when users click Watch or Download</p>
        </div>
      </div>

      <div className="space-y-5">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground flex items-center gap-2">
            <Link2 className="w-3.5 h-3.5 text-muted-foreground" /> Smart Link URL
          </label>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://your-ad-network.com/link/..."
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">This URL opens inside the mini ad box iframe when users click Watch or Download</p>
        </div>

        <div className="grid grid-cols-2 gap-5">
          <div className="space-y-3">
            <label className="text-sm font-medium text-foreground flex items-center gap-2">
              <Timer className="w-3.5 h-3.5 text-muted-foreground" /> Skip Countdown: <span className="text-primary font-bold">{countdown}s</span>
            </label>
            <Slider min={0} max={30} step={1} value={[countdown]} onValueChange={([v]) => setCountdown(v)} />
            <p className="text-xs text-muted-foreground">Seconds before "Skip Ad" button appears (0 = always skippable)</p>
          </div>

          <div className="space-y-3">
            <label className="text-sm font-medium text-foreground flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" /> Show Interval: <span className="text-primary font-bold">{interval === 0 ? "Always" : `${interval}m`}</span>
            </label>
            <Slider min={0} max={60} step={1} value={[interval]} onValueChange={([v]) => setIntervalMin(v)} />
            <p className="text-xs text-muted-foreground">Minutes between ad shows per user (0 = show every time)</p>
          </div>
        </div>

        <Button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="gap-2"
        >
          {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Smart Link Settings
        </Button>
      </div>
    </div>
  );
}

function BannerAdSettings() {
  const { toast } = useToast();
  const { data: settings, isLoading } = useQuery<Settings>({ queryKey: ["/api/settings"], staleTime: 30000 });
  const [code, setBannerCode] = useState("");
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (settings) {
      setBannerCode((settings as any).bannerAdCode || "");
      setEnabled(settings.bannerAdEnabled ?? false);
    }
  }, [settings]);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/settings", {
        bannerAdCode: code,
        bannerAdEnabled: enabled,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/public/banner-ad"] });
      toast({ title: "Banner Ad settings saved" });
    },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  if (isLoading) return null;

  return (
    <div className="bg-card border border-border rounded-xl p-6 mb-8">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
          <Rows3 className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h2 className="font-bold text-foreground">Banner Ad Settings (320×50)</h2>
          <p className="text-xs text-muted-foreground">Adsterra or any script-based 320×50 banner shown on all movie/series pages</p>
        </div>
      </div>

      <div className="space-y-5">
        <div className="flex items-center justify-between p-3 rounded-xl bg-black/20 border border-white/5">
          <div>
            <div className="text-sm font-medium text-foreground">Enable Banner Ad</div>
            <div className="text-xs text-muted-foreground">Show 320×50 banner on movie &amp; series pages</div>
          </div>
          <button
            type="button"
            onClick={() => setEnabled(!enabled)}
            className="transition-all active:scale-95"
            data-testid="toggle-banner-enabled"
          >
            {enabled
              ? <ToggleRight className="w-8 h-8 text-primary" />
              : <ToggleLeft className="w-8 h-8 text-muted-foreground" />
            }
          </button>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground flex items-center gap-2">
            <Code className="w-3.5 h-3.5 text-muted-foreground" /> Adsterra Banner Script
          </label>
          <Textarea
            value={code}
            onChange={(e) => setBannerCode(e.target.value)}
            placeholder={`<script type='text/javascript'>\natOptions = {\n  'key' : 'YOUR_KEY',\n  'format' : 'iframe',\n  'height' : 50,\n  'width' : 320,\n  'params' : {}\n};\n</script>\n<script type='text/javascript' src='//www.topcreativeformat.com/YOUR_KEY/invoke.js'></script>`}
            className="font-mono text-xs min-h-[130px] resize-none"
            disabled={!enabled}
          />
          <p className="text-xs text-muted-foreground">Paste your full Adsterra script code here. It runs inside a sandboxed 320×50 iframe on movie/series pages.</p>
        </div>

        <Button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="gap-2"
        >
          {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Banner Ad Settings
        </Button>
      </div>
    </div>
  );
}

function TelegaioAdSettings() {
  const { toast } = useToast();
  const { data: settings, isLoading } = useQuery<Settings>({ queryKey: ["/api/settings"], staleTime: 30000 });
  const [script, setScript] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [fullscreenEnabled, setFullscreenEnabled] = useState(false);
  const [rewardEnabled, setRewardEnabled] = useState(false);
  const [rewardToken, setRewardToken] = useState("");
  const [rewardAdBlockUuid, setRewardAdBlockUuid] = useState("");

  useEffect(() => {
    if (settings) {
      setScript((settings as any).telegaioScript || "");
      setEnabled((settings as any).telegaioEnabled ?? false);
      setFullscreenEnabled((settings as any).telegaioFullscreenEnabled ?? false);
      setRewardEnabled((settings as any).telegaioRewardEnabled ?? false);
      setRewardToken((settings as any).telegaioRewardToken || "");
      setRewardAdBlockUuid((settings as any).telegaioRewardAdBlockUuid || "");
    }
  }, [settings]);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/settings", {
        telegaioScript: script,
        telegaioEnabled: enabled,
        telegaioFullscreenEnabled: fullscreenEnabled,
        telegaioRewardEnabled: rewardEnabled,
        telegaioRewardToken: rewardToken,
        telegaioRewardAdBlockUuid: rewardAdBlockUuid,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/public/telegaio-ad"] });
      toast({ title: "Telega.io Ad settings saved" });
    },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  if (isLoading) return null;

  return (
    <div className="bg-card border border-border rounded-xl p-6 mb-8">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
          <MonitorPlay className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h2 className="font-bold text-foreground">Telega.io Ad Settings</h2>
          <p className="text-xs text-muted-foreground">Native Telegram ad network — banner on detail pages + optional fullscreen interstitial rotation</p>
        </div>
      </div>

      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex items-center justify-between p-3 rounded-xl bg-black/20 border border-white/5">
            <div>
              <div className="text-sm font-medium text-foreground">Enable Banner</div>
              <div className="text-xs text-muted-foreground">Show telega.io banner on movie &amp; series pages</div>
            </div>
            <button
              type="button"
              onClick={() => setEnabled(!enabled)}
              className="transition-all active:scale-95"
              data-testid="toggle-telegaio-enabled"
            >
              {enabled
                ? <ToggleRight className="w-8 h-8 text-primary" />
                : <ToggleLeft className="w-8 h-8 text-muted-foreground" />
              }
            </button>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-black/20 border border-white/5">
            <div>
              <div className="text-sm font-medium text-foreground">Enable Fullscreen</div>
              <div className="text-xs text-muted-foreground">Rotate telega.io 50/50 with Smart Link as fullscreen ad</div>
            </div>
            <button
              type="button"
              onClick={() => setFullscreenEnabled(!fullscreenEnabled)}
              className="transition-all active:scale-95"
              data-testid="toggle-telegaio-fullscreen-enabled"
            >
              {fullscreenEnabled
                ? <ToggleRight className="w-8 h-8 text-primary" />
                : <ToggleLeft className="w-8 h-8 text-muted-foreground" />
              }
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground flex items-center gap-2">
            <Code className="w-3.5 h-3.5 text-muted-foreground" /> Telega.io Embed Script
          </label>
          <Textarea
            value={script}
            onChange={(e) => setScript(e.target.value)}
            placeholder={`<script src="https://telega.io/js/widget.js" data-id="YOUR_ID" async></script>`}
            className="font-mono text-xs min-h-[100px] resize-none"
          />
          <p className="text-xs text-muted-foreground">Paste the full embed script from your telega.io dashboard. It runs inside a sandboxed iframe on movie/series pages.</p>
        </div>

        {/* Reward Ad (inapp SDK) */}
        <div className="border border-border/60 rounded-xl p-4 space-y-4 bg-black/10">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-foreground">Reward Ad (inapp SDK)</div>
              <div className="text-xs text-muted-foreground">Show a reward ad via telega.io inapp SDK before Watch / Download — rotates with Smart Link &amp; fullscreen</div>
            </div>
            <button
              type="button"
              onClick={() => setRewardEnabled(!rewardEnabled)}
              className="transition-all active:scale-95"
              data-testid="toggle-telegaio-reward-enabled"
            >
              {rewardEnabled
                ? <ToggleRight className="w-8 h-8 text-primary" />
                : <ToggleLeft className="w-8 h-8 text-muted-foreground" />
              }
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">App Token</label>
              <Input
                value={rewardToken}
                onChange={(e) => setRewardToken(e.target.value)}
                placeholder="76648bcb-b3b9-4839-8b48-ad1398c1cdd8"
                className="font-mono text-xs"
                data-testid="input-telegaio-reward-token"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Ad Block UUID</label>
              <Input
                value={rewardAdBlockUuid}
                onChange={(e) => setRewardAdBlockUuid(e.target.value)}
                placeholder="a820081b-183e-456d-8498-baa16efd9b64"
                className="font-mono text-xs"
                data-testid="input-telegaio-reward-uuid"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Find your token and ad block UUID in your telega.io dashboard → Mini App → Reward Ads.</p>
        </div>

        <Button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="gap-2"
        >
          {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Telega.io Settings
        </Button>
      </div>
    </div>
  );
}

function FileUploadField({
  label,
  accept,
  value,
  onChange,
  icon: Icon,
}: {
  label: string;
  accept: string;
  value: string;
  onChange: (url: string) => void;
  icon: React.ElementType;
}) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      onChange(data.url);
      toast({ title: "File uploaded successfully" });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      <div className="flex gap-2">
        <Input
          value={value || ""}
          onChange={e => onChange(e.target.value)}
          placeholder="https://... or upload a file →"
          className="flex-1 text-sm"
        />
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="gap-1.5 shrink-0"
        >
          {uploading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <Upload className="w-3.5 h-3.5" />
              Upload
            </>
          )}
        </Button>
      </div>
      {value && !value.startsWith("http") && (
        <div className="flex items-center gap-2 text-xs text-green-500">
          <Icon className="w-3.5 h-3.5" />
          <span className="truncate">Uploaded: {value}</span>
          <button type="button" onClick={() => onChange("")} className="ml-auto">
            <X className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
          </button>
        </div>
      )}
    </div>
  );
}

export default function AdminAds() {
  const { data: ads, isLoading } = useAds();
  const { mutate: createAd, isPending } = useCreateAd();
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<InsertAd>({
    resolver: zodResolver(insertAdSchema),
    defaultValues: {
      type: "fullscreen",
      title: "",
      content: "",
      weight: 1,
      isActive: true,
      imageUrl: "",
      videoUrl: "",
      adText: "",
      buttonText: "",
      buttonUrl: "",
      startAt: null,
      expiresAt: null,
    }
  });

  const adType = useWatch({ control: form.control, name: "type" });
  const isFullscreen = adType === "fullscreen";

  const onSubmit = (data: InsertAd) => {
    createAd(data, {
      onSuccess: () => {
        setOpen(false);
        form.reset();
      }
    });
  };

  const deleteAd = async (id: number) => {
    try {
      await apiRequest("DELETE", `/api/ads/${id}`);
      queryClient.invalidateQueries({ queryKey: ["/api/ads"] });
      toast({ title: "Ad deleted successfully" });
    } catch (error) {
      toast({ title: "Failed to delete ad", variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-background flex">
      <AdminSidebar />
      <main className="flex-1 md:ml-64 p-8 overflow-y-auto">
        <header className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold font-display text-foreground">Ad Manager</h1>
            <p className="text-muted-foreground">Configure monetization and banners.</p>
          </div>
          
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/25">
                <Plus className="w-4 h-4 mr-2" /> New Campaign
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create Ad Campaign</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Campaign Title</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Summer Sale Banner" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Format</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="fullscreen">🎬 Fullscreen Interstitial</SelectItem>
                              <SelectItem value="adsterra">Adsterra Script</SelectItem>
                              <SelectItem value="custom_banner">HTML Banner</SelectItem>
                              <SelectItem value="custom_redirect">Redirect Link</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="weight"
                      render={({ field }) => (
                        <FormItem>
                           <FormLabel>Priority Weight (1-10)</FormLabel>
                           <div className="pt-2">
                             <Slider 
                               min={1} 
                               max={10} 
                               step={1} 
                               defaultValue={[field.value || 1]} 
                               onValueChange={(vals) => field.onChange(vals[0])} 
                             />
                           </div>
                           <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  {isFullscreen ? (
                    <div className="space-y-4 p-4 bg-primary/5 border border-primary/20 rounded-xl">
                      <div className="flex items-center gap-2 mb-1">
                        <Maximize2 className="w-4 h-4 text-primary" />
                        <span className="text-sm font-bold text-primary">Fullscreen Interstitial Settings</span>
                      </div>
                      <p className="text-xs text-muted-foreground">This ad shows full-screen on movie/series pages with a 5-second timer before it can be closed.</p>

                      {/* Schedule */}
                      <div className="grid grid-cols-2 gap-3 p-3 bg-black/20 border border-white/5 rounded-xl">
                        <FormField
                          control={form.control}
                          name="startAt"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="flex items-center gap-1.5 text-xs"><Calendar className="w-3 h-3" /> Start Date & Time</FormLabel>
                              <FormControl>
                                <Input
                                  type="datetime-local"
                                  className="text-sm"
                                  value={field.value ? new Date(field.value as any).toISOString().slice(0, 16) : ""}
                                  onChange={e => field.onChange(e.target.value ? new Date(e.target.value) : null)}
                                />
                              </FormControl>
                              <p className="text-[10px] text-muted-foreground">Leave blank for immediate start</p>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="expiresAt"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="flex items-center gap-1.5 text-xs"><Clock className="w-3 h-3" /> Expire Date & Time</FormLabel>
                              <FormControl>
                                <Input
                                  type="datetime-local"
                                  className="text-sm"
                                  value={field.value ? new Date(field.value as any).toISOString().slice(0, 16) : ""}
                                  onChange={e => field.onChange(e.target.value ? new Date(e.target.value) : null)}
                                />
                              </FormControl>
                              <p className="text-[10px] text-muted-foreground">Leave blank for no expiry</p>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      {/* Image Upload */}
                      <FormField
                        control={form.control}
                        name="imageUrl"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <FileUploadField
                                label="Ad Image (optional)"
                                accept="image/*"
                                value={field.value || ""}
                                onChange={field.onChange}
                                icon={ImageIcon}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Video Upload */}
                      <FormField
                        control={form.control}
                        name="videoUrl"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <FileUploadField
                                label="Ad Video (optional, overrides image)"
                                accept="video/*"
                                value={field.value || ""}
                                onChange={field.onChange}
                                icon={Film}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="adText"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Ad Description Text</FormLabel>
                            <FormControl>
                              <Textarea {...field} value={field.value || ""} placeholder="Short description shown below the title..." className="min-h-[60px] text-sm" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="grid grid-cols-2 gap-3">
                        <FormField
                          control={form.control}
                          name="buttonText"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Button Text</FormLabel>
                              <FormControl>
                                <Input {...field} value={field.value || ""} placeholder="Learn More" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="buttonUrl"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Button URL</FormLabel>
                              <FormControl>
                                <Input {...field} value={field.value || ""} placeholder="https://..." />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  ) : (
                    <FormField
                      control={form.control}
                      name="content"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Content / Code / URL</FormLabel>
                          <FormControl>
                            <Textarea 
                              {...field} 
                              value={field.value || ""}
                              placeholder="<div>...</div> OR https://... OR <script>..." 
                              className="font-mono text-xs min-h-[100px]"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  <Button type="submit" className="w-full" disabled={isPending}>
                    {isPending ? "Creating..." : "Launch Campaign"}
                  </Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </header>

        <SmartLinkSettings />
        <BannerAdSettings />
        <TelegaioAdSettings />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
           {isLoading ? <div>Loading ads...</div> : ads?.map((ad) => (
             <div key={ad.id} className="bg-card border border-border rounded-xl p-6 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-lg font-bold">{ad.title}</h3>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono bg-secondary px-2 py-1 rounded text-muted-foreground">{ad.type}</span>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-destructive hover:bg-destructive/10"
                        onClick={() => deleteAd(ad.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Show image/video preview for fullscreen ads */}
                  {ad.type === 'fullscreen' && (ad.imageUrl || ad.videoUrl) && (
                    <div className="mb-3 rounded-lg overflow-hidden aspect-video bg-black/20 border border-border">
                      {ad.videoUrl ? (
                        <video src={ad.videoUrl} muted className="w-full h-full object-cover" />
                      ) : ad.imageUrl ? (
                        <img src={ad.imageUrl} alt={ad.title} className="w-full h-full object-cover" />
                      ) : null}
                    </div>
                  )}

                  <div className="text-xs text-muted-foreground bg-black/20 p-2 rounded border border-white/5 font-mono truncate mb-4">
                     {ad.adText || ad.content || (ad.imageUrl ? `Image: ${ad.imageUrl}` : '') || (ad.videoUrl ? `Video: ${ad.videoUrl}` : '') || '—'}
                  </div>
                </div>
                
                {/* Schedule info for fullscreen ads */}
                {ad.type === 'fullscreen' && (ad.startAt || ad.expiresAt) && (() => {
                  const now = new Date();
                  const start = ad.startAt ? new Date(ad.startAt) : null;
                  const expire = ad.expiresAt ? new Date(ad.expiresAt) : null;
                  const isScheduled = start && start > now;
                  const isExpired = expire && expire <= now;
                  const isLive = !isScheduled && !isExpired;
                  return (
                    <div className="mt-3 flex items-center gap-2 text-xs p-2 rounded-lg bg-black/20 border border-white/5">
                      <Calendar className="w-3 h-3 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        {start && <span className="text-muted-foreground">Start: <span className="text-foreground">{start.toLocaleString()}</span></span>}
                        {start && expire && <span className="mx-1 text-muted-foreground">•</span>}
                        {expire && <span className="text-muted-foreground">Expires: <span className="text-foreground">{expire.toLocaleString()}</span></span>}
                      </div>
                      <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ${isExpired ? 'bg-red-500/15 text-red-400' : isScheduled ? 'bg-yellow-500/15 text-yellow-400' : 'bg-green-500/15 text-green-400'}`}>
                        {isExpired ? 'Expired' : isScheduled ? 'Scheduled' : 'Live'}
                      </span>
                    </div>
                  );
                })()}

                <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-border">
                   <div className="text-center">
                      <div className="text-xs text-muted-foreground mb-1 flex items-center justify-center gap-1">
                        <Eye className="w-3 h-3" /> Views
                      </div>
                      <div className="font-bold">{ad.impressionCount || 0}</div>
                   </div>
                   <div className="text-center border-l border-border">
                      <div className="text-xs text-muted-foreground mb-1 flex items-center justify-center gap-1">
                         <MousePointerClick className="w-3 h-3" /> Clicks
                      </div>
                      <div className="font-bold">-</div>
                   </div>
                   <div className="text-center border-l border-border">
                      <div className="text-xs text-muted-foreground mb-1 flex items-center justify-center gap-1">
                         <Code className="w-3 h-3" /> Weight
                      </div>
                      <div className="font-bold">{ad.weight}</div>
                   </div>
                </div>
             </div>
           ))}
        </div>
      </main>
    </div>
  );
}
