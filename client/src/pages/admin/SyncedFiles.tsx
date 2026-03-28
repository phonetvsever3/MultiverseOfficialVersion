import { AdminSidebar } from "@/components/AdminSidebar";
import { useQuery, useMutation } from "@tanstack/react-query";
import { FileVideo, Trash2, Database, PlusCircle, CheckCircle2, Download, Film, Sparkles, Tv, Info, Wand2, Search, Globe, Loader2, X, Zap, AlertCircle, Pencil, Check, Copy, ExternalLink, ArrowUpAZ, ArrowDownAZ, Filter, CalendarDays, Hash, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useMemo, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

const PAGE_SIZE = 50;

function looksLikeSeries(fileName: string): boolean {
  return /s\d{1,2}e\d{1,2}/i.test(fileName);
}

function buildTelegramLink(channelId: string, messageId: number): string {
  let cid = channelId.replace(/^-100/, "").replace(/^-/, "");
  return `https://t.me/c/${cid}/${messageId}`;
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function AdminSyncedFiles() {
  const { toast } = useToast();
  const [selectedFile, setSelectedFile] = useState<any>(null);
  const [isConvertOpen, setIsConvertOpen] = useState(false);
  const [contentType, setConvertType] = useState<"movie" | "episode">("movie");
  const [targetMovieId, setTargetMovieId] = useState<string>("");

  // --- Filter / Sort state (passed to server) ---
  const [searchQuery, setSearchQuery] = useState("");
  const [fileIdSearch, setFileIdSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "movie" | "series">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortAZ, setSortAZ] = useState<"none" | "az" | "za">("none");
  const [page, setPage] = useState(0);

  // Debounce text inputs so we don't hit the API on every keystroke
  const dSearch = useDebounce(searchQuery, 350);
  const dFileId = useDebounce(fileIdSearch, 350);

  // Reset page when filters change
  useEffect(() => { setPage(0); }, [dSearch, dFileId, typeFilter, dateFrom, dateTo, sortAZ]);

  // Build query params
  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    if (dSearch) p.set("search", dSearch);
    if (dFileId) p.set("fileIdSearch", dFileId);
    if (typeFilter !== "all") p.set("type", typeFilter);
    if (dateFrom) p.set("dateFrom", dateFrom);
    if (dateTo) p.set("dateTo", dateTo);
    if (sortAZ !== "none") p.set("sort", sortAZ);
    p.set("limit", String(PAGE_SIZE));
    p.set("offset", String(page * PAGE_SIZE));
    return p.toString();
  }, [dSearch, dFileId, typeFilter, dateFrom, dateTo, sortAZ, page]);

  const { data, isLoading, refetch } = useQuery<{ items: any[]; total: number }>({
    queryKey: ["/api/synced-files", queryParams],
    queryFn: () => fetch(`/api/synced-files?${queryParams}`).then(r => r.json()),
    staleTime: 10_000,
    placeholderData: (prev) => prev,
  });

  const files = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const { data: movies } = useQuery<{ items: any[] }>({
    queryKey: ["/api/movies"],
  });

  // Conversion form
  const [convTitle, setConvTitle] = useState("");
  const [convOverview, setConvOverview] = useState("");
  const [convQuality, setConvQuality] = useState("720p");
  const [convPosterPath, setConvPosterPath] = useState("");
  const [convGenre, setConvGenre] = useState("");
  const [convTmdbId, setConvTmdbId] = useState<number | undefined>(undefined);
  const [convSeason, setConvSeason] = useState(1);
  const [convEpisode, setConvEpisode] = useState(1);
  const [tmdbSearch, setTmdbSearch] = useState("");
  const [tmdbResults, setTmdbResults] = useState<any[]>([]);
  const [isTmdbSearching, setIsTmdbSearching] = useState(false);

  const deleteFile = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/synced-files/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/synced-files"] });
      toast({ title: "File removed from sync list" });
    },
  });

  const convertMutation = useMutation({
    mutationFn: async () => {
      if (contentType === "movie") {
        return await apiRequest("POST", "/api/movies", {
          title: convTitle || selectedFile?.fileName?.split('.')[0] || "Unknown",
          type: "movie",
          quality: convQuality,
          overview: convOverview,
          posterPath: convPosterPath,
          genre: convGenre,
          tmdbId: convTmdbId,
          fileId: selectedFile.fileId,
          fileUniqueId: selectedFile.fileUniqueId,
          fileSize: selectedFile.fileSize,
        });
      } else {
        return await apiRequest("POST", "/api/episodes", {
          movieId: parseInt(targetMovieId),
          seasonNumber: convSeason,
          episodeNumber: convEpisode,
          fileId: selectedFile.fileId,
          fileUniqueId: selectedFile.fileUniqueId,
          fileSize: selectedFile.fileSize,
        });
      }
    },
    onSuccess: () => {
      setIsConvertOpen(false);
      toast({ title: `Successfully converted to ${contentType}` });
      queryClient.invalidateQueries({ queryKey: ["/api/movies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/synced-files"] });
    },
    onError: (err: any) => {
      toast({ title: "Conversion failed", description: err.message || "Please try again.", variant: "destructive" });
    },
  });

  const [editingFileId, setEditingFileId] = useState<number | null>(null);
  const [editingFileName, setEditingFileName] = useState("");

  const renameMutation = useMutation({
    mutationFn: async ({ id, fileName }: { id: number; fileName: string }) => {
      await apiRequest("PATCH", `/api/synced-files/${id}`, { fileName });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/synced-files"] });
      setEditingFileId(null);
      toast({ title: "File name updated" });
    },
    onError: (err: any) => {
      toast({ title: "Rename failed", description: err.message, variant: "destructive" });
    },
  });

  const startEditing = (file: any) => { setEditingFileId(file.id); setEditingFileName(file.fileName || ""); };
  const cancelEditing = () => { setEditingFileId(null); setEditingFileName(""); };
  const saveEditing = (id: number) => { if (!editingFileName.trim()) return; renameMutation.mutate({ id, fileName: editingFileName.trim() }); };

  const [autoAddingId, setAutoAddingId] = useState<number | null>(null);
  const [isBulkRunning, setIsBulkRunning] = useState(false);
  const [bulkResult, setBulkResult] = useState<null | { added: number; skipped: number; failed: number; total: number; addedTitles: string[]; errors: string[] }>(null);
  const [showBulkResult, setShowBulkResult] = useState(false);

  const handleBulkAutoAdd = async () => {
    setIsBulkRunning(true);
    setBulkResult(null);
    try {
      const res = await fetch("/api/synced-files/bulk-auto-add", { method: "POST" });
      const d = await res.json();
      if (!res.ok) { toast({ title: d.message || "Bulk auto-add failed", variant: "destructive" }); }
      else { setBulkResult(d); setShowBulkResult(true); queryClient.invalidateQueries({ queryKey: ["/api/movies"] }); queryClient.invalidateQueries({ queryKey: ["/api/synced-files"] }); }
    } catch (err: any) { toast({ title: "Bulk auto-add error: " + err.message, variant: "destructive" }); }
    finally { setIsBulkRunning(false); }
  };

  const handleAutoAddMovie = async (file: any) => {
    setAutoAddingId(file.id);
    try {
      const res = await fetch(`/api/synced-files/${file.id}/auto-add-movie`, { method: "POST" });
      const d = await res.json();
      if (!res.ok) {
        if (d.reason === "already_exists") toast({ title: "Already in library", description: "This file is already added." });
        else toast({ title: d.message || "Auto-add failed", variant: "destructive" });
      } else {
        const label = d.type === "series" && d.episode
          ? `${d.movie.title} S${String(d.episode.seasonNumber).padStart(2,"0")}E${String(d.episode.episodeNumber).padStart(2,"0")}`
          : d.movie.title;
        toast({ title: `✅ Added: "${label}" from TMDB!` });
        queryClient.invalidateQueries({ queryKey: ["/api/movies"] });
        queryClient.invalidateQueries({ queryKey: ["/api/synced-files"] });
      }
    } catch (err: any) { toast({ title: "Auto-add error: " + err.message, variant: "destructive" }); }
    finally { setAutoAddingId(null); }
  };

  const openConvertDialog = (file: any) => {
    setSelectedFile(file);
    const rawName = file.fileName?.split('.').slice(0, -1).join('.') || file.fileName || "";
    setConvTitle(rawName.replace(/[._-]/g, ' ').replace(/\s+/g, ' ').trim());
    setConvOverview(""); setConvQuality("720p"); setConvPosterPath("");
    setConvGenre(""); setConvTmdbId(undefined); setConvSeason(1);
    setConvEpisode(1); setConvertType("movie"); setTargetMovieId("");
    setTmdbSearch(""); setTmdbResults([]);
    setIsConvertOpen(true);
  };

  const searchTmdb = async () => {
    if (!tmdbSearch.trim()) return;
    setIsTmdbSearching(true);
    try {
      const settingsRes = await fetch("/api/settings");
      const s = await settingsRes.json();
      if (!s.tmdbApiKey) { toast({ title: "TMDB API Key not set", variant: "destructive" }); return; }
      const type = contentType === "episode" ? "tv" : "movie";
      const res = await fetch(`https://api.themoviedb.org/3/search/${type}?api_key=${s.tmdbApiKey}&query=${encodeURIComponent(tmdbSearch)}`);
      const d = await res.json();
      setTmdbResults(d.results?.slice(0, 5) || []);
    } catch { toast({ title: "TMDB search failed", variant: "destructive" }); }
    finally { setIsTmdbSearching(false); }
  };

  const selectTmdbResult = async (result: any) => {
    setConvTitle(result.title || result.name || "");
    setConvOverview(result.overview || "");
    setConvPosterPath(result.poster_path || "");
    setConvTmdbId(result.id);
    setTmdbResults([]); setTmdbSearch("");
    try {
      const settingsRes = await fetch("/api/settings");
      const s = await settingsRes.json();
      if (s.tmdbApiKey) {
        const type = contentType === "episode" ? "tv" : "movie";
        const detailsRes = await fetch(`https://api.themoviedb.org/3/${type}/${result.id}?api_key=${s.tmdbApiKey}`);
        const details = await detailsRes.json();
        if (details.genres?.length > 0) setConvGenre(details.genres.map((g: any) => g.name).join(", "));
      }
    } catch {}
    toast({ title: "Imported from TMDB", description: result.title || result.name });
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes || bytes === 0) return "Unknown";
    const mb = bytes / (1024 * 1024);
    if (mb >= 1000) return (mb / 1024).toFixed(2) + " GB";
    return mb.toFixed(2) + " MB";
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) + " " +
      d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  };

  const copyFileId = (fileId: string) => {
    navigator.clipboard.writeText(fileId).then(() => {
      toast({ title: "File ID copied to clipboard" });
    }).catch(() => toast({ title: "Failed to copy", variant: "destructive" }));
  };

  const hasActiveFilters = typeFilter !== "all" || dateFrom || dateTo || sortAZ !== "none" || dSearch || dFileId;

  const clearFilters = () => {
    setSearchQuery(""); setFileIdSearch("");
    setTypeFilter("all"); setDateFrom(""); setDateTo(""); setSortAZ("none");
  };

  return (
    <div className="min-h-screen bg-background flex">
      <AdminSidebar />
      <main className="flex-1 md:ml-64 p-8 overflow-y-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-black font-display text-foreground tracking-tight flex items-center gap-3">
              <Database className="w-8 h-8 text-primary" /> SYNCED FILES
            </h1>
            <p className="text-muted-foreground">Files automatically captured from your source channels.</p>
          </div>
          <div className="bg-primary/5 px-6 py-3 rounded-2xl border border-primary/10 flex items-center gap-3">
            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.5)]" />
            <span className="text-xs font-black uppercase tracking-widest text-primary/80">Auto-Sync Active</span>
          </div>
        </div>

        <Card className="border-border bg-card shadow-2xl rounded-[2rem] overflow-hidden">
          <CardHeader className="p-8 border-b border-border/50">
            <div className="flex flex-col gap-4">
              {/* Top row */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <CardTitle className="text-xl font-black uppercase tracking-tighter">Capture Queue</CardTitle>
                  <CardDescription>
                    Recently detected videos and documents.
                    {!isLoading && (
                      <span className="ml-2 text-primary font-bold">
                        {total.toLocaleString()} file{total !== 1 ? "s" : ""}
                        {totalPages > 1 && ` · page ${page + 1}/${totalPages}`}
                      </span>
                    )}
                  </CardDescription>
                </div>
                <div className="flex gap-3 w-full sm:w-auto flex-wrap">
                  <Button
                    size="sm"
                    className="rounded-full px-4 h-9 font-black text-[10px] uppercase tracking-widest bg-green-500/90 hover:bg-green-500 text-white transition-all whitespace-nowrap"
                    onClick={handleBulkAutoAdd}
                    disabled={isBulkRunning}
                    data-testid="button-bulk-auto-add"
                  >
                    {isBulkRunning ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : <Zap className="w-3 h-3 mr-2" />}
                    {isBulkRunning ? "Processing..." : "Auto Add All"}
                  </Button>
                  <Button variant="outline" size="sm" className="rounded-full px-4 h-9 font-black text-[10px] uppercase tracking-widest hover:bg-primary/10 hover:text-primary transition-all whitespace-nowrap" onClick={() => refetch()}>
                    <Sparkles className="w-3 h-3 mr-2" /> Refresh
                  </Button>
                </div>
              </div>

              {/* Filter row 1: text searches */}
              <div className="flex flex-wrap gap-3 items-center">
                {/* File name search */}
                <div className="relative flex-1 min-w-[160px] sm:max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search file name..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="pl-9 h-9 bg-secondary/20 border-border rounded-xl text-sm"
                    data-testid="input-search-synced-files"
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* File ID search */}
                <div className="relative flex-1 min-w-[160px] sm:max-w-xs">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by File ID..."
                    value={fileIdSearch}
                    onChange={e => setFileIdSearch(e.target.value)}
                    className="pl-9 h-9 bg-secondary/20 border-border rounded-xl text-sm font-mono"
                    data-testid="input-search-file-id"
                  />
                  {fileIdSearch && (
                    <button onClick={() => setFileIdSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Filter row 2: type, date, sort */}
              <div className="flex flex-wrap gap-3 items-center">
                {/* Type filter */}
                <Select value={typeFilter} onValueChange={(v: any) => setTypeFilter(v)}>
                  <SelectTrigger className="h-9 w-36 rounded-xl border-border bg-secondary/20 text-xs font-black uppercase tracking-wide" data-testid="select-type-filter">
                    <Filter className="w-3.5 h-3.5 mr-1.5 text-primary shrink-0" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="movie">Movie</SelectItem>
                    <SelectItem value="series">Series</SelectItem>
                  </SelectContent>
                </Select>

                {/* Date from */}
                <div className="relative">
                  <CalendarDays className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={e => setDateFrom(e.target.value)}
                    className="h-9 pl-8 pr-3 rounded-xl border border-border bg-secondary/20 text-xs font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    title="From date"
                    data-testid="input-date-from"
                  />
                </div>

                {/* Date to */}
                <div className="relative">
                  <CalendarDays className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  <input
                    type="date"
                    value={dateTo}
                    onChange={e => setDateTo(e.target.value)}
                    className="h-9 pl-8 pr-3 rounded-xl border border-border bg-secondary/20 text-xs font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    title="To date"
                    data-testid="input-date-to"
                  />
                </div>

                {/* A-Z sort */}
                <Button
                  variant="outline"
                  size="sm"
                  className={`h-9 px-3 rounded-xl text-[10px] font-black uppercase tracking-widest border-border gap-1.5 transition-all ${sortAZ !== "none" ? "bg-primary/10 text-primary border-primary/30" : "bg-secondary/20"}`}
                  onClick={() => setSortAZ(s => s === "none" ? "az" : s === "az" ? "za" : "none")}
                  data-testid="button-sort-az"
                >
                  {sortAZ === "za" ? <ArrowDownAZ className="w-4 h-4" /> : <ArrowUpAZ className="w-4 h-4" />}
                  {sortAZ === "none" ? "A–Z" : sortAZ === "az" ? "A–Z" : "Z–A"}
                </Button>

                {/* Clear */}
                {hasActiveFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 px-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    onClick={clearFilters}
                    data-testid="button-clear-filters"
                  >
                    <X className="w-3.5 h-3.5 mr-1" /> Clear
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-secondary/20">
                <TableRow className="hover:bg-transparent border-border/50">
                  <TableHead className="p-6 text-[10px] font-black uppercase tracking-[0.2em]">File Name</TableHead>
                  <TableHead className="text-center text-[10px] font-black uppercase tracking-[0.2em]">Size</TableHead>
                  <TableHead className="text-center text-[10px] font-black uppercase tracking-[0.2em]">Type</TableHead>
                  <TableHead className="text-center text-[10px] font-black uppercase tracking-[0.2em]">Date</TableHead>
                  <TableHead className="text-right p-6 text-[10px] font-black uppercase tracking-[0.2em]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-20">
                      <div className="flex flex-col items-center gap-3 text-muted-foreground">
                        <Loader2 className="w-8 h-8 animate-spin text-primary" />
                        <span className="text-xs font-black uppercase tracking-widest opacity-60">Loading Files...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : files.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-20 italic text-muted-foreground font-medium">
                      {hasActiveFilters ? "No files match the current filters." : "No files synced yet. Post a video in your source channel!"}
                    </TableCell>
                  </TableRow>
                ) : (
                  files.map((file) => (
                    <TableRow key={file.id} className="hover:bg-white/[0.02] border-border/30 transition-colors group">
                      <TableCell className="p-6">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center border border-primary/20 group-hover:scale-110 transition-transform shrink-0">
                            {looksLikeSeries(file.fileName || "") ? <Tv className="w-6 h-6 text-primary" /> : <Film className="w-6 h-6 text-primary" />}
                          </div>
                          <div className="flex flex-col min-w-0 flex-1">
                            {editingFileId === file.id ? (
                              <div className="flex items-center gap-2">
                                <Input
                                  value={editingFileName}
                                  onChange={e => setEditingFileName(e.target.value)}
                                  onKeyDown={e => { if (e.key === 'Enter') saveEditing(file.id); if (e.key === 'Escape') cancelEditing(); }}
                                  className="h-8 text-sm font-bold bg-secondary/30 border-primary/30 rounded-lg px-2"
                                  autoFocus
                                  data-testid={`input-rename-${file.id}`}
                                />
                                <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-green-400 hover:bg-green-500/10 rounded-lg" onClick={() => saveEditing(file.id)} disabled={renameMutation.isPending} data-testid={`button-save-rename-${file.id}`}>
                                  {renameMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                </Button>
                                <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-muted-foreground hover:bg-secondary/50 rounded-lg" onClick={cancelEditing} data-testid={`button-cancel-rename-${file.id}`}>
                                  <X className="w-4 h-4" />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 group/name">
                                <span className="font-black text-sm text-foreground tracking-tight line-clamp-1">{file.fileName}</span>
                                <button className="opacity-0 group-hover/name:opacity-100 transition-opacity p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary shrink-0" onClick={() => startEditing(file)} data-testid={`button-edit-name-${file.id}`}>
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}

                            {/* File ID with copy */}
                            <div className="flex items-center gap-1.5 mt-1">
                              <span className="text-[10px] font-mono text-muted-foreground tracking-tight">
                                {file.fileId.substring(0, 20)}…
                              </span>
                              <button
                                onClick={() => copyFileId(file.fileId)}
                                className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary shrink-0"
                                title="Copy full File ID"
                                data-testid={`button-copy-fileid-${file.id}`}
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                            </div>

                            {/* Telegram source link */}
                            {file.channelId && file.messageId && (
                              <a
                                href={buildTelegramLink(file.channelId, file.messageId)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 mt-1 text-[10px] font-bold text-blue-400/70 hover:text-blue-400 transition-colors w-fit"
                                data-testid={`link-telegram-source-${file.id}`}
                              >
                                <ExternalLink className="w-3 h-3" />
                                Telegram Source
                              </a>
                            )}
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="text-center">
                        <div className="inline-block px-3 py-1 bg-white/5 rounded-full border border-white/5 text-[10px] font-black text-muted-foreground">
                          {formatFileSize(file.fileSize)}
                        </div>
                      </TableCell>

                      <TableCell className="text-center">
                        <Badge
                          variant="outline"
                          className={`text-[9px] font-black uppercase tracking-widest border ${looksLikeSeries(file.fileName || "") ? "border-blue-500/30 text-blue-400 bg-blue-500/10" : "border-primary/30 text-primary bg-primary/10"}`}
                          data-testid={`badge-type-${file.id}`}
                        >
                          {looksLikeSeries(file.fileName || "") ? "Series" : "Movie"}
                        </Badge>
                      </TableCell>

                      <TableCell className="text-center">
                        <span className="text-[10px] font-bold text-muted-foreground whitespace-nowrap">
                          {formatDate(file.createdAt)}
                        </span>
                      </TableCell>

                      <TableCell className="text-right p-6">
                        <div className="flex justify-end gap-2 flex-wrap">
                          <Button variant="secondary" size="sm" className="bg-green-500/10 text-green-400 hover:bg-green-500 hover:text-white font-black text-[10px] uppercase tracking-widest h-9 px-3 rounded-xl border border-green-500/20" disabled={autoAddingId === file.id} onClick={() => handleAutoAddMovie(file)} data-testid={`button-auto-add-${file.id}`}>
                            <Wand2 className="w-3.5 h-3.5 mr-1.5" />
                            {autoAddingId === file.id ? "Adding..." : "Auto Add"}
                          </Button>
                          <Button variant="secondary" size="sm" className="bg-primary/10 text-primary hover:bg-primary hover:text-white font-black text-[10px] uppercase tracking-widest h-9 px-3 rounded-xl border border-primary/20" onClick={() => openConvertDialog(file)} data-testid={`button-manual-${file.id}`}>
                            <PlusCircle className="w-3.5 h-3.5 mr-1.5" /> Manual
                          </Button>
                          <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl" onClick={() => { if (confirm("Remove this file?")) deleteFile.mutate(file.id); }} data-testid={`button-delete-${file.id}`}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-border/50">
                <span className="text-xs text-muted-foreground font-bold">
                  Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total.toLocaleString()}
                </span>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="h-8 px-3 rounded-xl" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} data-testid="button-page-prev">
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-xs font-black text-muted-foreground px-2">{page + 1} / {totalPages}</span>
                  <Button variant="outline" size="sm" className="h-8 px-3 rounded-xl" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} data-testid="button-page-next">
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Info cards */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="bg-primary/5 border-primary/20 rounded-[2rem]">
            <CardHeader>
              <CardTitle className="text-lg font-black uppercase flex items-center gap-2">
                <Download className="w-5 h-5 text-primary" /> Manual Add Feature
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-6 leading-relaxed">You can also add movies manually in the <b>Movies</b> tab. Simply paste the File ID from any source to list it in the bot.</p>
              <Button variant="outline" className="w-full h-12 rounded-xl font-black uppercase tracking-widest border-primary/20 hover:bg-primary hover:text-white" asChild>
                <a href="/admin/movies">Go to Movies Library</a>
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-secondary/20 border-border rounded-[2rem]">
            <CardHeader>
              <CardTitle className="text-lg font-black uppercase flex items-center gap-2 text-white/60">
                <Info className="w-5 h-5" /> How it works
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground space-y-3 leading-relaxed">
              <div className="flex gap-3"><CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" /> Bot monitors source channels 24/7.</div>
              <div className="flex gap-3"><CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" /> Any video posted is captured here.</div>
              <div className="flex gap-3"><CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" /> Click <b>Manual</b> to customize and convert to movie or series episode.</div>
            </CardContent>
          </Card>
        </div>

        {/* Manual Conversion Dialog */}
        <Dialog open={isConvertOpen} onOpenChange={setIsConvertOpen}>
          <DialogContent className="bg-card border-border rounded-[2rem] max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-2xl font-black uppercase tracking-tighter">Convert File to Content</DialogTitle>
            </DialogHeader>
            <div className="space-y-5 py-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest">Select Format</Label>
                <div className="grid grid-cols-2 gap-4">
                  <Button variant={contentType === "movie" ? "default" : "outline"} className={`h-14 flex-col gap-1 rounded-2xl ${contentType === "movie" ? 'bg-primary border-primary shadow-lg shadow-primary/20' : ''}`} onClick={() => { setConvertType("movie"); setTmdbResults([]); }} data-testid="button-type-movie">
                    <Film className="w-5 h-5" /> <span className="font-black text-[10px]">NEW MOVIE</span>
                  </Button>
                  <Button variant={contentType === "episode" ? "default" : "outline"} className={`h-14 flex-col gap-1 rounded-2xl ${contentType === "episode" ? 'bg-primary border-primary shadow-lg shadow-primary/20' : ''}`} onClick={() => { setConvertType("episode"); setTmdbResults([]); }} data-testid="button-type-episode">
                    <Tv className="w-5 h-5" /> <span className="font-black text-[10px]">ADD TO SERIES</span>
                  </Button>
                </div>
              </div>

              {contentType === "movie" && (
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-primary" /> Auto-Fill from TMDB
                  </Label>
                  <div className="flex gap-2">
                    <Input placeholder="Search movie or series name..." value={tmdbSearch} onChange={e => setTmdbSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), searchTmdb())} className="h-10 rounded-xl bg-secondary/20 border-border" data-testid="input-tmdb-search" />
                    <Button type="button" variant="secondary" onClick={searchTmdb} disabled={isTmdbSearching} className="h-10 px-3 rounded-xl">
                      {isTmdbSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
                    </Button>
                  </div>
                  {tmdbResults.length > 0 && (
                    <div className="border border-border rounded-xl bg-secondary/20 p-2 space-y-1 max-h-44 overflow-y-auto">
                      {tmdbResults.map(r => (
                        <div key={r.id} className="p-3 hover:bg-primary/10 cursor-pointer rounded-lg text-sm flex gap-3 items-center transition-colors" onClick={() => selectTmdbResult(r)} data-testid={`tmdb-result-${r.id}`}>
                          {r.poster_path && <img src={`https://image.tmdb.org/t/p/w45${r.poster_path}`} className="w-8 h-12 rounded object-cover shrink-0" alt="" />}
                          <div className="flex flex-col min-w-0">
                            <span className="font-bold truncate">{r.title || r.name}</span>
                            <span className="text-[10px] text-muted-foreground">{(r.release_date || r.first_air_date || "").split("-")[0]}</span>
                          </div>
                          <PlusCircle className="w-4 h-4 text-primary ml-auto shrink-0" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {convPosterPath && (
                <div className="flex gap-4 items-start p-3 bg-primary/5 border border-primary/20 rounded-2xl">
                  <img src={`https://image.tmdb.org/t/p/w92${convPosterPath}`} className="w-12 h-16 rounded-lg object-cover shrink-0" alt="" />
                  <div className="min-w-0">
                    <p className="text-xs font-black text-primary mb-0.5">TMDB Matched</p>
                    <p className="text-sm font-bold truncate">{convTitle}</p>
                    {convGenre && <p className="text-[10px] text-muted-foreground mt-0.5">{convGenre}</p>}
                  </div>
                </div>
              )}

              {contentType === "movie" && (
                <>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest">Title</Label>
                    <Input value={convTitle} onChange={e => setConvTitle(e.target.value)} className="h-10 rounded-xl bg-secondary/20 border-border" placeholder="Movie or series title" data-testid="input-conv-title" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest">Description / Overview</Label>
                    <Textarea value={convOverview} onChange={e => setConvOverview(e.target.value)} className="rounded-xl bg-secondary/20 border-border resize-none text-sm" placeholder="Auto-filled from TMDB or enter manually..." rows={3} data-testid="input-conv-overview" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest">Genre</Label>
                    <Input value={convGenre} onChange={e => setConvGenre(e.target.value)} className="h-10 rounded-xl bg-secondary/20 border-border" placeholder="Action, Drama, Comedy..." data-testid="input-conv-genre" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest">Quality</Label>
                    <Select value={convQuality} onValueChange={setConvQuality}>
                      <SelectTrigger className="h-10 rounded-xl border-border bg-secondary/20" data-testid="select-conv-quality"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-card border-border">
                        <SelectItem value="480p">480p</SelectItem>
                        <SelectItem value="720p">720p</SelectItem>
                        <SelectItem value="1080p">1080p</SelectItem>
                        <SelectItem value="4k">4K HDR</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              {contentType === "episode" && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest">Select Series</Label>
                    <Select onValueChange={setTargetMovieId} value={targetMovieId}>
                      <SelectTrigger className="h-11 rounded-xl border-border bg-secondary/20" data-testid="select-series"><SelectValue placeholder="Choose existing series..." /></SelectTrigger>
                      <SelectContent className="bg-card border-border">
                        {movies?.items.filter(m => m.type === 'series').map(m => (
                          <SelectItem key={m.id} value={String(m.id)} className="font-bold py-3">{m.title}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest">Season</Label>
                      <Input type="number" min={1} value={convSeason} onChange={e => setConvSeason(parseInt(e.target.value) || 1)} className="h-10 rounded-xl bg-secondary/20 border-border" data-testid="input-conv-season" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest">Episode</Label>
                      <Input type="number" min={1} value={convEpisode} onChange={e => setConvEpisode(parseInt(e.target.value) || 1)} className="h-10 rounded-xl bg-secondary/20 border-border" data-testid="input-conv-episode" />
                    </div>
                  </div>
                </div>
              )}

              <div className="p-4 bg-secondary/20 border border-border/50 rounded-2xl">
                <Label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-2 block">File Information</Label>
                <div className="text-xs font-bold text-foreground truncate">{selectedFile?.fileName}</div>
                <div className="text-[10px] text-muted-foreground mt-1">{formatFileSize(selectedFile?.fileSize)}</div>
              </div>
            </div>
            <DialogFooter>
              <Button className="w-full h-14 rounded-2xl font-black text-lg shadow-xl" onClick={() => convertMutation.mutate()} disabled={convertMutation.isPending || (contentType === "episode" && !targetMovieId)} data-testid="button-confirm-convert">
                {convertMutation.isPending ? "PROCESSING..." : "CONFIRM CONVERSION"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Bulk Results Dialog */}
        <Dialog open={showBulkResult} onOpenChange={setShowBulkResult}>
          <DialogContent className="bg-card border-border rounded-[2rem] max-w-md max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-2xl font-black uppercase tracking-tighter flex items-center gap-2">
                <Zap className="w-6 h-6 text-green-400" /> Auto Add Results
              </DialogTitle>
            </DialogHeader>
            {bulkResult && (
              <div className="space-y-5 py-2">
                <div className="space-y-2">
                  <Progress value={bulkResult.total > 0 ? ((bulkResult.added + bulkResult.skipped) / bulkResult.total) * 100 : 0} className="h-3 rounded-full" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground text-right">{bulkResult.added + bulkResult.skipped} / {bulkResult.total} processed</p>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-4 text-center"><div className="text-3xl font-black text-green-400">{bulkResult.added}</div><div className="text-[9px] font-black uppercase tracking-widest text-green-400/70 mt-1">Added</div></div>
                  <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-4 text-center"><div className="text-3xl font-black text-yellow-400">{bulkResult.skipped}</div><div className="text-[9px] font-black uppercase tracking-widest text-yellow-400/70 mt-1">Skipped</div></div>
                  <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 text-center"><div className="text-3xl font-black text-red-400">{bulkResult.failed}</div><div className="text-[9px] font-black uppercase tracking-widest text-red-400/70 mt-1">Failed</div></div>
                </div>
                <p className="text-[10px] text-muted-foreground">Skipped = already in library or no TMDB match found.</p>
                {bulkResult.addedTitles.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-green-400">Newly Added</Label>
                    <div className="bg-secondary/20 border border-border rounded-2xl p-3 max-h-44 overflow-y-auto space-y-1">
                      {bulkResult.addedTitles.map((title, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm"><CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" /><span className="font-medium truncate">{title}</span></div>
                      ))}
                    </div>
                  </div>
                )}
                {bulkResult.errors.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-red-400 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5" /> Errors</Label>
                    <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-3 max-h-32 overflow-y-auto space-y-1">
                      {bulkResult.errors.map((err, i) => <div key={i} className="text-[10px] text-red-400/80 font-mono truncate">{err}</div>)}
                    </div>
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button className="w-full h-12 rounded-2xl font-black uppercase tracking-widest" onClick={() => setShowBulkResult(false)} data-testid="button-close-bulk-result">Done</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </main>
    </div>
  );
}
