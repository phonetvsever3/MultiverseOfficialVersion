import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type InsertMovie } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

// GET /api/movies
export function useMovies(filters?: { search?: string; type?: 'movie' | 'series'; page?: number; limit?: number; status?: string; missingEpisodes?: boolean }) {
  return useQuery({
    queryKey: [api.movies.list.path, filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.search) params.append("search", filters.search);
      if (filters?.type) params.append("type", filters.type);
      if (filters?.page) params.append("page", filters.page.toString());
      if (filters?.limit) params.append("limit", filters.limit.toString());
      if (filters?.status) params.append("status", filters.status);
      if (filters?.missingEpisodes) params.append("missingEpisodes", "true");

      const url = `${api.movies.list.path}?${params.toString()}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch movies");
      return api.movies.list.responses[200].parse(await res.json());
    },
  });
}

// GET /api/movies/:id
export function useMovie(id: number) {
  return useQuery({
    queryKey: [api.movies.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.movies.get.path, { id });
      const res = await fetch(url);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch movie details");
      return api.movies.get.responses[200].parse(await res.json());
    },
    enabled: !!id && !isNaN(id),
  });
}

// POST /api/movies (Admin)
export function useCreateMovie() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertMovie) => {
      const res = await fetch(api.movies.create.path, {
        method: api.movies.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        if (res.status === 400) {
          const error = api.movies.create.responses[400].parse(await res.json());
          throw new Error(error.message);
        }
        throw new Error("Failed to create movie");
      }
      return api.movies.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.movies.list.path] });
      toast({ title: "Success", description: "Movie added to library" });
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

// PATCH /api/movies/:id (Admin)
export function useUpdateMovie() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Partial<InsertMovie> }) => {
      const res = await fetch(buildUrl(api.movies.update.path, { id }), {
        method: api.movies.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      if (!res.ok) {
        throw new Error("Failed to update movie");
      }
      return api.movies.update.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.movies.list.path] });
      toast({ title: "Success", description: "Movie details updated" });
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

// DELETE /api/movies/:id
export function useDeleteMovie() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.movies.delete.path, { id });
      const res = await fetch(url, { method: api.movies.delete.method });
      if (!res.ok && res.status !== 404) throw new Error("Failed to delete movie");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.movies.list.path] });
      toast({ title: "Deleted", description: "Movie removed from library" });
    },
  });
}
