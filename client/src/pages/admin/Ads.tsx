import { useState, useRef } from "react";
import { AdminSidebar } from "@/components/AdminSidebar";
import { useAds, useCreateAd } from "@/hooks/use-ads";
import { Plus, MonitorPlay, MousePointerClick, Code, Eye, Trash2, Maximize2, Upload, ImageIcon, Film, X, Loader2, Calendar, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertAdSchema, type InsertAd } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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
