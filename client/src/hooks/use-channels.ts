import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type Channel } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

// GET /api/channels
export function useChannels() {
  return useQuery({
    queryKey: [api.channels.list.path],
    queryFn: async () => {
      const res = await fetch(api.channels.list.path);
      if (!res.ok) throw new Error("Failed to fetch channels");
      return api.channels.list.responses[200].parse(await res.json());
    },
  });
}

// POST /api/channels
export function useCreateChannel() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: Omit<Channel, "id" | "isActive">) => {
      const res = await fetch(api.channels.create.path, {
        method: api.channels.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to add channel");
      return api.channels.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.channels.list.path] });
      toast({ title: "Success", description: "Channel added successfully" });
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

// DELETE /api/channels/:id
export function useDeleteChannel() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.channels.delete.path, { id });
      const res = await fetch(url, { method: api.channels.delete.method });
      if (!res.ok) throw new Error("Failed to delete channel");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.channels.list.path] });
      toast({ title: "Success", description: "Channel removed" });
    },
  });
}
