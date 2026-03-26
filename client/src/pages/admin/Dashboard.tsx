import { useState } from "react";
import { AdminSidebar } from "@/components/AdminSidebar";
import { StatsCard } from "@/components/StatsCard";
import { useDashboardStats } from "@/hooks/use-stats";
import { useQuery } from "@tanstack/react-query";
import { type User } from "@shared/schema";
import { Users, Film, Eye, MonitorPlay, Calendar, BarChart2, Clock } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface ViewStat { date: string; count: number }

function formatDate(dateStr: string, period: "7d" | "30d") {
  const d = new Date(dateStr);
  if (period === "7d") return d.toLocaleDateString("en", { weekday: "short" });
  return d.toLocaleDateString("en", { month: "short", day: "numeric" });
}

function fillGaps(data: ViewStat[], days: number): ViewStat[] {
  const map = new Map(data.map(d => [d.date, d.count]));
  const result: ViewStat[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    result.push({ date: key, count: map.get(key) ?? 0 });
  }
  return result;
}

export default function AdminDashboard() {
  const { data: stats, isLoading } = useDashboardStats();
  const [period, setPeriod] = useState<"7d" | "30d">("7d");

  const { data: rawViewStats = [] } = useQuery<ViewStat[]>({
    queryKey: ["/api/admin/view-stats", period],
    queryFn: async () => {
      const res = await fetch(`/api/admin/view-stats?period=${period}`);
      return res.json();
    },
    staleTime: 1000 * 60 * 5,
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
    queryFn: async () => {
      const res = await fetch("/api/admin/users");
      return res.json();
    },
    staleTime: 1000 * 60 * 2,
  });

  const chartData = fillGaps(rawViewStats, period === "7d" ? 7 : 30);
  const maxIndex = chartData.reduce((best, cur, i) => cur.count > chartData[best].count ? i : best, 0);

  const totalViewsChart = chartData.reduce((sum, d) => sum + d.count, 0);
  const monthlyViews = period === "30d" ? totalViewsChart : null;

  if (isLoading) {
    return <div className="flex h-screen items-center justify-center bg-background text-primary">Loading dashboard...</div>;
  }

  return (
    <div className="min-h-screen bg-background flex">
      <AdminSidebar />
      <main className="flex-1 md:ml-64 p-6 md:p-8 overflow-y-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold font-display text-foreground">Overview</h1>
          <p className="text-muted-foreground">Welcome back, Admin. Here's what's happening.</p>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatsCard
            title="Total Users"
            value={stats?.totalUsers || 0}
            icon={<Users className="w-5 h-5" />}
          />
          <StatsCard
            title="Movies & Series"
            value={(stats?.totalMovies || 0) + (stats?.totalSeries || 0)}
            icon={<Film className="w-5 h-5" />}
          />
          <StatsCard
            title="Total Views"
            value={stats?.totalViews?.toLocaleString() || 0}
            icon={<Eye className="w-5 h-5" />}
          />
          <StatsCard
            title="Active Ads"
            value={stats?.activeAds || 0}
            icon={<MonitorPlay className="w-5 h-5" />}
          />
        </div>

        {/* Daily/Monthly views chart */}
        <div className="bg-card border border-border rounded-2xl p-6 mb-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg text-primary">
                <BarChart2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold">Views Activity</h3>
                <p className="text-xs text-muted-foreground">
                  {period === "7d" ? "Daily" : "Monthly"} — {totalViewsChart.toLocaleString()} total in period
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPeriod("7d")}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${period === "7d" ? "bg-primary text-white" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
              >
                7 Days
              </button>
              <button
                onClick={() => setPeriod("30d")}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${period === "30d" ? "bg-primary text-white" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
              >
                30 Days
              </button>
            </div>
          </div>
          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ left: -20 }}>
                <XAxis
                  dataKey="date"
                  stroke="#525252"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => formatDate(v, period)}
                  interval={period === "30d" ? 4 : 0}
                />
                <YAxis
                  stroke="#525252"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.05)" }}
                  contentStyle={{ backgroundColor: "#09090b", borderColor: "#27272a", color: "#fff", fontSize: 12, borderRadius: 8 }}
                  labelFormatter={(v) => new Date(v).toLocaleDateString("en", { weekday: "long", month: "short", day: "numeric" })}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} name="Views">
                  {chartData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={index === maxIndex ? "hsl(var(--primary))" : "#27272a"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Users Table */}
        <div className="bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold">Users</h3>
              <p className="text-xs text-muted-foreground">{users.length} registered via Telegram bot</p>
            </div>
          </div>

          {users.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">No users have started the bot yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground text-xs uppercase tracking-wider">
                    <th className="text-left pb-3 pr-4 font-semibold">User</th>
                    <th className="text-left pb-3 pr-4 font-semibold">Telegram ID</th>
                    <th className="text-left pb-3 pr-4 font-semibold">
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> Joined</span>
                    </th>
                    <th className="text-left pb-3 font-semibold">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Last Active</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {users.map((user) => (
                    <tr key={user.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3 pr-4">
                        <div>
                          <p className="font-semibold text-foreground">
                            {user.firstName || "—"}
                            {user.isAdmin && (
                              <span className="ml-2 text-[9px] bg-primary/15 text-primary rounded-full px-1.5 py-0.5 font-black uppercase">Admin</span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">{user.username ? `@${user.username}` : "No username"}</p>
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <span className="font-mono text-xs text-muted-foreground">{user.telegramId}</span>
                      </td>
                      <td className="py-3 pr-4">
                        <span className="text-xs text-muted-foreground">
                          {user.joinedAt ? new Date(user.joinedAt).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                        </span>
                      </td>
                      <td className="py-3">
                        <span className="text-xs text-muted-foreground">
                          {user.lastActive ? new Date(user.lastActive).toLocaleDateString("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
