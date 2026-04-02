import { useState, useRef } from "react";
import { AdminSidebar } from "@/components/AdminSidebar";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertSettingsSchema, type Settings } from "@shared/schema";
import { Loader2, Bot, Key, User, Send, Hash, Film, Upload, Trash2, RefreshCw, MessageCircle, Plus, X, Zap } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

interface SplashConfig {
  alwaysShow: boolean;
  hasVideo: boolean;
}

function IntroCard() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: cfg, isLoading: cfgLoading, refetch } = useQuery<{ hasVideo: boolean }>({
    queryKey: ["/api/intro/config"],
  });

  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("video", file);
      const res = await fetch("/api/admin/intro/upload", { method: "POST", body: form, credentials: "include" });
      if (!res.ok) throw new Error("Upload failed");
      await refetch();
      toast({ title: "Intro video uploaded", description: "Logo intro will play before each stream." });
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemove = async () => {
    setRemoving(true);
    try {
      const res = await fetch("/api/admin/intro/video", { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Remove failed");
      await refetch();
      toast({ title: "Intro video removed", description: "No intro will play before streams." });
    } catch {
      toast({ title: "Remove failed", variant: "destructive" });
    } finally {
      setRemoving(false);
    }
  };

  return (
    <Card className="hover-elevate">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          Logo Intro Video
        </CardTitle>
        <CardDescription>
          Upload a short logo/intro video that autoplays before movies or series. Plays every time before a movie or series.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {cfgLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading...
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 border border-border/50 text-sm">
              <div className={`w-2 h-2 rounded-full ${cfg?.hasVideo ? "bg-green-500" : "bg-muted-foreground"}`} />
              <span className="text-foreground font-medium">
                {cfg?.hasVideo ? "Intro video active" : "No intro video set"}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/*"
                className="hidden"
                onChange={handleUpload}
                data-testid="input-intro-video"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                data-testid="button-upload-intro"
                className="flex-1"
              >
                {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                {uploading ? "Uploading..." : "Upload Intro Video"}
              </Button>

              {cfg?.hasVideo && (
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  onClick={handleRemove}
                  disabled={removing}
                  data-testid="button-remove-intro"
                  title="Remove intro video"
                >
                  {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </Button>
              )}

              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => refetch()}
                data-testid="button-refresh-intro"
                title="Refresh status"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function SplashCard() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: cfg, isLoading: cfgLoading, refetch } = useQuery<SplashConfig>({
    queryKey: ["/api/splash/config"],
  });

  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [toggling, setToggling] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("video", file);
      const res = await fetch("/api/admin/splash/upload", { method: "POST", body: form, credentials: "include" });
      if (!res.ok) throw new Error("Upload failed");
      await refetch();
      toast({ title: "Splash video uploaded", description: "New video is now active." });
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemove = async () => {
    setRemoving(true);
    try {
      const res = await fetch("/api/admin/splash/video", { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Remove failed");
      await refetch();
      toast({ title: "Splash video removed", description: "Reverted to default video." });
    } catch {
      toast({ title: "Remove failed", variant: "destructive" });
    } finally {
      setRemoving(false);
    }
  };

  const handleToggleMode = async (val: boolean) => {
    setToggling(true);
    try {
      await fetch("/api/admin/splash/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alwaysShow: val }),
        credentials: "include",
      });
      await refetch();
      toast({ title: `Splash mode updated`, description: val ? "Splash will show every visit." : "Splash shows once per day." });
    } catch {
      toast({ title: "Update failed", variant: "destructive" });
    } finally {
      setToggling(false);
    }
  };

  return (
    <Card className="hover-elevate">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Film className="h-5 w-5 text-primary" />
          Splash Screen
        </CardTitle>
        <CardDescription>
          Manage the intro splash video shown to users when they open the app.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {cfgLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading...
          </div>
        ) : (
          <>
            {/* Video status */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 border border-border/50 text-sm">
              <div className={`w-2 h-2 rounded-full ${cfg?.hasVideo ? "bg-green-500" : "bg-yellow-500"}`} />
              <span className="text-foreground font-medium">
                {cfg?.hasVideo ? "Custom video active" : "Using default video"}
              </span>
            </div>

            {/* Upload */}
            <div className="flex items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/*"
                className="hidden"
                onChange={handleUpload}
                data-testid="input-splash-video"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                data-testid="button-upload-splash"
                className="flex-1"
              >
                {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                {uploading ? "Uploading..." : "Upload New Video"}
              </Button>

              {cfg?.hasVideo && (
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  onClick={handleRemove}
                  disabled={removing}
                  data-testid="button-remove-splash"
                  title="Remove custom video (revert to default)"
                >
                  {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </Button>
              )}

              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => refetch()}
                data-testid="button-refresh-splash"
                title="Refresh status"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>

            {/* Mode toggle */}
            <div className="flex items-center justify-between rounded-xl border border-border/50 bg-muted/30 px-4 py-3">
              <div>
                <p className="text-sm font-semibold">Always Show Splash</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {cfg?.alwaysShow ? "Shows on every visit" : "Shows once per day"}
                </p>
              </div>
              <Switch
                checked={cfg?.alwaysShow ?? false}
                onCheckedChange={handleToggleMode}
                disabled={toggling}
                data-testid="switch-splash-always-show"
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminSettings() {
  const { toast } = useToast();
  const { data: settings, isLoading } = useQuery<Settings>({ 
    queryKey: ["/api/settings"] 
  });

  const [packages, setPackages] = useState<{ name: string; price: string; description: string }[]>(
    settings?.supportPackages || []
  );
  const [newPkg, setNewPkg] = useState({ name: "", price: "", description: "" });

  const form = useForm({
    resolver: zodResolver(insertSettingsSchema.partial()),
    defaultValues: {
      botToken: settings?.botToken || "",
      tmdbApiKey: settings?.tmdbApiKey || "",
      adminUsername: settings?.adminUsername || "admin",
      adminPassword: settings?.adminPassword || "",
      telegramChannelUsername: settings?.telegramChannelUsername || "",
      autoPostMovies: settings?.autoPostMovies ?? false,
      autoPostSeries: settings?.autoPostSeries ?? false,
      autoAddMovies: settings?.autoAddMovies ?? false,
      adminTelegramUsername: settings?.adminTelegramUsername || "",
      fsbEnabled: settings?.fsbEnabled ?? false,
      fsbBaseUrl: settings?.fsbBaseUrl || "",
      fsbHashLength: settings?.fsbHashLength ?? 6,
      apiKey: settings?.apiKey || "",
    }
  });

  // Update form when data loads
  useState(() => {
    if (settings) {
      form.reset({
        botToken: settings.botToken || "",
        tmdbApiKey: settings.tmdbApiKey || "",
        adminUsername: settings.adminUsername || "admin",
        adminPassword: settings.adminPassword || "",
        telegramChannelUsername: settings.telegramChannelUsername || "",
        autoPostMovies: settings.autoPostMovies ?? false,
        autoPostSeries: settings.autoPostSeries ?? false,
        autoAddMovies: settings.autoAddMovies ?? false,
        adminTelegramUsername: settings.adminTelegramUsername || "",
        fsbEnabled: settings.fsbEnabled ?? false,
        fsbBaseUrl: settings.fsbBaseUrl || "",
        fsbHashLength: settings.fsbHashLength ?? 6,
        apiKey: settings.apiKey || "",
      });
      setPackages(settings.supportPackages || []);
    }
  });

  const mutation = useMutation({
    mutationFn: async (values: Partial<Settings>) => {
      const res = await apiRequest("POST", "/api/settings", { ...values, supportPackages: packages });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({
        title: "Settings updated",
        description: "Your changes have been saved successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      <AdminSidebar />
      <main className="flex-1 md:ml-64 p-8 overflow-y-auto">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold font-display text-foreground">System Settings</h1>
            <p className="text-muted-foreground">Configure your bot and API integrations.</p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-6">
              <Card className="hover-elevate">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Bot className="h-5 w-5 text-primary" />
                    Telegram Bot
                  </CardTitle>
                  <CardDescription>
                    Configure your Telegram Bot token obtained from @BotFather.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="botToken"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Bot Token</FormLabel>
                        <FormControl>
                          <Input {...field} type="password" placeholder="123456789:ABCdefGHIjkl..." className="font-mono" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Card className="hover-elevate">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Key className="h-5 w-5 text-primary" />
                    TMDB API
                  </CardTitle>
                  <CardDescription>
                    Integration for fetching movie and series metadata.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="tmdbApiKey"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>TMDB API Key (v3)</FormLabel>
                        <FormControl>
                          <Input {...field} type="password" placeholder="Enter your TMDB API key" className="font-mono" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Card className="hover-elevate">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Key className="h-5 w-5 text-yellow-400" />
                    Bot API Key
                  </CardTitle>
                  <CardDescription>
                    Secure the <code className="text-xs bg-muted px-1 py-0.5 rounded">POST /getMovie</code> endpoint used by external bots or workers. Leave blank to allow unauthenticated access.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="apiKey"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>API Key (x-api-key header)</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value ?? ""} type="password" placeholder="e.g. SECRET123" className="font-mono" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Card className="hover-elevate">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Send className="h-5 w-5 text-blue-400" />
                    Telegram Channel Auto-Post
                  </CardTitle>
                  <CardDescription>
                    Set your channel username (e.g. <code className="text-xs bg-muted px-1 py-0.5 rounded">@mychannel</code> or a numeric ID like <code className="text-xs bg-muted px-1 py-0.5 rounded">-1001234567890</code>). The bot must be an <b>admin</b> of the channel.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <FormField
                    control={form.control}
                    name="telegramChannelUsername"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2"><Hash className="h-3.5 w-3.5" /> Channel Username or ID</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value ?? ""} placeholder="@mychannel or -1001234567890" className="font-mono" data-testid="input-channel-username" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid sm:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="autoAddMovies"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
                          <div>
                            <FormLabel className="text-sm font-semibold">Auto-add Movies</FormLabel>
                            <p className="text-xs text-muted-foreground mt-0.5">Auto-add TMDB movies from synced source channels</p>
                          </div>
                          <FormControl>
                            <Switch checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="switch-auto-add-movies" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="autoPostMovies"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-xl border border-border/50 bg-muted/30 px-4 py-3">
                          <div>
                            <FormLabel className="text-sm font-semibold">Auto-post Movies</FormLabel>
                            <p className="text-xs text-muted-foreground mt-0.5">Post to channel when a new movie is added</p>
                          </div>
                          <FormControl>
                            <Switch checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="switch-auto-post-movies" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="autoPostSeries"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-xl border border-border/50 bg-muted/30 px-4 py-3">
                          <div>
                            <FormLabel className="text-sm font-semibold">Auto-post Series</FormLabel>
                            <p className="text-xs text-muted-foreground mt-0.5">Post to channel when a new series is added</p>
                          </div>
                          <FormControl>
                            <Switch checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="switch-auto-post-series" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Support & Advertising */}
              <Card className="hover-elevate">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessageCircle className="h-5 w-5 text-[#0088cc]" />
                    Support & Advertising
                  </CardTitle>
                  <CardDescription>
                    Configure the admin Telegram username for support and set advertising packages.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <FormField
                    control={form.control}
                    name="adminTelegramUsername"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Admin Telegram Username</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value ?? ""} placeholder="yourusername (without @)" data-testid="input-admin-telegram-username" />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">Users will be directed to this Telegram contact for support and advertising enquiries.</p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Advertising Packages */}
                  <div>
                    <p className="text-sm font-semibold mb-3">Advertising Packages</p>
                    <div className="space-y-2 mb-3">
                      {packages.map((pkg, i) => (
                        <div key={i} className="flex items-start gap-2 p-3 rounded-xl bg-muted/30 border border-border/50">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-sm font-bold text-foreground">{pkg.name}</span>
                              <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-md font-semibold">{pkg.price}</span>
                            </div>
                            <p className="text-xs text-muted-foreground truncate">{pkg.description}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setPackages(p => p.filter((_, j) => j !== i))}
                            className="shrink-0 w-7 h-7 rounded-lg hover:bg-destructive/10 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
                            data-testid={`button-remove-package-${i}`}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                      {packages.length === 0 && (
                        <p className="text-xs text-muted-foreground py-2">No packages yet. Add one below.</p>
                      )}
                    </div>

                    {/* Add new package */}
                    <div className="p-4 rounded-xl border border-dashed border-border bg-muted/10 space-y-3">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Add Package</p>
                      <div className="grid grid-cols-2 gap-3">
                        <Input
                          placeholder="Package name"
                          value={newPkg.name}
                          onChange={e => setNewPkg(p => ({ ...p, name: e.target.value }))}
                          data-testid="input-new-package-name"
                          className="text-sm"
                        />
                        <Input
                          placeholder="Price (e.g. $50/week)"
                          value={newPkg.price}
                          onChange={e => setNewPkg(p => ({ ...p, price: e.target.value }))}
                          data-testid="input-new-package-price"
                          className="text-sm"
                        />
                      </div>
                      <Textarea
                        placeholder="Description of what's included..."
                        value={newPkg.description}
                        onChange={e => setNewPkg(p => ({ ...p, description: e.target.value }))}
                        data-testid="input-new-package-description"
                        className="text-sm min-h-[60px] resize-none"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!newPkg.name || !newPkg.price}
                        onClick={() => {
                          if (newPkg.name && newPkg.price) {
                            setPackages(p => [...p, newPkg]);
                            setNewPkg({ name: "", price: "", description: "" });
                          }
                        }}
                        data-testid="button-add-package"
                        className="w-full gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Package
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="hover-elevate border-yellow-500/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-yellow-400" />
                    FileStreamBot (FSB)
                  </CardTitle>
                  <CardDescription>
                    Connect a{" "}
                    <a href="https://github.com/EverythingSuckz/TG-FileStreamBot" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      TG-FileStreamBot
                    </a>{" "}
                    instance to stream files larger than 20 MB directly from Telegram.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="fsbEnabled"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-xl border border-yellow-500/20 bg-yellow-500/5 px-4 py-3">
                        <div>
                          <FormLabel className="text-sm font-semibold">Enable FileStreamBot</FormLabel>
                          <p className="text-xs text-muted-foreground mt-0.5">Show Play buttons for movies that have a stream URL linked</p>
                        </div>
                        <FormControl>
                          <Switch checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="switch-fsb-enabled" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="fsbBaseUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>FSB Base URL</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value ?? ""} placeholder="https://your-filestream-bot.example.com" className="font-mono" data-testid="input-fsb-base-url" />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">The public URL of your TG-FileStreamBot instance (no trailing slash).</p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="fsbHashLength"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Hash Length</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            min={4}
                            max={32}
                            value={field.value ?? 6}
                            onChange={e => field.onChange(parseInt(e.target.value) || 6)}
                            className="w-32"
                            data-testid="input-fsb-hash-length"
                          />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">Chars used from the MD5 hash in stream URLs (default: 6, must match your FSB config).</p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="pt-1">
                    <a
                      href="/admin/file-stream-bot"
                      className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                    >
                      <Zap className="w-3 h-3" /> Manage stream URLs →
                    </a>
                  </div>
                </CardContent>
              </Card>

              <Card className="hover-elevate">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5 text-primary" />
                    Admin Credentials
                  </CardTitle>
                  <CardDescription>
                    Update your dashboard access credentials.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="adminUsername"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Username</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="adminPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>New Password</FormLabel>
                        <FormControl>
                          <Input {...field} type="password" placeholder="Leave empty to keep current" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <div className="flex justify-end">
                <Button 
                  type="submit" 
                  size="lg"
                  className="w-full md:w-auto min-w-[200px]"
                  disabled={mutation.isPending}
                >
                  {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Settings
                </Button>
              </div>
            </form>
          </Form>

          {/* Splash Screen card is outside the main form since it manages its own state */}
          <div className="mt-6">
            <SplashCard />
          </div>

          {/* Intro Video card */}
          <div className="mt-6">
            <IntroCard />
          </div>
        </div>
      </main>
    </div>
  );
}
