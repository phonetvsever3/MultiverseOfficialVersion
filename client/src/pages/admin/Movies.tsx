import { useState } from "react";
import { AdminSidebar } from "@/components/AdminSidebar";
import { useMovies, useDeleteMovie, useCreateMovie, useUpdateMovie } from "@/hooks/use-movies";
import { Plus, Search, Trash2, Film, Tv, Loader2, Edit2, ChevronRight, ChevronDown, PlusCircle, Database, FileVideo, Globe, Info, RefreshCw, Save, X, Bell, BellRing, Send, Download, AlertTriangle, Radio, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertMovieSchema, type InsertMovie, type Episode } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { api } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

function EpisodeManager({ movieId, tmdbId }: { movieId: number, tmdbId?: number | null }) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingEp, setEditingEp] = useState<Episode | null>(null);
  const [notifyingEpId, setNotifyingEpId] = useState<number | null>(null);
  const [fetchSeasonNum, setFetchSeasonNum] = useState(1);
  const { toast } = useToast();

  const fetchFromTmdb = useMutation({
    mutationFn: async (seasonNumber: number) => {
      const res = await apiRequest("POST", `/api/movies/${movieId}/fetch-season`, { seasonNumber });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/movies/${movieId}/episodes`] });
      toast({ title: `Season fetched from TMDB`, description: `${data.created} new episode${data.created !== 1 ? "s" : ""} added out of ${data.total} total.` });
    },
    onError: (e: any) => toast({ title: "Fetch failed", description: e.message, variant: "destructive" }),
  });

  const handleNotifyEpisode = async (ep: Episode) => {
    setNotifyingEpId(ep.id);
    try {
      const res = await fetch(`/api/notify/episode/${ep.id}`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        toast({ title: `📣 Notified ${data.sent} users`, description: data.failed > 0 ? `${data.failed} failed` : "All delivered!" });
      } else {
        toast({ title: "Notification failed", description: data.message, variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setNotifyingEpId(null);
    }
  };
  const { data: episodes, isLoading } = useQuery<Episode[]>({
    queryKey: [`/api/movies/${movieId}/episodes`],
  });

  const createEpisode = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/episodes", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/movies/${movieId}/episodes`] });
      setIsAdding(false);
      episodeForm.reset({ movieId, seasonNumber: 1, episodeNumber: (episodes?.length || 0) + 2, fileId: "", fileSize: 0, fileUniqueId: "ep_" + Math.random().toString(36).substring(7) });
    }
  });

  const updateEpisode = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PUT", `/api/episodes/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/movies/${movieId}/episodes`] });
      setEditingEp(null);
      toast({ title: "Episode updated" });
    }
  });

  const deleteEpisode = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/episodes/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/movies/${movieId}/episodes`] });
    }
  });

  const episodeForm = useForm({
    defaultValues: {
      movieId,
      seasonNumber: 1,
      episodeNumber: (episodes?.length || 0) + 1,
      fileId: "",
      fileSize: 0,
      fileUniqueId: "ep_" + Math.random().toString(36).substring(7),
    }
  });

  const editForm = useForm({
    defaultValues: {
      seasonNumber: 1,
      episodeNumber: 1,
      title: "",
      overview: "",
      fileId: "",
      fileSize: 0,
    }
  });

  const startEdit = (ep: Episode) => {
    setEditingEp(ep);
    editForm.reset({
      seasonNumber: ep.seasonNumber,
      episodeNumber: ep.episodeNumber,
      title: ep.title || "",
      overview: ep.overview || "",
      fileId: ep.fileId || "",
      fileSize: ep.fileSize ? Math.round(ep.fileSize / (1024 * 1024)) : 0,
    });
  };

  return (
    <div className="mt-4 border-t border-border pt-4">
      <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
        <h3 className="text-sm font-bold flex items-center gap-2">
          <Tv className="w-4 h-4 text-primary" /> Episodes ({(episodes || []).length})
        </h3>
        <div className="flex items-center gap-2">
          {tmdbId && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Season</span>
              <input
                type="number"
                min={1}
                value={fetchSeasonNum}
                onChange={e => setFetchSeasonNum(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-14 h-7 text-xs bg-background border border-border rounded-lg px-2 text-center focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1 text-blue-400 border-blue-500/30 hover:bg-blue-500/10"
                onClick={() => fetchFromTmdb.mutate(fetchSeasonNum)}
                disabled={fetchFromTmdb.isPending}
                title="Auto-fetch all episodes from TMDB for this season"
              >
                {fetchFromTmdb.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                {fetchFromTmdb.isPending ? "Fetching..." : "Fetch from TMDB"}
              </Button>
            </div>
          )}
          <Button size="sm" variant="outline" onClick={() => { setIsAdding(!isAdding); setEditingEp(null); }}>
            {isAdding ? "Cancel" : <><PlusCircle className="w-3 h-3 mr-1" /> Add Episode</>}
          </Button>
        </div>
      </div>

      {isAdding && (
        <Form {...episodeForm}>
          <form onSubmit={episodeForm.handleSubmit((data) => createEpisode.mutate(data))} className="space-y-3 bg-secondary/20 p-3 rounded-lg border border-border mb-4">
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={episodeForm.control}
                name="seasonNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Season</FormLabel>
                    <Input type="number" {...field} value={field.value || 0} onChange={e => field.onChange(parseInt(e.target.value))} className="h-8" />
                  </FormItem>
                )}
              />
              <FormField
                control={episodeForm.control}
                name="episodeNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Episode</FormLabel>
                    <Input type="number" {...field} value={field.value || 0} onChange={e => field.onChange(parseInt(e.target.value))} className="h-8" />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={episodeForm.control}
                name="fileId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">File ID</FormLabel>
                    <Input {...field} className="h-8" placeholder="BAACAg..." />
                  </FormItem>
                )}
              />
              <FormField
                control={episodeForm.control}
                name="fileSize"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Size (MB)</FormLabel>
                    <Input type="number" {...field} value={field.value || 0} onChange={e => field.onChange((parseInt(e.target.value) || 0) * 1024 * 1024)} className="h-8" placeholder="e.g. 450" />
                  </FormItem>
                )}
              />
            </div>
            <Button type="submit" size="sm" className="w-full" disabled={createEpisode.isPending}>
              {createEpisode.isPending ? "Adding..." : "Confirm Episode"}
            </Button>
          </form>
        </Form>
      )}

      <div className="space-y-2 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
        {isLoading ? <div className="text-xs animate-pulse">Loading episodes...</div> : 
         episodes?.length === 0 ? <div className="text-xs text-muted-foreground text-center py-4 italic">No episodes added yet.</div> :
         episodes?.map((ep) => (
           <div key={ep.id} className="bg-secondary/10 rounded border border-border/50 overflow-hidden">
             {editingEp?.id === ep.id ? (
               /* Inline edit form */
               <Form {...editForm}>
                 <form onSubmit={editForm.handleSubmit((data) => updateEpisode.mutate({ id: ep.id, data }))} className="p-3 space-y-3">
                   <div className="flex items-center justify-between mb-1">
                     <span className="text-[10px] font-black uppercase tracking-widest text-primary">Editing Episode</span>
                     <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditingEp(null)}>
                       <X className="w-3 h-3" />
                     </Button>
                   </div>
                   <div className="grid grid-cols-2 gap-2">
                     <FormField control={editForm.control} name="seasonNumber" render={({ field }) => (
                       <FormItem>
                         <FormLabel className="text-[10px]">Season</FormLabel>
                         <Input type="number" {...field} value={field.value || 1} onChange={e => field.onChange(parseInt(e.target.value))} className="h-7 text-xs" />
                       </FormItem>
                     )} />
                     <FormField control={editForm.control} name="episodeNumber" render={({ field }) => (
                       <FormItem>
                         <FormLabel className="text-[10px]">Episode</FormLabel>
                         <Input type="number" {...field} value={field.value || 1} onChange={e => field.onChange(parseInt(e.target.value))} className="h-7 text-xs" />
                       </FormItem>
                     )} />
                   </div>
                   <FormField control={editForm.control} name="title" render={({ field }) => (
                     <FormItem>
                       <FormLabel className="text-[10px]">Title</FormLabel>
                       <Input {...field} value={field.value || ""} className="h-7 text-xs" placeholder="Episode title" />
                     </FormItem>
                   )} />
                   <FormField control={editForm.control} name="overview" render={({ field }) => (
                     <FormItem>
                       <FormLabel className="text-[10px]">Overview</FormLabel>
                       <Textarea {...field} value={field.value || ""} className="text-xs resize-none" rows={2} placeholder="Episode description" />
                     </FormItem>
                   )} />
                   <FormField control={editForm.control} name="fileId" render={({ field }) => (
                     <FormItem>
                       <FormLabel className="text-[10px]">File ID</FormLabel>
                       <Input {...field} value={field.value || ""} className="h-7 text-xs" placeholder="BAACAg..." />
                     </FormItem>
                   )} />
                   <FormField control={editForm.control} name="fileSize" render={({ field }) => (
                     <FormItem>
                       <FormLabel className="text-[10px]">Size (MB)</FormLabel>
                       <Input type="number" {...field} value={field.value || 0} onChange={e => field.onChange((parseInt(e.target.value) || 0) * 1024 * 1024)} className="h-7 text-xs" />
                     </FormItem>
                   )} />
                   <div className="flex gap-2">
                     <Button type="submit" size="sm" className="flex-1 h-7 text-xs" disabled={updateEpisode.isPending}>
                       {updateEpisode.isPending ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Saving...</> : <><Save className="w-3 h-3 mr-1" /> Save</>}
                     </Button>
                     <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setEditingEp(null)}>Cancel</Button>
                   </div>
                 </form>
               </Form>
             ) : (
               /* Normal view row */
               <div className="flex items-center justify-between p-2 text-xs">
                 <div className="flex flex-col min-w-0 flex-1 mr-2">
                   <span className="font-bold truncate">S{ep.seasonNumber} E{ep.episodeNumber}: {ep.title || 'Untitled'}</span>
                   <span className="text-[10px] text-muted-foreground line-clamp-1">{ep.overview || 'No overview available.'}</span>
                 </div>
                 <div className="flex gap-1 shrink-0">
                   <Button
                     variant="ghost"
                     size="icon"
                     className="h-6 w-6 text-muted-foreground hover:text-yellow-400 hover:bg-yellow-400/10"
                     onClick={() => handleNotifyEpisode(ep)}
                     disabled={notifyingEpId === ep.id}
                     title="Notify all users about this episode"
                   >
                     {notifyingEpId === ep.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Bell className="w-3 h-3" />}
                   </Button>
                   <Button
                     variant="ghost"
                     size="icon"
                     className="h-6 w-6 text-muted-foreground hover:text-primary hover:bg-primary/10"
                     onClick={() => startEdit(ep)}
                     title="Edit episode"
                   >
                     <Edit2 className="w-3 h-3" />
                   </Button>
                   <Button 
                     variant="ghost" 
                     size="icon" 
                     className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                     onClick={() => { if(confirm("Delete this episode?")) deleteEpisode.mutate(ep.id); }}
                   >
                     <Trash2 className="w-3 h-3" />
                   </Button>
                 </div>
               </div>
             )}
           </div>
         ))
        }
      </div>
    </div>
  );
}

const PER_PAGE = 50;

type LibraryFilter = 'all' | 'movie' | 'series' | 'ongoing' | 'missing';

const FILTER_TABS: { key: LibraryFilter; label: string; icon: any }[] = [
  { key: 'all', label: 'All', icon: Database },
  { key: 'movie', label: 'Movie', icon: Film },
  { key: 'series', label: 'Series', icon: Tv },
  { key: 'ongoing', label: 'Ongoing', icon: Radio },
  { key: 'missing', label: 'Missing Episode', icon: AlertTriangle },
];

export default function AdminMovies() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>('all');
  const [togglingStatusId, setTogglingStatusId] = useState<number | null>(null);

  const moviesQueryFilters = {
    search,
    page,
    limit: PER_PAGE,
    ...(libraryFilter === 'movie' ? { type: 'movie' as const } : {}),
    ...(libraryFilter === 'series' ? { type: 'series' as const } : {}),
    ...(libraryFilter === 'ongoing' ? { status: 'ongoing' } : {}),
    ...(libraryFilter === 'missing' ? { missingEpisodes: true } : {}),
  };

  const { data, isLoading } = useMovies(moviesQueryFilters);
  const { mutate: deleteMovie } = useDeleteMovie();
  const { mutate: createMovie, isPending: isCreating } = useCreateMovie();
  const { mutate: updateMovie, isPending: isUpdating } = useUpdateMovie();
  const [refreshingId, setRefreshingId] = useState<number | null>(null);
  const [notifyingMovieId, setNotifyingMovieId] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [editingMovie, setEditingMovie] = useState<any>(null);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const [postingChannelId, setPostingChannelId] = useState<number | null>(null);

  const handleToggleStatus = async (movie: any) => {
    setTogglingStatusId(movie.id);
    const newStatus = movie.status === 'ongoing' ? 'completed' : 'ongoing';
    try {
      const res = await fetch(`/api/admin/movies/${movie.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ['/api/movies'] });
        toast({ title: `Marked as ${newStatus}`, description: `${movie.title} is now ${newStatus}` });
      } else {
        const err = await res.json();
        toast({ title: 'Error', description: err.message, variant: 'destructive' });
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setTogglingStatusId(null);
    }
  };

  const removeDuplicates = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/movies/remove-duplicates");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [api.movies.list.path] });
      queryClient.refetchQueries({ queryKey: [api.movies.list.path] });
      toast({ title: "Duplicates Removed", description: data.message });
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  });

  const refreshAllTmdb = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/movies/refresh-all-tmdb");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [api.movies.list.path] });
      queryClient.refetchQueries({ queryKey: [api.movies.list.path] });
      toast({ title: "TMDB Refresh Complete", description: data.message });
    },
    onError: (e: any) => {
      toast({ title: "Refresh Failed", description: e.message, variant: "destructive" });
    }
  });

  const handlePostToChannel = async (movie: any) => {
    setPostingChannelId(movie.id);
    try {
      const res = await fetch(`/api/admin/channel/post-movie/${movie.id}`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        toast({ title: "📢 Posted to channel!", description: `${movie.title} was posted successfully.` });
      } else {
        toast({ title: "Post failed", description: data.message || "Could not post to channel. Check channel username in Settings.", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setPostingChannelId(null);
    }
  };

  const handleNotifyMovie = async (movie: any) => {
    setNotifyingMovieId(movie.id);
    try {
      const res = await fetch(`/api/notify/movie/${movie.id}`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        toast({
          title: `📣 Notification sent!`,
          description: `Delivered to ${data.sent} users${data.failed > 0 ? ` · ${data.failed} failed` : ''}`,
        });
      } else {
        toast({ title: "Notification failed", description: data.message, variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setNotifyingMovieId(null);
    }
  };

  const totalPages = data ? Math.max(1, Math.ceil((data.total || 0) / PER_PAGE)) : 1;

  const handleSearchChange = (val: string) => {
    setSearch(val);
    setPage(1);
  };

  const handleFilterChange = (f: LibraryFilter) => {
    setLibraryFilter(f);
    setPage(1);
  };

  const [tmdbSearch, setTmdbSearch] = useState("");
  const [tmdbResults, setTmdbResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [tmdbApiKey, setTmdbApiKey] = useState<string>("");
  const [movieCast, setMovieCast] = useState<string[]>([]);
  const [qualityUrlsList, setQualityUrlsList] = useState<Array<{ label: string; mode: "fileid" | "url"; fileId?: string; url?: string; type?: "mp4" | "hls" }>>([]);

  const form = useForm<InsertMovie>({
    resolver: zodResolver(insertMovieSchema),
    defaultValues: {
      type: "movie",
      quality: "720p",
      title: "",
      overview: "",
      posterPath: "",
      genre: "",
      releaseDate: "",
      tmdbId: undefined,
      fileId: "",
      fileSize: 0,
      fileUniqueId: "manual_" + Math.random().toString(36).substring(7),
    }
  });

  const searchTmdb = async () => {
    if (!tmdbSearch) return;
    setIsSearching(true);
    try {
      const settingsRes = await fetch("/api/settings");
      const settings = await settingsRes.json();
      if (!settings.tmdbApiKey) {
        toast({ title: "Config Error", description: "Please set TMDB API Key in Settings.", variant: "destructive" });
        return;
      }
      setTmdbApiKey(settings.tmdbApiKey);
      const type = form.getValues("type") === "series" ? "tv" : "movie";
      const res = await fetch(`https://api.themoviedb.org/3/search/${type}?api_key=${settings.tmdbApiKey}&query=${encodeURIComponent(tmdbSearch)}`);
      const data = await res.json();
      setTmdbResults(data.results || []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSearching(false);
    }
  };

  const selectTmdbResult = async (result: any) => {
    form.setValue("title", result.title || result.name);
    form.setValue("tmdbId", result.id);
    form.setValue("overview", result.overview);
    form.setValue("posterPath", result.poster_path);
    form.setValue("releaseDate", result.release_date || result.first_air_date);
    setTmdbResults([]);
    setTmdbSearch("");

    // Auto-fetch genres and cast from TMDB details
    try {
      const apiKey = tmdbApiKey || (await fetch("/api/settings").then(r => r.json()).then(s => s.tmdbApiKey));
      if (apiKey) {
        const type = form.getValues("type") === "series" ? "tv" : "movie";
        const [detailsRes, creditsRes] = await Promise.all([
          fetch(`https://api.themoviedb.org/3/${type}/${result.id}?api_key=${apiKey}`),
          fetch(`https://api.themoviedb.org/3/${type}/${result.id}/credits?api_key=${apiKey}`)
        ]);
        const details = await detailsRes.json();
        const credits = await creditsRes.json();

        // Set genre from details
        if (details.genres && details.genres.length > 0) {
          form.setValue("genre", details.genres.map((g: any) => g.name).join(", "));
        }

        // Set cast (top 5 actors) — stored separately, merged at submit
        if (credits.cast && credits.cast.length > 0) {
          const topCast = credits.cast.slice(0, 5).map((c: any) => c.name);
          setMovieCast(topCast);
        }
      }
    } catch (e) {
      console.error("Error fetching TMDB details:", e);
    }

    toast({ title: "Imported from TMDB", description: `${result.title || result.name} — genres & cast auto-filled` });
  };

  const handleEdit = (movie: any) => {
    setEditingMovie(movie);
    form.reset({
      type: movie.type,
      quality: movie.quality,
      title: movie.title,
      overview: movie.overview || "",
      posterPath: movie.posterPath || "",
      genre: movie.genre || "",
      releaseDate: movie.releaseDate || "",
      tmdbId: movie.tmdbId,
      fileId: movie.fileId || "",
      // Convert bytes → MB for editing
      fileSize: movie.fileSize ? Math.round(movie.fileSize / (1024 * 1024)) : 0,
      fileUniqueId: movie.fileUniqueId,
    });
    setQualityUrlsList(
      Array.isArray(movie.qualityUrls)
        ? movie.qualityUrls.map((q: any) => ({
            label: q.label || "1080p",
            mode: q.fileId ? "fileid" : "url",
            fileId: q.fileId || "",
            url: q.url || "",
            type: q.type || "mp4",
          }))
        : []
    );
    setOpen(true);
  };

  const refreshFromTmdb = async (movieId: number) => {
    setRefreshingId(movieId);
    try {
      const res = await apiRequest("POST", `/api/movies/${movieId}/refresh-tmdb`, {});
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ['/api/movies'] });
        toast({ title: "Updated from TMDB", description: "Genre and cast refreshed" });
      } else {
        const err = await res.json();
        toast({ title: "Could not update", description: err.message, variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setRefreshingId(null);
    }
  };

  const onSubmit = (data: InsertMovie) => {
    // Convert MB → bytes before saving; merge cast if fetched from TMDB; include quality URLs
    const dataWithBytes = {
      ...data,
      fileSize: (data.fileSize || 0) * 1024 * 1024,
      ...(movieCast.length > 0 ? { cast: movieCast } : {}),
      qualityUrls: qualityUrlsList.length > 0
        ? qualityUrlsList.map(({ mode, label, fileId, url, type }) =>
            mode === "fileid"
              ? { label, fileId: fileId || "" }
              : { label, url: url || "", type: type || "mp4" }
          )
        : null,
    } as any;
    if (editingMovie) {
      updateMovie({ id: editingMovie.id, updates: dataWithBytes }, {
        onSuccess: () => {
          setOpen(false);
          setEditingMovie(null);
          setMovieCast([]);
          setQualityUrlsList([]);
          form.reset();
          toast({ title: "Updated successfully" });
        }
      });
    } else {
      createMovie(dataWithBytes, {
        onSuccess: () => {
          setOpen(false);
          setMovieCast([]);
          setQualityUrlsList([]);
          form.reset();
          toast({ title: "Added successfully" });
        }
      });
    }
  };

  return (
    <div className="min-h-screen bg-background flex">
      <AdminSidebar />
      <main className="flex-1 md:ml-64 p-8 overflow-y-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-black font-display text-foreground tracking-tight">Movies Library</h1>
            <p className="text-muted-foreground">Manage your movie and series database.</p>
          </div>
          
          <div className="flex gap-3 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder="Search library..." 
                className="pl-9 bg-card border-border h-11"
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
              />
            </div>
            
            <Button
              variant="outline"
              className="h-11 px-4 rounded-xl border-border text-muted-foreground hover:text-blue-500 hover:border-blue-500"
              onClick={() => refreshAllTmdb.mutate()}
              disabled={refreshAllTmdb.isPending}
              data-testid="button-refresh-all-tmdb"
              title="Update genre, cast, overview and rating for all movies & series from TMDB"
            >
              {refreshAllTmdb.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              <span className="ml-2 hidden sm:inline">Update All TMDB</span>
            </Button>

            <Button
              variant="outline"
              className="h-11 px-4 rounded-xl border-border text-muted-foreground hover:text-destructive hover:border-destructive"
              onClick={() => removeDuplicates.mutate()}
              disabled={removeDuplicates.isPending}
              data-testid="button-remove-duplicates"
              title="Remove duplicate movies with the same TMDB ID"
            >
              {removeDuplicates.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              <span className="ml-2 hidden sm:inline">Remove Dupes</span>
            </Button>

            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button className="bg-primary hover:bg-primary/90 text-white font-black shadow-xl h-11 px-6 rounded-xl">
                  <Plus className="w-5 h-5 mr-2" /> ADD MOVIE
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-border max-w-xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="text-2xl font-black">Add Content</DialogTitle>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-4">
                    <div className="space-y-2">
                      <FormLabel>Auto-Fill from TMDB</FormLabel>
                      <div className="flex gap-2">
                        <Input 
                          placeholder="Search movie name..." 
                          value={tmdbSearch}
                          onChange={(e) => setTmdbSearch(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), searchTmdb())}
                        />
                        <Button type="button" variant="secondary" onClick={searchTmdb} disabled={isSearching}>
                          {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
                        </Button>
                      </div>
                      {tmdbResults.length > 0 && (
                        <div className="max-h-40 overflow-y-auto border border-border rounded-xl bg-secondary/20 p-2 space-y-1">
                          {tmdbResults.slice(0, 5).map((r) => (
                            <div 
                              key={r.id} 
                              className="p-3 hover:bg-primary/10 cursor-pointer rounded-lg text-sm flex justify-between items-center transition-colors"
                              onClick={() => selectTmdbResult(r)}
                            >
                              <div className="font-bold">{r.title || r.name} <span className="text-muted-foreground font-normal ml-1">({ (r.release_date || r.first_air_date || "").split("-")[0]})</span></div>
                              <PlusCircle className="w-4 h-4 text-primary" />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="title"
                        render={({ field }) => (
                          <FormItem className="col-span-2 sm:col-span-1">
                            <FormLabel>Title</FormLabel>
                            <FormControl><Input {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="type"
                        render={({ field }) => (
                          <FormItem className="col-span-2 sm:col-span-1">
                            <FormLabel>Type</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || "movie"}>
                              <FormControl>
                                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="movie">Movie (Direct File)</SelectItem>
                                <SelectItem value="series">Series (Multi-Episode)</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="genre"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Genre</FormLabel>
                          <FormControl><Input placeholder="Action, Drama, Comedy" {...field} value={field.value || ""} /></FormControl>
                          <FormDescription className="text-xs">Auto-filled from TMDB • or enter manually (comma-separated)</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {movieCast.length > 0 && (
                      <div className="p-3 bg-primary/5 rounded-lg border border-primary/20 text-xs">
                        <p className="font-bold text-primary mb-1">Cast (auto-filled from TMDB)</p>
                        <p className="text-muted-foreground">{movieCast.join(", ")}</p>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="quality"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Quality</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || "720p"}>
                              <FormControl>
                                <SelectTrigger><SelectValue placeholder="Quality" /></SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="480p">480p</SelectItem>
                                <SelectItem value="720p">720p</SelectItem>
                                <SelectItem value="1080p">1080p</SelectItem>
                                <SelectItem value="4k">4k HDR</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="fileSize"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Size (MB)</FormLabel>
                            <FormControl>
                              <Input type="number" step="1" min="0" {...field} value={field.value || 0} onChange={e => field.onChange(parseInt(e.target.value) || 0)} placeholder="e.g. 850" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {form.watch("type") === "movie" && (
                      <FormField
                        control={form.control}
                        name="fileId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="flex items-center gap-2">
                              <FileVideo className="w-4 h-4 text-primary" /> Telegram File ID (Movies Only)
                            </FormLabel>
                            <FormControl>
                              <Input {...field} value={field.value || ""} placeholder="Get from bot or synced files" className="bg-primary/5 border-primary/20" />
                            </FormControl>
                            <FormDescription className="text-[10px]">Required for direct movie delivery. Use synced files or bot upload.</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    {/* Multi-Quality Stream Sources */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <FormLabel className="flex items-center gap-2">
                          <Globe className="w-4 h-4 text-blue-500" /> Multi-Quality Sources
                        </FormLabel>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs px-2"
                          data-testid="button-add-quality-url"
                          onClick={() => setQualityUrlsList(prev => [...prev, { label: "720p", mode: "fileid", fileId: "", url: "", type: "mp4" }])}
                        >
                          <Plus className="w-3 h-3 mr-1" /> Add Quality
                        </Button>
                      </div>
                      {qualityUrlsList.length === 0 && (
                        <p className="text-xs text-muted-foreground">No quality sources added. The built-in Telegram stream will be used as the only option.</p>
                      )}
                      {qualityUrlsList.map((entry, i) => (
                        <div key={i} className="rounded-lg border border-border bg-secondary/10 p-3 space-y-2">
                          <div className="flex gap-2 items-center">
                            {/* Quality label */}
                            <select
                              className="h-8 rounded-md border border-border bg-background text-sm px-2 w-24 shrink-0"
                              value={entry.label}
                              data-testid={`select-quality-label-${i}`}
                              onChange={e => setQualityUrlsList(prev => prev.map((q, idx) => idx === i ? { ...q, label: e.target.value } : q))}
                            >
                              <option value="480p">480p</option>
                              <option value="720p">720p</option>
                              <option value="1080p">1080p</option>
                              <option value="4k">4K</option>
                              <option value="HD">HD</option>
                            </select>
                            {/* Mode toggle */}
                            <div className="flex rounded-md border border-border overflow-hidden text-xs">
                              <button
                                type="button"
                                data-testid={`btn-mode-fileid-${i}`}
                                className={`px-2 py-1.5 font-medium transition-colors ${entry.mode === "fileid" ? "bg-primary text-white" : "bg-background text-muted-foreground hover:bg-secondary"}`}
                                onClick={() => setQualityUrlsList(prev => prev.map((q, idx) => idx === i ? { ...q, mode: "fileid" } : q))}
                              >
                                File ID
                              </button>
                              <button
                                type="button"
                                data-testid={`btn-mode-url-${i}`}
                                className={`px-2 py-1.5 font-medium transition-colors ${entry.mode === "url" ? "bg-primary text-white" : "bg-background text-muted-foreground hover:bg-secondary"}`}
                                onClick={() => setQualityUrlsList(prev => prev.map((q, idx) => idx === i ? { ...q, mode: "url" } : q))}
                              >
                                URL
                              </button>
                            </div>
                            <div className="flex-1" />
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 shrink-0"
                              data-testid={`button-remove-quality-url-${i}`}
                              onClick={() => setQualityUrlsList(prev => prev.filter((_, idx) => idx !== i))}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                          {/* Input based on mode */}
                          {entry.mode === "fileid" ? (
                            <Input
                              className="h-8 text-xs font-mono"
                              placeholder="Telegram File ID (e.g. BQACAgIAAxk...)"
                              value={entry.fileId || ""}
                              data-testid={`input-quality-fileid-${i}`}
                              onChange={e => setQualityUrlsList(prev => prev.map((q, idx) => idx === i ? { ...q, fileId: e.target.value } : q))}
                            />
                          ) : (
                            <div className="flex gap-2">
                              <Input
                                className="flex-1 h-8 text-xs"
                                placeholder="https://stream.example.com/video.mp4"
                                value={entry.url || ""}
                                data-testid={`input-quality-url-${i}`}
                                onChange={e => setQualityUrlsList(prev => prev.map((q, idx) => idx === i ? { ...q, url: e.target.value } : q))}
                              />
                              <select
                                className="h-8 rounded-md border border-border bg-background text-xs px-2 w-20 shrink-0"
                                value={entry.type || "mp4"}
                                data-testid={`select-quality-type-${i}`}
                                onChange={e => setQualityUrlsList(prev => prev.map((q, idx) => idx === i ? { ...q, type: e.target.value as "mp4" | "hls" } : q))}
                              >
                                <option value="mp4">MP4</option>
                                <option value="hls">HLS</option>
                              </select>
                            </div>
                          )}
                        </div>
                      ))}
                      {qualityUrlsList.length > 0 && (
                        <p className="text-[10px] text-muted-foreground">Each quality appears as an option in the player. "Auto" (built-in stream) is always added automatically.</p>
                      )}
                    </div>

                    <Button type="submit" size="lg" className="w-full font-black text-lg h-14 rounded-xl shadow-lg" disabled={isCreating || isUpdating}>
                      {editingMovie ? "UPDATE CONTENT" : "CREATE CONTENT"}
                    </Button>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Library Filter Tabs */}
        <div className="flex flex-wrap gap-2 mb-4">
          {FILTER_TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => handleFilterChange(key)}
              data-testid={`filter-${key}`}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wide transition-all border ${
                libraryFilter === key
                  ? key === 'missing'
                    ? 'bg-red-500/20 text-red-400 border-red-500/40'
                    : key === 'ongoing'
                    ? 'bg-green-500/20 text-green-400 border-green-500/40'
                    : 'bg-primary/20 text-primary border-primary/40'
                  : 'bg-secondary/30 text-muted-foreground border-border hover:border-primary/30 hover:text-foreground'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        <div className="bg-card border border-border rounded-[1.5rem] overflow-hidden shadow-2xl">
          <div className="grid grid-cols-12 gap-4 p-6 border-b border-border bg-secondary/20 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">
            <div className="col-span-5">Content Details</div>
            <div className="col-span-2 text-center">Format</div>
            <div className="col-span-2 text-center">Quality</div>
            <div className="col-span-3 text-right">Actions</div>
          </div>
          
          <div className="divide-y divide-border/50">
            {isLoading ? (
              <div className="p-12 text-center text-muted-foreground font-black uppercase tracking-widest animate-pulse">Loading Library...</div>
            ) : data?.items?.length === 0 ? (
               <div className="p-12 text-center text-muted-foreground font-medium italic">No movies found. Try another search.</div>
            ) : (
              data?.items?.map((movie) => (
                <div key={movie.id} className="group">
                  <div 
                    className="grid grid-cols-12 gap-4 p-6 items-center hover:bg-white/[0.02] cursor-pointer transition-all"
                    onClick={() => movie.type === 'series' && setExpandedRow(expandedRow === movie.id ? null : movie.id)}
                  >
                    <div className="col-span-5 flex items-center gap-4">
                      <div className={`w-12 h-16 rounded-xl flex items-center justify-center shadow-lg border border-white/5 overflow-hidden ${movie.type === 'movie' ? 'bg-primary/10 text-primary' : 'bg-purple-500/10 text-purple-500'}`}>
                        {movie.posterPath ? (
                          <img src={`https://image.tmdb.org/t/p/w92${movie.posterPath}`} className="w-full h-full object-cover" alt="" />
                        ) : (
                          movie.type === 'movie' ? <Film className="w-6 h-6" /> : <Tv className="w-6 h-6" />
                        )}
                      </div>
                      <div className="flex flex-col">
                        <span className="font-black text-foreground text-sm uppercase tracking-tight group-hover:text-primary transition-colors flex items-center gap-2">
                          {movie.title}
                          {movie.type === 'series' && movie.status === 'ongoing' && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-green-500/15 text-green-400 text-[9px] font-black uppercase tracking-widest border border-green-500/25">
                              <Radio className="w-2.5 h-2.5" /> Ongoing
                            </span>
                          )}
                        </span>
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1.5 mt-1 font-bold">
                          {movie.releaseDate?.split('-')[0] || 'N/A'} <span className="w-1 h-1 rounded-full bg-border" /> {movie.views} views
                        </span>
                      </div>
                    </div>
                    <div className="col-span-2 text-center">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${movie.type === 'movie' ? 'bg-primary/10 text-primary' : 'bg-purple-500/10 text-purple-500'}`}>
                        {movie.type}
                      </span>
                    </div>
                    <div className="col-span-2 text-center">
                      <div className="text-xs font-black text-muted-foreground bg-white/5 py-1 px-2 rounded-lg inline-block border border-white/5">{movie.quality}</div>
                    </div>
                    <div className="col-span-3 flex justify-end gap-2" onClick={e => e.stopPropagation()}>
                      {movie.type === 'series' && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={`h-9 w-9 transition-colors ${movie.status === 'ongoing' ? 'text-green-400 hover:text-green-300 hover:bg-green-500/10' : 'text-muted-foreground hover:text-green-400 hover:bg-green-500/10'}`}
                            title={movie.status === 'ongoing' ? 'Mark as Completed' : 'Mark as Ongoing'}
                            onClick={() => handleToggleStatus(movie)}
                            disabled={togglingStatusId === movie.id}
                            data-testid={`button-status-${movie.id}`}
                          >
                            {togglingStatusId === movie.id
                              ? <Loader2 className="w-4 h-4 animate-spin" />
                              : movie.status === 'ongoing'
                              ? <Radio className="w-4 h-4" />
                              : <CheckCircle2 className="w-4 h-4" />
                            }
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-9 w-9 text-muted-foreground hover:bg-white/5"
                            onClick={() => setExpandedRow(expandedRow === movie.id ? null : movie.id)}
                          >
                            <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${expandedRow === movie.id ? 'rotate-180' : ''}`} />
                          </Button>
                        </>
                      )}
                      {/* Post to Telegram Channel */}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-muted-foreground hover:text-blue-400 hover:bg-blue-400/10"
                        title="Post to Telegram channel"
                        onClick={() => handlePostToChannel(movie)}
                        disabled={postingChannelId === movie.id}
                        data-testid={`button-post-channel-${movie.id}`}
                      >
                        {postingChannelId === movie.id
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <Send className="w-4 h-4" />
                        }
                      </Button>
                      {/* Notify all users */}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-muted-foreground hover:text-yellow-400 hover:bg-yellow-400/10"
                        title="Notify all users about this"
                        onClick={() => handleNotifyMovie(movie)}
                        disabled={notifyingMovieId === movie.id}
                        data-testid={`button-notify-${movie.id}`}
                      >
                        {notifyingMovieId === movie.id
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <BellRing className="w-4 h-4" />
                        }
                      </Button>
                      {movie.tmdbId && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
                          title="Update genre & cast from TMDB"
                          onClick={() => refreshFromTmdb(movie.id)}
                          disabled={refreshingId === movie.id}
                        >
                          <RefreshCw className={`w-4 h-4 ${refreshingId === movie.id ? 'animate-spin' : ''}`} />
                        </Button>
                      )}
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-9 w-9 text-muted-foreground hover:text-primary hover:bg-primary/10"
                        onClick={() => handleEdit(movie)}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => { if(confirm("Permanently delete this?")) deleteMovie(movie.id); }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  {expandedRow === movie.id && movie.type === 'series' && (
                    <div className="px-12 pb-8 bg-secondary/10 border-t border-border/20 animate-in slide-in-from-top duration-300">
                      <EpisodeManager movieId={movie.id} tmdbId={movie.tmdbId} />
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-6 px-2">
            <p className="text-xs text-muted-foreground font-medium">
              Showing {((page - 1) * PER_PAGE) + 1}–{Math.min(page * PER_PAGE, data?.total || 0)} of <span className="font-black text-foreground">{data?.total || 0}</span> titles
            </p>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-9 px-3 text-xs font-bold"
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
              >
                ← Prev
              </Button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                .reduce<(number | string)[]>((acc, p, idx, arr) => {
                  if (idx > 0 && typeof arr[idx - 1] === 'number' && (p as number) - (arr[idx - 1] as number) > 1) {
                    acc.push('...');
                  }
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, idx) =>
                  p === '...' ? (
                    <span key={`dots-${idx}`} className="px-2 text-muted-foreground text-xs">…</span>
                  ) : (
                    <Button
                      key={p}
                      variant={page === p ? "default" : "outline"}
                      size="sm"
                      className={`h-9 w-9 text-xs font-black p-0 ${page === p ? 'bg-primary text-white shadow-lg shadow-primary/30' : ''}`}
                      onClick={() => setPage(p as number)}
                    >
                      {p}
                    </Button>
                  )
                )}
              <Button
                variant="outline"
                size="sm"
                className="h-9 px-3 text-xs font-bold"
                disabled={page === totalPages}
                onClick={() => setPage(p => p + 1)}
              >
                Next →
              </Button>
            </div>
          </div>
        )}

        {totalPages === 1 && data && (
          <p className="text-xs text-muted-foreground mt-4 px-2">
            Showing all <span className="font-black text-foreground">{data.total}</span> titles
          </p>
        )}
      </main>
    </div>
  );
}
