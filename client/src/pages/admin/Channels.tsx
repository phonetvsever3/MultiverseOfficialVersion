import { useState } from "react";
import { AdminSidebar } from "@/components/AdminSidebar";
import { useChannels, useCreateChannel, useDeleteChannel } from "@/hooks/use-channels";
import { Plus, Trash2, Tv, Signal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertChannelSchema, type Channel } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

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
              <Button className="bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/25">
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
                          <Input {...field} placeholder="Main Movie Channel" />
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
                          <Input {...field} placeholder="-100..." />
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
                            <SelectTrigger>
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
                  <Button type="submit" className="w-full" disabled={isPending}>
                    {isPending ? "Adding..." : "Add Channel"}
                  </Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {isLoading ? (
            <div>Loading channels...</div>
          ) : (
            channels?.map((channel) => (
              <div key={channel.id} className="bg-card border border-border rounded-xl p-6 hover:border-primary/50 transition-colors group">
                <div className="flex justify-between items-start mb-4">
                  <div className={cn(
                    "p-3 rounded-xl",
                    channel.role === 'source' ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground"
                  )}>
                    <Tv className="w-6 h-6" />
                  </div>
                  <div className="flex flex-col items-end gap-2">
                     <span className={cn(
                       "px-2 py-1 rounded-full text-xs font-bold uppercase",
                       channel.role === 'source' ? "bg-primary text-white" : "bg-muted text-muted-foreground"
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
                
                <div className="mt-6 pt-6 border-t border-border flex justify-between items-center">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Signal className="w-3 h-3 text-green-500" /> Connected
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => deleteChannel(channel.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1" /> Remove
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
