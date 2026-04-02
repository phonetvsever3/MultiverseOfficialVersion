import { useState } from "react";
import { AdminSidebar } from "@/components/AdminSidebar";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { type StreamBackend, type Settings } from "@shared/schema";
import {
  GitFork, Plus, Trash2, ToggleLeft, ToggleRight,
  CheckCircle2, XCircle, RefreshCw, Clock, AlertCircle,
  Activity, Server, ArrowLeftRight, Info,
} from "lucide-react";

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

export default function StreamBackendsPage() {
  const { toast } = useToast();
  const [newUrl, setNewUrl] = useState("");
  const [newLabel, setNewLabel] = useState("");

  const { data: backends = [], isLoading } = useQuery<StreamBackend[]>({
    queryKey: ["/api/admin/stream-backends"],
    refetchInterval: 30000,
  });

  const { data: settings } = useQuery<Settings>({
    queryKey: ["/api/settings"],
  });

  const lbEnabled = settings?.lbEnabled ?? false;

  const toggleLb = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/settings", { lbEnabled: !lbEnabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: !lbEnabled ? "Load Balancer Enabled" : "Load Balancer Disabled" });
    },
    onError: () => toast({ title: "Failed to update setting", variant: "destructive" }),
  });

  const manualCheck = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/stream-backends/check", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stream-backends"] });
      toast({ title: "Health check complete", description: "All backends have been checked." });
    },
    onError: () => toast({ title: "Health check failed", variant: "destructive" }),
  });

  const addBackend = useMutation({
    mutationFn: (data: { url: string; label?: string }) =>
      apiRequest("POST", "/api/admin/stream-backends", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stream-backends"] });
      setNewUrl("");
      setNewLabel("");
      toast({ title: "Backend added" });
    },
    onError: (e: any) =>
      toast({ title: "Failed to add backend", description: e.message, variant: "destructive" }),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      apiRequest("PATCH", `/api/admin/stream-backends/${id}`, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/stream-backends"] }),
    onError: () => toast({ title: "Failed to update backend", variant: "destructive" }),
  });

  const deleteBackend = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/stream-backends/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stream-backends"] });
      toast({ title: "Backend removed" });
    },
    onError: () => toast({ title: "Failed to remove backend", variant: "destructive" }),
  });

  const handleAdd = () => {
    if (!newUrl.trim()) return;
    addBackend.mutate({ url: newUrl.trim(), label: newLabel.trim() || undefined });
  };

  const totalRequests = backends.reduce((s, b) => s + (b.requestCount ?? 0), 0);
  const onlineCount = backends.filter(b => b.isHealthy === true).length;
  const activeCount = backends.filter(b => b.isActive).length;

  return (
    <div className="min-h-screen bg-background flex">
      <AdminSidebar />
      <main className="flex-1 md:ml-64 p-6 md:p-8 overflow-y-auto">
        <header className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold font-display text-foreground">Stream Load Balancer</h1>
            <p className="text-muted-foreground">Distribute streaming traffic across multiple Replit accounts using round-robin rotation.</p>
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

        {/* How it works info */}
        <div className="flex items-start gap-3 px-4 py-3.5 bg-blue-500/5 border border-blue-500/20 rounded-xl mb-6 text-sm text-blue-300">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">How it works: </span>
            Add the base URLs of your 3 Replit accounts (e.g. <code className="text-xs bg-blue-500/10 px-1 rounded">https://your-app.replit.dev</code>).
            When enabled, every stream and download request is automatically forwarded to the next backend in rotation.
            If a backend is offline, traffic fails over to the next healthy one.
          </div>
        </div>

        {/* LB Toggle */}
        <div className="bg-card border border-border rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-xl ${lbEnabled ? "bg-green-500/10 text-green-500" : "bg-muted text-muted-foreground"}`}>
                <ArrowLeftRight className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold">Load Balancing</h2>
                <p className="text-sm text-muted-foreground">
                  {lbEnabled
                    ? `Active — stream requests are rotating across ${activeCount} backend${activeCount !== 1 ? "s" : ""}.`
                    : "Disabled — all streams are served by this server only."}
                </p>
              </div>
            </div>
            <button
              data-testid="button-toggle-lb"
              onClick={() => toggleLb.mutate()}
              disabled={toggleLb.isPending}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                lbEnabled
                  ? "bg-green-500/10 text-green-400 border border-green-500/30 hover:bg-green-500/20"
                  : "bg-secondary text-muted-foreground border border-border hover:text-foreground"
              }`}
            >
              {lbEnabled ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
              {lbEnabled ? "ON" : "OFF"}
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">Backends</p>
            <p className="text-3xl font-bold text-foreground">{backends.length}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">Active</p>
            <p className="text-3xl font-bold text-primary">{activeCount}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">Online</p>
            <p className="text-3xl font-bold text-green-400">{onlineCount}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">Total Requests</p>
            <p className="text-3xl font-bold text-foreground">{totalRequests.toLocaleString()}</p>
          </div>
        </div>

        {/* Auto-check notice */}
        <div className="flex items-center gap-2 px-4 py-2.5 bg-yellow-500/5 border border-yellow-500/20 rounded-xl mb-6 text-xs text-yellow-400">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          Backends are health-checked every 5 minutes automatically. Click "Check Now" for an immediate check.
        </div>

        {/* Add Backend Form */}
        <div className="bg-card border border-border rounded-2xl p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-primary/10 rounded-lg text-primary">
              <Plus className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold">Add Backend</h2>
          </div>
          <div className="flex flex-col md:flex-row gap-3">
            <input
              data-testid="input-new-url"
              type="url"
              placeholder="https://your-other-replit-account.replit.dev"
              value={newUrl}
              onChange={e => setNewUrl(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAdd()}
              className="flex-1 bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <input
              data-testid="input-new-label"
              type="text"
              placeholder="Label (e.g. Account 2)"
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAdd()}
              className="md:w-48 bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <button
              data-testid="button-add-backend"
              onClick={handleAdd}
              disabled={addBackend.isPending || !newUrl.trim()}
              className="px-6 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              {addBackend.isPending ? "Adding..." : "Add Backend"}
            </button>
          </div>
        </div>

        {/* Backend List */}
        <div className="bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-primary/10 rounded-lg text-primary">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Backend Pool</h2>
              <p className="text-xs text-muted-foreground">
                {backends.length === 0
                  ? "No backends added yet"
                  : `${backends.length} backend${backends.length !== 1 ? "s" : ""} · round-robin rotation`}
              </p>
            </div>
          </div>

          {isLoading ? (
            <div className="text-center py-10 text-muted-foreground text-sm">Loading...</div>
          ) : backends.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              <GitFork className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p>No backends added yet.</p>
              <p className="text-xs mt-1 opacity-70">Add the base URLs of your other Replit accounts above.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {backends.map((b, idx) => (
                <div
                  key={b.id}
                  data-testid={`card-backend-${b.id}`}
                  className={`flex flex-col md:flex-row items-start md:items-center gap-3 p-4 rounded-xl border transition-all ${
                    b.isActive ? "border-border bg-background/50" : "border-border/40 bg-background/20 opacity-60"
                  }`}
                >
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                      {idx + 1}
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      {b.isActive
                        ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                        : <XCircle className="w-4 h-4 text-muted-foreground shrink-0" />}
                      <p className="text-sm font-semibold text-foreground truncate">{b.label || "Unlabeled Backend"}</p>
                    </div>
                    <p className="text-xs text-muted-foreground truncate font-mono pl-6">{b.url}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <HealthBadge isHealthy={b.isHealthy} lastChecked={b.lastChecked} />

                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 rounded-lg">
                      <Activity className="w-3.5 h-3.5 text-primary" />
                      <span className="text-xs font-bold text-primary">{(b.requestCount ?? 0).toLocaleString()}</span>
                    </div>

                    <button
                      data-testid={`button-toggle-backend-${b.id}`}
                      onClick={() => toggleActive.mutate({ id: b.id, isActive: !b.isActive })}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                        b.isActive
                          ? "bg-green-500/10 text-green-400 border-green-500/20 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20"
                          : "bg-secondary text-muted-foreground border-border hover:bg-green-500/10 hover:text-green-400 hover:border-green-500/20"
                      }`}
                    >
                      {b.isActive ? "Active" : "Inactive"}
                    </button>

                    <button
                      data-testid={`button-delete-backend-${b.id}`}
                      onClick={() => deleteBackend.mutate(b.id)}
                      disabled={deleteBackend.isPending}
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
