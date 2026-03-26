import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";

// GET /api/stats/dashboard
export function useDashboardStats() {
  return useQuery({
    queryKey: [api.stats.dashboard.path],
    queryFn: async () => {
      const res = await fetch(api.stats.dashboard.path);
      if (!res.ok) throw new Error("Failed to fetch dashboard stats");
      return api.stats.dashboard.responses[200].parse(await res.json());
    },
    refetchInterval: 30000, // Real-ish time updates
  });
}
