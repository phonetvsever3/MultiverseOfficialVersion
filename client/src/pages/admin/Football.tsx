import { useState } from "react";
import { AdminSidebar } from "@/components/AdminSidebar";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, Trash2, Key, Trophy, Eye, EyeOff, RefreshCw } from "lucide-react";
import { type FootballApiKey } from "@shared/schema";

export default function AdminFootball() {
  const { toast } = useToast();
  const [newKey, setNewKey] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [revealedKeys, setRevealedKeys] = useState<Set<number>>(new Set());

  const { data: keys = [], isLoading } = useQuery<FootballApiKey[]>({
    queryKey: ["/api/admin/football-keys"],
    queryFn: async () => {
      const res = await fetch("/api/admin/football-keys");
      return res.json();
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/football-keys", {
        key: newKey.trim(),
        label: newLabel.trim() || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/football-keys"] });
      setNewKey("");
      setNewLabel("");
      toast({ title: "API key added", description: "The SportSRC key is now active." });
    },
    onError: (e: Error) => {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const res = await apiRequest("PATCH", `/api/admin/football-keys/${id}`, { isActive });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/football-keys"] });
    },
    onError: (e: Error) => {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/football-keys/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/football-keys"] });
      toast({ title: "Key deleted" });
    },
    onError: (e: Error) => {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    },
  });

  function maskKey(k: string) {
    if (k.length <= 8) return "••••••••";
    return k.slice(0, 4) + "••••••••" + k.slice(-4);
  }

  function toggleReveal(id: number) {
    setRevealedKeys(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const activeCount = keys.filter(k => k.isActive).length;

  return (
    <div className="min-h-screen bg-background flex">
      <AdminSidebar />
      <main className="flex-1 md:ml-64 p-8 overflow-y-auto">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold font-display text-foreground flex items-center gap-3">
              <Trophy className="w-8 h-8 text-green-500" />
              Football API Keys
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage SportSRC API keys. Multiple keys are supported — one is chosen randomly per request for load balancing.
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <Card>
              <CardContent className="pt-5">
                <p className="text-2xl font-black text-foreground">{keys.length}</p>
                <p className="text-xs text-muted-foreground mt-1">Total Keys</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <p className="text-2xl font-black text-green-500">{activeCount}</p>
                <p className="text-xs text-muted-foreground mt-1">Active Keys</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <p className="text-2xl font-black text-foreground">{keys.length - activeCount}</p>
                <p className="text-xs text-muted-foreground mt-1">Inactive Keys</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <p className="text-2xl font-black text-blue-500">{keys.reduce((s, k) => s + (k.requestCount ?? 0), 0).toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-1">Total API Requests</p>
              </CardContent>
            </Card>
          </div>

          {/* Add Key Card */}
          <Card className="mb-6 hover-elevate">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5 text-primary" />
                Add New API Key
              </CardTitle>
              <CardDescription>
                Get your SportSRC API key from <a href="https://sportsrc.org" target="_blank" rel="noopener noreferrer" className="text-primary underline">sportsrc.org</a>. You can add unlimited keys — they are used randomly.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col md:flex-row gap-3">
                <Input
                  placeholder="Label (optional, e.g. Key 1)"
                  value={newLabel}
                  onChange={e => setNewLabel(e.target.value)}
                  className="md:w-48"
                  data-testid="input-football-key-label"
                />
                <Input
                  placeholder="SportSRC API Key"
                  value={newKey}
                  onChange={e => setNewKey(e.target.value)}
                  className="flex-1 font-mono"
                  type="password"
                  data-testid="input-football-key"
                  onKeyDown={e => { if (e.key === "Enter" && newKey.trim().length >= 5) addMutation.mutate(); }}
                />
                <Button
                  onClick={() => addMutation.mutate()}
                  disabled={addMutation.isPending || newKey.trim().length < 5}
                  data-testid="button-add-football-key"
                >
                  {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                  Add Key
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Keys List */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5 text-primary" />
                API Keys ({keys.length})
              </CardTitle>
              <CardDescription>
                Toggle keys on/off or delete them. Active keys are chosen randomly per API call.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : keys.length === 0 ? (
                <div className="text-center py-12">
                  <Key className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">No API keys yet. Add one above.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {keys.map((k) => (
                    <div
                      key={k.id}
                      className="flex items-center gap-3 p-4 rounded-xl border border-border bg-muted/20 hover:bg-muted/40 transition-colors"
                      data-testid={`row-football-key-${k.id}`}
                    >
                      <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center flex-shrink-0">
                        <Key className="w-4 h-4 text-green-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-semibold text-foreground">
                            {k.label || `Key #${k.id}`}
                          </span>
                          <Badge variant={k.isActive ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">
                            {k.isActive ? "Active" : "Inactive"}
                          </Badge>
                          <span className="text-[10px] text-blue-500 font-bold bg-blue-500/10 rounded-full px-2 py-0.5">
                            {(k.requestCount ?? 0).toLocaleString()} reqs
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <code className="text-xs text-muted-foreground font-mono">
                            {revealedKeys.has(k.id) ? k.key : maskKey(k.key)}
                          </code>
                          <button
                            onClick={() => toggleReveal(k.id)}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {revealedKeys.has(k.id)
                              ? <EyeOff className="w-3 h-3" />
                              : <Eye className="w-3 h-3" />}
                          </button>
                        </div>
                      </div>
                      <Switch
                        checked={k.isActive ?? true}
                        onCheckedChange={(v) => toggleMutation.mutate({ id: k.id, isActive: v })}
                        data-testid={`switch-football-key-${k.id}`}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteMutation.mutate(k.id)}
                        disabled={deleteMutation.isPending}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10 flex-shrink-0"
                        data-testid={`button-delete-football-key-${k.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Info Card */}
          <Card className="mt-6 border-blue-500/20 bg-blue-500/5">
            <CardContent className="pt-5">
              <div className="flex items-start gap-3">
                <RefreshCw className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-foreground mb-1">How random key rotation works</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Every time the football section fetches match data, one of your active keys is randomly selected. This distributes API usage across all your keys, effectively multiplying your rate limits. Add as many keys as you need.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
