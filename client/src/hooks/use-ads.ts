import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type InsertAd } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

// GET /api/ads
export function useAds() {
  return useQuery({
    queryKey: [api.ads.list.path],
    queryFn: async () => {
      const res = await fetch(api.ads.list.path);
      if (!res.ok) throw new Error("Failed to fetch ads");
      return api.ads.list.responses[200].parse(await res.json());
    },
  });
}

// POST /api/ads
export function useCreateAd() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertAd) => {
      const res = await fetch(api.ads.create.path, {
        method: api.ads.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create ad");
      return api.ads.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.ads.list.path] });
      toast({ title: "Success", description: "Ad campaign created" });
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

// GET /api/ads/serve (Random ad for user)
export function useServeAd() {
  return useQuery({
    queryKey: [api.ads.serve.path],
    queryFn: async () => {
      const res = await fetch(api.ads.serve.path);
      if (!res.ok) throw new Error("Failed to serve ad");
      return api.ads.serve.responses[200].parse(await res.json());
    },
    refetchOnWindowFocus: false, // Don't refresh ad on tab switch
  });
}

// POST /api/ads/:id/impression
export function useRecordImpression() {
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.ads.impression.path, { id });
      await fetch(url, { method: api.ads.impression.method });
    },
  });
}
