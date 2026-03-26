import { useState, useRef } from "react";
import { AdminSidebar } from "@/components/AdminSidebar";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useForm } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, XCircle, Cloud, Loader2, Github, Save, Clock, Database, Download, Upload, AlertTriangle, Film, Clapperboard, Tv, FileVideo, Users, Megaphone, Settings, Smile, Trophy, History, BarChart2, Link2 } from "lucide-react";
import { format } from "date-fns";
import type { Backup } from "@shared/schema";

const TABLE_LABELS: { key: string; label: string; icon: any; color: string }[] = [
  { key: "movies",             label: "Movies & Series",   icon: Film,        color: "text-blue-400" },
  { key: "episodes",           label: "Episodes",           icon: Clapperboard, color: "text-purple-400" },
  { key: "channels",           label: "Channels",           icon: Tv,          color: "text-cyan-400" },
  { key: "synced_files",       label: "Synced Files",       icon: FileVideo,   color: "text-green-400" },
  { key: "users",              label: "Users",              icon: Users,       color: "text-yellow-400" },
  { key: "ads",                label: "Ads",                icon: Megaphone,   color: "text-orange-400" },
  { key: "settings",           label: "Settings",           icon: Settings,    color: "text-gray-400" },
  { key: "mascot_settings",    label: "Mascot Settings",    icon: Smile,       color: "text-pink-400" },
  { key: "football_api_keys",  label: "Football API Keys",  icon: Trophy,      color: "text-emerald-400" },
  { key: "backups",            label: "Backup History",     icon: History,     color: "text-red-400" },
  { key: "view_logs",          label: "View Logs",          icon: BarChart2,   color: "text-indigo-400" },
  { key: "app_urls",           label: "App URLs",           icon: Link2,       color: "text-rose-400" },
];

export default function BackupPage() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [downloadingTable, setDownloadingTable] = useState<string | null>(null);
  const [uploadingTable, setUploadingTable] = useState<string | null>(null);
  const [pendingTableUpload, setPendingTableUpload] = useState<{ key: string; label: string; file: File } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const tableFileInputRef = useRef<HTMLInputElement>(null);
  const [tableUploadKey, setTableUploadKey] = useState<string | null>(null);

  const { data: tableCounts = {} } = useQuery<Record<string, number>>({
    queryKey: ['/api/db/counts'],
    queryFn: async () => {
      const res = await fetch("/api/db/counts");
      return res.json();
    }
  });

  const handleTableDownload = async (tableKey: string, tableLabel: string) => {
    setDownloadingTable(tableKey);
    try {
      const res = await fetch(`/api/db/export/${tableKey}`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${tableKey}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Downloaded", description: `${tableLabel} exported successfully` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Export failed", variant: "destructive" });
    } finally {
      setDownloadingTable(null);
    }
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const res = await fetch("/api/db/export");
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cinebot-db-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Downloaded", description: "Database exported successfully" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Export failed", variant: "destructive" });
    } finally {
      setIsDownloading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) setConfirmRestore(true);
  };

  const handleRestore = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    setConfirmRestore(false);
    setIsRestoring(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/db/import", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Import failed");
      toast({ title: "Restored", description: "Database restored successfully. Refreshing..." });
      setTimeout(() => window.location.reload(), 1500);
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Restore failed", variant: "destructive" });
    } finally {
      setIsRestoring(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleTableUploadClick = (key: string) => {
    setTableUploadKey(key);
    if (tableFileInputRef.current) {
      tableFileInputRef.current.value = "";
      tableFileInputRef.current.click();
    }
  };

  const handleTableFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !tableUploadKey) return;
    const tableInfo = TABLE_LABELS.find(t => t.key === tableUploadKey);
    if (!tableInfo) return;
    setPendingTableUpload({ key: tableUploadKey, label: tableInfo.label, file });
  };

  const handleTableUploadConfirm = async () => {
    if (!pendingTableUpload) return;
    const { key, label, file } = pendingTableUpload;
    setPendingTableUpload(null);
    setUploadingTable(key);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/db/import/${key}`, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Import failed");
      toast({ title: "Imported", description: `${label}: ${data.inserted} rows restored successfully` });
      queryClient.invalidateQueries({ queryKey: ['/api/db/counts'] });
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Import failed", variant: "destructive" });
    } finally {
      setUploadingTable(null);
      if (tableFileInputRef.current) tableFileInputRef.current.value = "";
    }
  };

  // Fetch settings
  const { data: settings } = useQuery({
    queryKey: ['/api/settings'],
    queryFn: async () => {
      const res = await fetch("/api/settings");
      return res.json();
    }
  });

  // Fetch backup history
  const { data: backups = [], isLoading: isLoadingBackups, refetch } = useQuery<Backup[]>({
    queryKey: ['/api/backup/history'],
    queryFn: async () => {
      const res = await fetch("/api/backup/history");
      return res.json();
    }
  });

  // Manual backup mutation
  const manualBackup = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/backup/manual", {});
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Backup completed successfully" });
      refetch();
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Backup failed",
        variant: "destructive" 
      });
    }
  });

  // Update settings mutation
  const updateSettingsForm = useForm({
    defaultValues: {
      githubToken: settings?.githubToken || "",
      githubRepo: settings?.githubRepo || "",
      githubBranch: settings?.githubBranch || "main",
      autoBackupEnabled: settings?.autoBackupEnabled || false
    }
  });

  const updateSettings = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/settings", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Updated", description: "Backup settings saved" });
      queryClient.invalidateQueries({ queryKey: ['/api/settings'] });
      setOpen(false);
    }
  });

  const isConfigured = settings?.githubToken && settings?.githubRepo;

  return (
    <div className="min-h-screen bg-background flex">
      <AdminSidebar />
      
      <div className="flex-1 p-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-12">
            <h1 className="text-4xl font-black mb-2 flex items-center gap-3">
              <Cloud className="w-8 h-8 text-primary" />
              Backup & Restore
            </h1>
            <p className="text-muted-foreground">Download your database or restore it from a previous backup, and sync source code to GitHub</p>
          </div>

          {/* Database Backup & Restore */}
          <Card className="mb-8 border-primary/20">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Database className="w-5 h-5 text-primary" />
                Database Backup & Restore
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Export your entire database (movies, episodes, channels, ads, users, settings) as a single JSON file, 
                or restore from a previously downloaded backup.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Download */}
                <div className="p-4 rounded-lg bg-secondary/30 border border-border space-y-3">
                  <div className="flex items-center gap-2">
                    <Download className="w-4 h-4 text-green-500" />
                    <span className="font-semibold text-sm">Download Database</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Save a complete snapshot of all your data to your device.
                  </p>
                  <Button
                    data-testid="button-db-download"
                    className="w-full"
                    variant="outline"
                    onClick={handleDownload}
                    disabled={isDownloading}
                  >
                    {isDownloading ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Exporting...</>
                    ) : (
                      <><Download className="w-4 h-4 mr-2" />Download Now</>
                    )}
                  </Button>
                </div>

                {/* Upload / Restore */}
                <div className="p-4 rounded-lg bg-secondary/30 border border-border space-y-3">
                  <div className="flex items-center gap-2">
                    <Upload className="w-4 h-4 text-orange-500" />
                    <span className="font-semibold text-sm">Restore Database</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Upload a backup file to replace all current data. This cannot be undone.
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/json,.json"
                    className="hidden"
                    onChange={handleFileSelect}
                    data-testid="input-db-restore"
                  />
                  <Button
                    data-testid="button-db-restore"
                    className="w-full"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isRestoring}
                  >
                    {isRestoring ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Restoring...</>
                    ) : (
                      <><Upload className="w-4 h-4 mr-2" />Upload & Restore</>
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Confirm Restore Dialog */}
          <Dialog open={confirmRestore} onOpenChange={(v) => {
            if (!v) { setConfirmRestore(false); if (fileInputRef.current) fileInputRef.current.value = ""; }
          }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-orange-500">
                  <AlertTriangle className="w-5 h-5" />
                  Confirm Database Restore
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  This will <strong className="text-foreground">delete all current data</strong> and replace it with the contents of your backup file. 
                  This action <strong className="text-foreground">cannot be undone</strong>.
                </p>
                <p className="text-sm text-muted-foreground">
                  Are you sure you want to continue?
                </p>
                <div className="flex gap-3">
                  <Button
                    data-testid="button-confirm-restore"
                    className="flex-1"
                    variant="destructive"
                    onClick={handleRestore}
                  >
                    Yes, Restore Database
                  </Button>
                  <Button
                    data-testid="button-cancel-restore"
                    className="flex-1"
                    variant="outline"
                    onClick={() => { setConfirmRestore(false); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Per-Table Downloads + Uploads */}
          <Card className="mb-8 border-primary/20">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Database className="w-5 h-5 text-primary" />
                Individual Tables
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Download or upload any single table as a JSON file. Uploading will replace all existing rows in that table.
              </p>

              {/* Hidden file input shared across all table uploads */}
              <input
                ref={tableFileInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={handleTableFileSelect}
                data-testid="input-table-upload"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {TABLE_LABELS.map(({ key, label, icon: Icon, color }) => (
                  <div
                    key={key}
                    className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border"
                    data-testid={`row-table-${key}`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={`w-4 h-4 ${color}`} />
                      <div>
                        <p className="text-sm font-medium">{label}</p>
                        <span className="text-xs text-muted-foreground">
                          {tableCounts[key] !== undefined ? (
                            <Badge variant="secondary" className="text-xs px-1.5 py-0">
                              {tableCounts[key].toLocaleString()} rows
                            </Badge>
                          ) : (
                            <span className="opacity-50">loading...</span>
                          )}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button
                        data-testid={`button-upload-${key}`}
                        size="sm"
                        variant="outline"
                        className="text-orange-400 border-orange-400/30 hover:bg-orange-400/10"
                        onClick={() => handleTableUploadClick(key)}
                        disabled={uploadingTable !== null || downloadingTable !== null}
                        title={`Upload & replace ${label}`}
                      >
                        {uploadingTable === key ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Upload className="w-3.5 h-3.5" />
                        )}
                      </Button>
                      <Button
                        data-testid={`button-download-${key}`}
                        size="sm"
                        variant="outline"
                        onClick={() => handleTableDownload(key, label)}
                        disabled={downloadingTable !== null || uploadingTable !== null}
                        title={`Download ${label}`}
                      >
                        {downloadingTable === key ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Download className="w-3.5 h-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Confirm Per-Table Upload Dialog */}
          <Dialog open={!!pendingTableUpload} onOpenChange={(v) => {
            if (!v) { setPendingTableUpload(null); if (tableFileInputRef.current) tableFileInputRef.current.value = ""; }
          }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-orange-500">
                  <AlertTriangle className="w-5 h-5" />
                  Replace {pendingTableUpload?.label}?
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  This will <strong className="text-foreground">delete all existing {pendingTableUpload?.label} data</strong> and replace it with the contents of <strong className="text-foreground">{pendingTableUpload?.file.name}</strong>.
                </p>
                {pendingTableUpload?.key === "movies" && (
                  <p className="text-sm text-orange-400 bg-orange-400/10 rounded-lg px-3 py-2">
                    ⚠ Replacing Movies & Series will also clear all Episodes linked to them.
                  </p>
                )}
                <p className="text-sm text-muted-foreground">This action cannot be undone.</p>
                <div className="flex gap-3">
                  <Button
                    data-testid="button-confirm-table-upload"
                    className="flex-1"
                    variant="destructive"
                    onClick={handleTableUploadConfirm}
                  >
                    Yes, Replace Data
                  </Button>
                  <Button
                    data-testid="button-cancel-table-upload"
                    className="flex-1"
                    variant="outline"
                    onClick={() => { setPendingTableUpload(null); if (tableFileInputRef.current) tableFileInputRef.current.value = ""; }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Configuration Status */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Github className="w-5 h-5" />
                Configuration Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isConfigured ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-green-500">
                    <CheckCircle2 className="w-5 h-5" />
                    <span className="font-semibold">GitHub is configured</span>
                  </div>
                  <div className="text-sm text-muted-foreground space-y-1 pl-7">
                    <p>Repository: <code className="bg-secondary px-2 py-1 rounded">{settings?.githubRepo}</code></p>
                    <p>Branch: <code className="bg-secondary px-2 py-1 rounded">{settings?.githubBranch || 'main'}</code></p>
                    <p>Auto Backup: {settings?.autoBackupEnabled ? '🟢 Enabled (Daily)' : '🔴 Disabled'}</p>
                  </div>
                  <div className="mt-3 p-3 bg-blue-500/10 rounded-lg border border-blue-500/20 text-xs text-blue-400">
                    Backs up: <strong>server/</strong>, <strong>client/</strong>, <strong>shared/</strong>, config files &amp; more
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-orange-500">
                    <XCircle className="w-5 h-5" />
                    <span className="font-semibold">GitHub not configured</span>
                  </div>
                  <p className="text-xs text-muted-foreground pl-7">
                    Configure your GitHub token and repo to enable full source code backups
                  </p>
                </div>
              )}
              
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button className="mt-4" variant={isConfigured ? "outline" : "default"}>
                    <Save className="w-4 h-4 mr-2" />
                    {isConfigured ? "Update" : "Configure"} GitHub
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>GitHub Configuration</DialogTitle>
                  </DialogHeader>
                  <Form {...updateSettingsForm}>
                    <form 
                      onSubmit={updateSettingsForm.handleSubmit((data) => updateSettings.mutate(data))}
                      className="space-y-4"
                    >
                      <FormField
                        control={updateSettingsForm.control}
                        name="githubToken"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>GitHub Personal Access Token</FormLabel>
                            <FormControl>
                              <Input 
                                type="password" 
                                placeholder="ghp_..." 
                                {...field} 
                              />
                            </FormControl>
                            <p className="text-xs text-muted-foreground">
                              Create at github.com/settings/tokens (need repo scope)
                            </p>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={updateSettingsForm.control}
                        name="githubRepo"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Repository</FormLabel>
                            <FormControl>
                              <Input placeholder="owner/repo" {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={updateSettingsForm.control}
                        name="githubBranch"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Branch</FormLabel>
                            <FormControl>
                              <Input placeholder="main" {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={updateSettingsForm.control}
                        name="autoBackupEnabled"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="flex items-center gap-2">
                              <input 
                                type="checkbox" 
                                checked={field.value}
                                onChange={field.onChange}
                                className="w-4 h-4"
                              />
                              Enable Auto Backup (Daily)
                            </FormLabel>
                          </FormItem>
                        )}
                      />
                      <Button type="submit" className="w-full" disabled={updateSettings.isPending}>
                        {updateSettings.isPending ? "Saving..." : "Save Configuration"}
                      </Button>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>

          {/* Quick Action */}
          {isConfigured && (
            <Card className="mb-8">
              <CardHeader>
                <CardTitle className="text-lg">Quick Backup</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-3">
                  Commits all your source code files to GitHub. This may take a minute depending on file count.
                </p>
                <Button 
                  onClick={() => manualBackup.mutate()}
                  disabled={manualBackup.isPending}
                  className="w-full"
                >
                  {manualBackup.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Uploading source code...
                    </>
                  ) : (
                    <>
                      <Cloud className="w-4 h-4 mr-2" />
                      Backup Source Code Now
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Backup History */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Backup History
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingBackups ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : backups.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No backups yet</div>
              ) : (
                <div className="space-y-3">
                  {backups.map((backup) => (
                    <div 
                      key={backup.id}
                      className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg border border-border"
                    >
                      <div className="flex items-center gap-3">
                        {backup.status === 'success' ? (
                          <CheckCircle2 className="w-5 h-5 text-green-500" />
                        ) : (
                          <XCircle className="w-5 h-5 text-red-500" />
                        )}
                        <div>
                          <p className="font-semibold text-sm">
                            {backup.type === 'manual' ? '📌 Manual' : '⚙️ Auto'} Backup
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(backup.createdAt), 'MMM d, yyyy HH:mm')}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-semibold uppercase tracking-wide">
                          {backup.status === 'success' ? '✅ Success' : '❌ Failed'}
                        </p>
                        {backup.message && (
                          <p className="text-xs text-muted-foreground mt-1">{backup.message}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
