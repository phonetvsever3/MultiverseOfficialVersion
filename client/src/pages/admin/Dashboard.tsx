import { useState } from "react";
import { Link } from "wouter";
import { AdminSidebar } from "@/components/AdminSidebar";
import { StatsCard } from "@/components/StatsCard";
import { useDashboardStats } from "@/hooks/use-stats";
import { Users, Film, Eye, MonitorPlay, BarChart2, Link2, AlertTriangle, ChevronRight } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { useQuery } from "@tanstack/react-query";

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

interface SeriesGap { id: number; title: string; totalMissing: number; }

export default function AdminDashboard() {
  const { data: stats, isLoading } = useDashboardStats();
  const [period, setPeriod] = useState<"7d" | "30d">("7d");
  const [alarmDismissed, setAlarmDismissed] = useState(false);

  const { data: episodeGaps = [] } = useQuery<SeriesGap[]>({
    queryKey: ["/api/admin/episode-gaps"],
    queryFn: async () => {
      const res = await fetch("/api/admin/episode-gaps");
      return res.json();
    },
    staleTime: 1000 * 60 * 5,
  });

  const totalMissing = episodeGaps.reduce((sum, s) => sum + s.totalMissing, 0);
  const affectedSeries = episodeGaps.length;

  const { data: rawViewStats = [] } = useQuery<ViewStat[]>({
    queryKey: ["/api/admin/view-stats", period],
    queryFn: async () => {
      const res = await fetch(`/api/admin/view-stats?period=${period}`);
      return res.json();
    },
    staleTime: 1000 * 60 * 5,
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

        {/* Missing Episode Alarm Banner */}
        {totalMissing > 0 && !alarmDismissed && (
          <div className="mb-6 flex items-center gap-4 bg-red-500/10 border border-red-500/30 rounded-2xl px-5 py-4" data-testid="banner-missing-episodes">
            <div className="flex-shrink-0 p-2 bg-red-500/20 rounded-xl">
              <AlertTriangle className="w-5 h-5 text-red-400 animate-pulse" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-red-400 uppercase tracking-wide">Missing Episodes Detected</p>
              <p className="text-xs text-red-300/80 mt-0.5">
                <span className="font-bold text-red-300">{totalMissing}</span> missing episode{totalMissing !== 1 ? "s" : ""} across{" "}
                <span className="font-bold text-red-300">{affectedSeries}</span> series — files not yet synced
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Link href="/admin/episode-checker">
                <span className="flex items-center gap-1 text-xs font-bold text-red-300 hover:text-red-200 transition-colors cursor-pointer whitespace-nowrap">
                  View All <ChevronRight className="w-3.5 h-3.5" />
                </span>
              </Link>
              <button
                onClick={() => setAlarmDismissed(true)}
                className="text-xs text-red-400/50 hover:text-red-400 transition-colors ml-2 font-bold"
                title="Dismiss for this session"
              >
                ✕
              </button>
            </div>
          </div>
        )}

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

        {/* Quick Links */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link href="/admin/users">
            <div className="bg-card border border-border rounded-2xl p-6 hover:border-primary/40 hover:bg-white/[0.02] transition-all cursor-pointer group">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-500/10 rounded-xl text-blue-500 group-hover:bg-blue-500/20 transition-colors">
                  <Users className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <h3 className="text-base font-bold text-foreground">Users</h3>
                  <p className="text-sm text-muted-foreground">{stats?.totalUsers ?? 0} registered via Telegram bot</p>
                </div>
                <span className="text-muted-foreground text-sm">View all →</span>
              </div>
            </div>
          </Link>

          <Link href="/admin/app-urls">
            <div className="bg-card border border-border rounded-2xl p-6 hover:border-primary/40 hover:bg-white/[0.02] transition-all cursor-pointer group">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-primary/10 rounded-xl text-primary group-hover:bg-primary/20 transition-colors">
                  <Link2 className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <h3 className="text-base font-bold text-foreground">URL Manager</h3>
                  <p className="text-sm text-muted-foreground">Manage bot open app URLs &amp; rotation</p>
                </div>
                <span className="text-muted-foreground text-sm">Manage →</span>
              </div>
            </div>
          </Link>

        </div>
      </main>
    </div>
  );
}
