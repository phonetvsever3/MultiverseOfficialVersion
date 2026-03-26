import { useState } from "react";
import { AdminSidebar } from "@/components/AdminSidebar";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { type AppUrl, type Settings } from "@shared/schema";
import { Link2, Plus, Trash2, ToggleLeft, ToggleRight, Eye, CheckCircle2, XCircle, Globe, RefreshCw, Clock, AlertCircle } from "lucide-react";

function HealthBadge({ isHealthy, lastChecked }: { isHealthy: boolean | null | undefined; lastChecked: string | Date | null | undefined }) {
  const timeStr = lastChecked
    ? new Date(lastChecked).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" })
    : null;

  if (isHealthy === null || isHealthy === undefined) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-secondary border border-border text-xs text-muted-foreground">
        <AlertCircle className="w-3.5 h-3.5" />
        <span>Not checked</span>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold ${
      isHealthy
        ? "bg-green-500/10 border-green-500/20 text-green-400"
        : "bg-red-500/10 border-red-500/20 text-red-400"
    }`}>
      {isHealthy ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
      <span>{isHealthy ? "Online" : "Offline"}</span>
      {timeStr && (
        <span className="opacity-60 flex items-center gap-0.5">
          <Clock className="w-2.5 h-2.5" />{timeStr}
        </span>
      )}
    </div>
  );
}

export default function AppUrlsPage() {
  const { toast } = useToast();
  const [newUrl, setNewUrl] = useState("");
  const [newLabel, setNewLabel] = useState("");

  const { data: urls = [], isLoading } = useQuery<AppUrl[]>({
    queryKey: ["/api/admin/app-urls"],
    refetchInterval: 30000,
  });

  const { data: settings } = useQuery<Settings>({
    queryKey: ["/api/settings"],
  });

  const rotationEnabled = settings?.urlRotationEnabled ?? false;

  const toggleRotation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/settings", { urlRotationEnabled: !rotationEnabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: !rotationEnabled ? "URL Rotation Enabled" : "URL Rotation Disabled" });
    },
    onError: () => toast({ title: "Failed to update rotation setting", variant: "destructive" }),
  });

  const manualCheck = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/app-urls/check", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/app-urls"] });
      toast({ title: "Health check complete", description: "All URLs have been checked." });
    },
    onError: () => toast({ title: "Health check failed", variant: "destructive" }),
  });

  const addUrl = useMutation({
    mutationFn: (data: { url: string; label?: string }) =>
      apiRequest("POST", "/api/admin/app-urls", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/app-urls"] });
      setNewUrl("");
      setNewLabel("");
      toast({ title: "URL added successfully" });
    },
    onError: (e: any) =>
      toast({ title: "Failed to add URL", description: e.message, variant: "destructive" }),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      apiRequest("PATCH", `/api/admin/app-urls/${id}`, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/app-urls"] }),
    onError: () => toast({ title: "Failed to update URL", variant: "destructive" }),
  });

  const deleteUrl = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/app-urls/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/app-urls"] });
      toast({ title: "URL deleted" });
    },
    onError: () => toast({ title: "Failed to delete URL", variant: "destructive" }),
  });

  const handleAdd = () => {
    if (!newUrl.trim()) return;
    addUrl.mutate({ url: newUrl.trim(), label: newLabel.trim() || undefined });
  };

  const totalVisits = urls.reduce((sum, u) => sum + (u.visitCount ?? 0), 0);
  const onlineCount = urls.filter(u => u.isHealthy === true).length;
  const offlineCount = urls.filter(u => u.isHealthy === false).length;

  return (
    <div className="min-h-screen bg-background flex">
      <AdminSidebar />
      <main className="flex-1 md:ml-64 p-6 md:p-8 overflow-y-auto">
        <header className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold font-display text-foreground">URL Manager</h1>
            <p className="text-muted-foreground">Manage bot Open App URLs. Enable rotation to randomly pick a URL on each interaction.</p>
          </div>
          <button
            data-testid="button-manual-check"
            onClick={() => manualCheck.mutate()}
            disabled={manualCheck.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-secondary border border-border rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${manualCheck.isPending ? "animate-spin" : ""}`} />
            {manualCheck.isPending ? "Checking..." : "Check Now"}
          </button>
        </header>

        {/* Rotation Toggle Card */}
        <div className="bg-card border border-border rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-xl ${rotationEnabled ? "bg-green-500/10 text-green-500" : "bg-muted text-muted-foreground"}`}>
                <Globe className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold">URL Rotation</h2>
                <p className="text-sm text-muted-foreground">
                  {rotationEnabled
                    ? "Bot randomly picks a URL from the active pool on each message."
                    : "Bot uses the default base URL. Enable rotation to start randomizing."}
                </p>
              </div>
            </div>
            <button
              data-testid="button-toggle-rotation"
              onClick={() => toggleRotation.mutate()}
              disabled={toggleRotation.isPending}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                rotationEnabled
                  ? "bg-green-500/10 text-green-400 border border-green-500/30 hover:bg-green-500/20"
                  : "bg-secondary text-muted-foreground border border-border hover:text-foreground"
              }`}
            >
              {rotationEnabled ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
              {rotationEnabled ? "ON" : "OFF"}
            </button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">Total URLs</p>
            <p className="text-3xl font-bold text-foreground">{urls.length}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">Active</p>
            <p className="text-3xl font-bold text-primary">{urls.filter(u => u.isActive).length}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">Online</p>
            <p className="text-3xl font-bold text-green-400">{onlineCount}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">Total Visits</p>
            <p className="text-3xl font-bold text-foreground">{totalVisits.toLocaleString()}</p>
          </div>
        </div>

        {/* Auto-check notice */}
        <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-500/5 border border-blue-500/20 rounded-xl mb-6 text-xs text-blue-400">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          URLs are automatically health-checked every 10 minutes. Click "Check Now" to run an immediate check.
        </div>

        {/* Add URL Form */}
        <div className="bg-card border border-border rounded-2xl p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-primary/10 rounded-lg text-primary">
              <Plus className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold">Add New URL</h2>
          </div>
          <div className="flex flex-col md:flex-row gap-3">
            <input
              data-testid="input-new-url"
              type="url"
              placeholder="https://your-app-domain.com/app"
              value={newUrl}
              onChange={e => setNewUrl(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAdd()}
              className="flex-1 bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <input
              data-testid="input-new-label"
              type="text"
              placeholder="Label (optional)"
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAdd()}
              className="md:w-48 bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <button
              data-testid="button-add-url"
              onClick={handleAdd}
              disabled={addUrl.isPending || !newUrl.trim()}
              className="px-6 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              {addUrl.isPending ? "Adding..." : "Add URL"}
            </button>
          </div>
        </div>

        {/* URL List */}
        <div className="bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-primary/10 rounded-lg text-primary">
              <Link2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold">URL Pool</h2>
              <p className="text-xs text-muted-foreground">
                {urls.length === 0 ? "No URLs added yet" : `${urls.length} URL${urls.length !== 1 ? "s" : ""} · ${offlineCount > 0 ? `${offlineCount} offline` : "all online"}`}
              </p>
            </div>
          </div>

          {isLoading ? (
            <div className="text-center py-10 text-muted-foreground text-sm">Loading...</div>
          ) : urls.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              No URLs added yet. Add your first URL above.
            </div>
          ) : (
            <div className="space-y-3">
              {urls.map(u => (
                <div
                  key={u.id}
                  data-testid={`card-url-${u.id}`}
                  className={`flex flex-col md:flex-row items-start md:items-center gap-3 p-4 rounded-xl border transition-all ${
                    u.isActive ? "border-border bg-background/50" : "border-border/40 bg-background/20 opacity-60"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      {u.isActive
                        ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                        : <XCircle className="w-4 h-4 text-muted-foreground shrink-0" />}
                      <p className="text-sm font-semibold text-foreground truncate">{u.label || "Unlabeled"}</p>
                    </div>
                    <p className="text-xs text-muted-foreground truncate font-mono pl-6">{u.url}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <HealthBadge isHealthy={u.isHealthy} lastChecked={u.lastChecked} />

                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 rounded-lg">
                      <Eye className="w-3.5 h-3.5 text-primary" />
                      <span className="text-xs font-bold text-primary">{(u.visitCount ?? 0).toLocaleString()}</span>
                    </div>

                    <button
                      data-testid={`button-toggle-url-${u.id}`}
                      onClick={() => toggleActive.mutate({ id: u.id, isActive: !u.isActive })}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                        u.isActive
                          ? "bg-green-500/10 text-green-400 border-green-500/20 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20"
                          : "bg-secondary text-muted-foreground border-border hover:bg-green-500/10 hover:text-green-400 hover:border-green-500/20"
                      }`}
                    >
                      {u.isActive ? "Active" : "Inactive"}
                    </button>

                    <button
                      data-testid={`button-delete-url-${u.id}`}
                      onClick={() => deleteUrl.mutate(u.id)}
                      disabled={deleteUrl.isPending}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
