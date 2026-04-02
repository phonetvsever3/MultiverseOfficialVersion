import { useState, useEffect, useRef } from "react";
import { AdminSidebar } from "@/components/AdminSidebar";
import { useChannels, useCreateChannel, useDeleteChannel } from "@/hooks/use-channels";
import { Plus, Trash2, Tv, Signal, History, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertChannelSchema, type Channel } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface ScanStatus {
  status: "running" | "done" | "error";
  added: number;
  skipped: number;
  failed: number;
  total: number;
  currentId: number;
  maxId: number;
  errors: string[];
  message?: string;
  hint?: string;
  botUsername?: string;
}

function useScanHistory(channelId: number) {
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<ScanStatus | null>(null);
  const [maxId, setMaxId] = useState<string>("5000");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { toast } = useToast();

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  const pollProgress = (id: number) => {
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/channels/${id}/scan-progress`);
        const data: ScanStatus | null = await res.json();
        if (!data) return;
        setProgress(data);
        if (data.status === "done" || data.status === "error") {
          stopPolling();
          setScanning(false);
          if (data.status === "done") {
            toast({ title: "Scan complete", description: data.message || `Added ${data.added} files.` });
          } else {
            toast({ title: "Scan failed", description: data.message || "An error occurred.", variant: "destructive" });
          }
        }
      } catch {}
    }, 1500);
  };

  const startScan = async () => {
    setScanning(true);
    setProgress(null);
    const parsedMax = parseInt(maxId) || 5000;
    try {
      const data: any = await apiRequest(
        "POST",
        `/api/channels/${channelId}/scan-history?maxMsgId=${parsedMax}`
      ).then(r => r.json());
      if (data.status === "already_running") {
        setProgress(data);
        pollProgress(channelId);
        return;
      }
      if (data.status === "started") {
        toast({ title: "Scan started", description: `Scanning message IDs 1 → ${parsedMax}…` });
        pollProgress(channelId);
      } else {
        setScanning(false);
        toast({ title: "Could not start scan", description: data.message || "Unknown error", variant: "destructive" });
      }
    } catch (err: any) {
      setScanning(false);
      toast({ title: "Error", description: err.message || "Failed to start scan.", variant: "destructive" });
    }
  };

  useEffect(() => () => stopPolling(), []);

  return { scanning, progress, startScan, maxId, setMaxId };
}

function ChannelCard({ channel, onDelete }: { channel: Channel; onDelete: (id: number) => void }) {
  const { scanning, progress, startScan, maxId, setMaxId } = useScanHistory(channel.id);
  const isSource = channel.role === "source";

  const scanPct = progress?.maxId && progress.maxId > 0
    ? Math.min(100, Math.round((progress.currentId / progress.maxId) * 100))
    : 0;

  return (
    <div className="bg-card border border-border rounded-xl p-6 hover:border-primary/50 transition-colors group">
      <div className="flex justify-between items-start mb-4">
        <div className={cn(
          "p-3 rounded-xl",
          isSource ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground"
        )}>
          <Tv className="w-6 h-6" />
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={cn(
            "px-2 py-1 rounded-full text-xs font-bold uppercase",
            isSource ? "bg-primary text-white" : "bg-muted text-muted-foreground"
          )}>
            {channel.role}
          </span>
          {channel.isActive && (
            <span className="flex items-center gap-1 text-[10px] text-green-500 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              Active
            </span>
          )}
        </div>
      </div>

      <h3 className="text-lg font-bold font-display">{channel.name || "Untitled Channel"}</h3>
      <p className="text-sm text-muted-foreground font-mono mt-1">{channel.telegramId}</p>

      {/* Scan progress for source channels */}
      {isSource && progress && (
        <div className="mt-3 p-3 rounded-lg bg-muted/50 text-xs space-y-2">
          <div className="flex items-center gap-2">
            {progress.status === "running" && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary flex-shrink-0" />}
            {progress.status === "done" && <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />}
            {progress.status === "error" && <AlertCircle className="w-3.5 h-3.5 text-destructive flex-shrink-0" />}
            <span className="font-medium text-foreground">
              {progress.status === "running"
                ? `Scanning ID ${progress.currentId.toLocaleString()} / ${progress.maxId.toLocaleString()}`
                : progress.status === "done" ? "Done" : "Error"}
            </span>
          </div>
          {/* Progress bar */}
          {progress.status === "running" && progress.maxId > 0 && (
            <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-500 rounded-full"
                style={{ width: `${scanPct}%` }}
              />
            </div>
          )}
          <div className="flex flex-wrap gap-3 text-muted-foreground">
            <span data-testid={`scan-added-${channel.id}`}>
              Added: <strong className="text-green-500">{progress.added}</strong>
            </span>
            <span data-testid={`scan-skipped-${channel.id}`}>
              Skip: <strong>{progress.skipped}</strong>
            </span>
            <span data-testid={`scan-failed-${channel.id}`}>
              Fail: <strong className={progress.failed > 0 ? "text-destructive" : ""}>{progress.failed}</strong>
            </span>
          </div>
          {/* "Add bot as admin" fix-it banner */}
          {progress.status === "error" && progress.hint === "add_bot_as_admin" && (
            <div className="mt-1 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 space-y-1">
              <p className="font-semibold text-xs flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                Action required: give the bot access
              </p>
              <p className="text-xs leading-snug">
                Add <strong>{progress.botUsername || "the bot"}</strong> as an <strong>admin</strong> to this Telegram channel, then click <strong>Scan History</strong> again.
              </p>
              <p className="text-[10px] text-amber-500/70">
                In Telegram: Channel Info → Administrators → Add Administrator → search {progress.botUsername || "bot"}
              </p>
            </div>
          )}
          {/* General message (shown when no special hint, or for non-error states) */}
          {progress.message && progress.hint !== "add_bot_as_admin" && (
            <p className="text-muted-foreground/80 break-words">{progress.message}</p>
          )}
          {progress.errors.length > 0 && (
            <details className="mt-1">
              <summary className="cursor-pointer text-destructive">
                {progress.errors.length} error(s)
              </summary>
              <ul className="mt-1 space-y-0.5 max-h-20 overflow-y-auto">
                {progress.errors.map((e, i) => (
                  <li key={i} className="text-destructive/80 break-words">{e}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      <div className="mt-6 pt-6 border-t border-border flex justify-between items-center">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Signal className="w-3 h-3 text-green-500" /> Connected
        </div>
        <div className="flex items-center gap-2">
          {isSource && (
            <>
              {/* Max message ID input */}
              <input
                type="number"
                value={maxId}
                onChange={e => setMaxId(e.target.value)}
                disabled={scanning}
                min={1}
                placeholder="Max ID"
                title="Highest message ID to scan (set to your channel's last message ID)"
                className="w-20 h-8 px-2 text-xs rounded-md border border-border bg-background text-foreground disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-primary"
                data-testid={`input-scan-max-id-${channel.id}`}
              />
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs border-primary/30 text-primary hover:bg-primary/10 hover:text-primary"
                onClick={startScan}
                disabled={scanning}
                data-testid={`btn-scan-history-${channel.id}`}
              >
                {scanning
                  ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Scanning…</>
                  : <><History className="w-3 h-3 mr-1" /> Scan History</>
                }
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => onDelete(channel.id)}
            data-testid={`btn-delete-channel-${channel.id}`}
          >
            <Trash2 className="w-3.5 h-3.5 mr-1" /> Remove
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function AdminChannels() {
  const { data: channels, isLoading } = useChannels();
  const { mutate: deleteChannel } = useDeleteChannel();
  const { mutate: createChannel, isPending } = useCreateChannel();
  const [open, setOpen] = useState(false);

  const form = useForm<Omit<Channel, "id" | "isActive">>({
    resolver: zodResolver(insertChannelSchema),
    defaultValues: {
      role: "backup",
      telegramId: "",
      name: "",
      username: "",
    }
  });

  const onSubmit = (data: Omit<Channel, "id" | "isActive">) => {
    createChannel(data, {
      onSuccess: () => {
        setOpen(false);
        form.reset();
      }
    });
  };

  return (
    <div className="min-h-screen bg-background flex">
      <AdminSidebar />
      <main className="flex-1 md:ml-64 p-8 overflow-y-auto">
        <header className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold font-display text-foreground">Channel Manager</h1>
            <p className="text-muted-foreground">Manage distribution channels for content.</p>
          </div>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/25" data-testid="btn-add-channel">
                <Plus className="w-4 h-4 mr-2" /> Add Channel
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle>Add Telegram Channel</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Channel Name</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Main Movie Channel" data-testid="input-channel-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="telegramId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Telegram ID</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="-100..." data-testid="input-channel-telegram-id" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Username (optional)</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="@channelname" data-testid="input-channel-username" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="role"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Role</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value || "backup"}>
                          <FormControl>
                            <SelectTrigger data-testid="select-channel-role">
                              <SelectValue placeholder="Select role" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="source">Source (Upload)</SelectItem>
                            <SelectItem value="backup">Backup (Forward)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full" disabled={isPending} data-testid="btn-submit-add-channel">
                    {isPending ? "Adding..." : "Add Channel"}
                  </Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {isLoading ? (
            <div className="text-muted-foreground">Loading channels...</div>
          ) : (
            channels?.map((channel) => (
              <ChannelCard
                key={channel.id}
                channel={channel}
                onDelete={(id) => deleteChannel(id)}
              />
            ))
          )}
        </div>
      </main>
    </div>
  );
}
