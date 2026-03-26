import { useState, useRef } from "react";
import { AdminSidebar } from "@/components/AdminSidebar";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import {
  Sparkles, Upload, Trash2, ToggleLeft, ToggleRight,
  Clock, Timer, RefreshCw, FileVideo, AlertCircle, Check
} from "lucide-react";
import type { MascotSettings } from "@shared/schema";

interface LottieFile {
  filename: string;
  url: string;
  size: number;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AdminMascot() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [previewFile, setPreviewFile] = useState<string | null>(null);

  const { data: settings, isLoading: settingsLoading } = useQuery<MascotSettings>({
    queryKey: ["/api/mascot/settings"],
  });

  const { data: files = [], isLoading: filesLoading, refetch: refetchFiles } = useQuery<LottieFile[]>({
    queryKey: ["/api/admin/mascot/files"],
    queryFn: async () => {
      const res = await fetch("/api/admin/mascot/files");
      return res.json();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<MascotSettings>) => {
      const res = await apiRequest("POST", "/api/admin/mascot/settings", updates);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mascot/settings"] });
      toast({ title: "Saved", description: "Mascot settings updated." });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (filename: string) => {
      const res = await fetch(`/api/admin/mascot/files/${encodeURIComponent(filename)}`, { method: "DELETE" });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mascot/settings"] });
      refetchFiles();
      toast({ title: "Deleted", description: "Animation file removed." });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".lottie")) {
      toast({ title: "Invalid file", description: "Only .lottie files are supported.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/admin/mascot/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      queryClient.invalidateQueries({ queryKey: ["/api/mascot/settings"] });
      refetchFiles();
      toast({ title: "Uploaded", description: `${data.filename} added to mascot library.` });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const toggleFile = (filename: string) => {
    if (!settings) return;
    const current: string[] = (settings.files as string[]) || [];
    const next = current.includes(filename)
      ? current.filter(f => f !== filename)
      : [...current, filename];
    updateMutation.mutate({ files: next });
  };

  const activeFiles: string[] = (settings?.files as string[]) || [];

  return (
    <div className="flex min-h-screen bg-background">
      <AdminSidebar />
      <main className="flex-1 md:ml-64 p-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-primary" />
              Dancing Mascot
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Control the animated mascots that pop up on the movie and series pages.
            </p>
          </div>
        </div>

        {settingsLoading ? (
          <div className="flex items-center justify-center h-40">
            <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Enable / Disable toggle card */}
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-sm">Mascot Visibility</p>
                  <p className="text-muted-foreground text-xs mt-0.5">
                    Show or hide dancing mascots on the user-facing app.
                  </p>
                </div>
                <button
                  data-testid="toggle-mascot-enabled"
                  onClick={() => updateMutation.mutate({ enabled: !settings?.enabled })}
                  disabled={updateMutation.isPending}
                  className="flex items-center gap-2 transition-all"
                >
                  {settings?.enabled ? (
                    <ToggleRight className="w-10 h-10 text-primary" />
                  ) : (
                    <ToggleLeft className="w-10 h-10 text-muted-foreground" />
                  )}
                  <span className={`text-sm font-semibold ${settings?.enabled ? "text-primary" : "text-muted-foreground"}`}>
                    {settings?.enabled ? "ON" : "OFF"}
                  </span>
                </button>
              </div>
            </div>

            {/* Timing settings */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <p className="font-semibold text-sm">Interval Between Shows</p>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    data-testid="input-interval"
                    min={10}
                    max={3600}
                    defaultValue={settings?.intervalSeconds ?? 120}
                    className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    onBlur={(e) => updateMutation.mutate({ intervalSeconds: Number(e.target.value) })}
                  />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">seconds</span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">How long to wait between mascot appearances.</p>
              </div>

              <div className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Timer className="w-4 h-4 text-muted-foreground" />
                  <p className="font-semibold text-sm">Show Duration</p>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    data-testid="input-duration"
                    min={2}
                    max={30}
                    defaultValue={settings?.showDurationSeconds ?? 6}
                    className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    onBlur={(e) => updateMutation.mutate({ showDurationSeconds: Number(e.target.value) })}
                  />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">seconds</span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">How long each mascot stays visible.</p>
              </div>
            </div>

            {/* Lottie file library */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-sm">Animation Library</p>
                  <p className="text-muted-foreground text-xs mt-0.5">
                    Upload .lottie files and toggle which ones are active.
                  </p>
                </div>
                <button
                  data-testid="button-upload-lottie"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-2 bg-primary text-primary-foreground text-xs font-bold px-4 py-2 rounded-xl hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-50"
                >
                  {uploading ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Upload className="w-3.5 h-3.5" />
                  )}
                  Upload .lottie
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".lottie"
                  className="hidden"
                  onChange={handleUpload}
                />
              </div>

              {filesLoading ? (
                <div className="flex justify-center py-8">
                  <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : files.length === 0 ? (
                <div className="flex flex-col items-center py-10 text-center">
                  <FileVideo className="w-12 h-12 text-muted-foreground/30 mb-3" />
                  <p className="text-muted-foreground text-sm">No .lottie files uploaded yet.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {files.map((f) => {
                    const isActive = activeFiles.includes(f.filename);
                    return (
                      <div
                        key={f.filename}
                        className={`flex items-center gap-4 rounded-xl border p-3 transition-all ${
                          isActive ? "border-primary/40 bg-primary/5" : "border-border bg-background"
                        }`}
                        data-testid={`row-lottie-${f.filename}`}
                      >
                        {/* Preview */}
                        <button
                          onClick={() => setPreviewFile(previewFile === f.url ? null : f.url)}
                          className="w-14 h-14 rounded-lg bg-black/20 flex items-center justify-center flex-shrink-0 overflow-hidden border border-white/10"
                          title="Click to preview"
                        >
                          {previewFile === f.url ? (
                            <DotLottieReact src={f.url} loop autoplay style={{ width: 56, height: 56 }} />
                          ) : (
                            <Sparkles className="w-6 h-6 text-muted-foreground" />
                          )}
                        </button>

                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{f.filename}</p>
                          <p className="text-xs text-muted-foreground">{formatSize(f.size)}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">/lottie/{f.filename}</p>
                        </div>

                        {/* Active toggle */}
                        <button
                          data-testid={`toggle-active-${f.filename}`}
                          onClick={() => toggleFile(f.filename)}
                          disabled={updateMutation.isPending}
                          className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl transition-all ${
                            isActive
                              ? "bg-primary/15 text-primary border border-primary/30"
                              : "bg-white/5 text-muted-foreground border border-border"
                          }`}
                        >
                          {isActive ? <Check className="w-3 h-3" /> : null}
                          {isActive ? "Active" : "Inactive"}
                        </button>

                        {/* Delete */}
                        <button
                          data-testid={`button-delete-${f.filename}`}
                          onClick={() => {
                            if (confirm(`Delete ${f.filename}?`)) deleteMutation.mutate(f.filename);
                          }}
                          className="w-8 h-8 rounded-lg bg-destructive/10 hover:bg-destructive/20 flex items-center justify-center text-destructive transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {activeFiles.length === 0 && !filesLoading && (
                <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-3">
                  <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                  <p className="text-yellow-400 text-xs">
                    No active animations — mascot won't appear even if enabled. Mark at least one file as active.
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
