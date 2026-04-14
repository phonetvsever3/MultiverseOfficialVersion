import { useState, useEffect, useRef } from "react";
import { AdminSidebar } from "@/components/AdminSidebar";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Cpu, MemoryStick, Activity, Clock, Server, Zap, TrendingUp, Gauge,
  RefreshCw, Wifi, Trash2, CheckCircle2
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  AreaChart, Area, CartesianGrid
} from "recharts";

interface ServerStats {
  cpu: number;
  cpuCores: number;
  ramUsed: number;
  ramTotal: number;
  ramPercent: number;
  heapUsed: number;
  heapTotal: number;
  heapSizeLimit: number;
  rss: number;
  uptime: number;
  processUptime: number;
  platform: string;
  hostname: string;
  loadAvg: number[];
  reqPerMin: number;
  totalRequests: number;
  avgLatency: number;
  p95Latency: number;
}

interface HistoryPoint {
  time: string;
  cpu: number;
  ram: number;
  latency: number;
  reqPerMin: number;
}

function formatUptime(seconds: number) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function GaugeArc({ percent, color, size = 120 }: { percent: number; color: string; size?: number }) {
  const r = (size / 2) * 0.75;
  const cx = size / 2;
  const cy = size / 2;
  const startAngle = -220;
  const endAngle = 40;
  const totalDeg = endAngle - startAngle;
  const usedDeg = (percent / 100) * totalDeg;

  function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  function describeArc(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
    const s = polarToCartesian(cx, cy, r, startDeg);
    const e = polarToCartesian(cx, cy, r, endDeg);
    const large = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
  }

  const trackPath = describeArc(cx, cy, r, startAngle, endAngle);
  const fillPath = describeArc(cx, cy, r, startAngle, startAngle + usedDeg);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <path d={trackPath} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" strokeLinecap="round" />
      <path d={fillPath} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
    </svg>
  );
}

function StatGauge({
  label, value, percent, unit, color, icon, sub
}: {
  label: string;
  value: string;
  percent: number;
  unit?: string;
  color: string;
  icon: React.ReactNode;
  sub?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-5 flex flex-col items-center gap-1" data-testid={`gauge-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="flex items-center gap-2 text-muted-foreground text-xs font-bold uppercase tracking-wider mb-1 self-start w-full">
        {icon}
        {label}
      </div>
      <div className="relative flex items-center justify-center">
        <GaugeArc percent={percent} color={color} size={130} />
        <div className="absolute flex flex-col items-center">
          <span className="text-2xl font-black text-foreground leading-none">{value}</span>
          {unit && <span className="text-[10px] text-muted-foreground mt-0.5">{unit}</span>}
        </div>
      </div>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      <div className="w-full bg-white/5 rounded-full h-1.5 mt-2">
        <div
          className="h-1.5 rounded-full transition-all duration-500"
          style={{ width: `${percent}%`, background: color }}
        />
      </div>
      <span className="text-xs text-muted-foreground">{percent}%</span>
    </div>
  );
}

function StatCard({
  label, value, unit, icon, color, sub
}: {
  label: string;
  value: string | number;
  unit?: string;
  icon: React.ReactNode;
  color: string;
  sub?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-5" data-testid={`stat-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2 rounded-lg" style={{ background: `${color}20` }}>
          <span style={{ color }}>{icon}</span>
        </div>
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <p className="text-2xl font-black text-foreground">
        {value}<span className="text-sm font-normal text-muted-foreground ml-1">{unit}</span>
      </p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

const POLL_INTERVAL = 3000;
const MAX_HISTORY = 40;

interface CleanupResult {
  success: boolean;
  cacheCleared: number;
  tempFilesDeleted: number;
  tempBytesFreed: number;
  heapBefore: number;
  heapAfter: number;
  freedMB: number;
  gcRan: boolean;
}

export default function ServerStatsPage() {
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [cleanupResult, setCleanupResult] = useState<CleanupResult | null>(null);
  const tickRef = useRef(0);

  const { data: stats, isLoading } = useQuery<ServerStats>({
    queryKey: ["/api/admin/server-stats"],
    queryFn: async () => {
      const res = await fetch("/api/admin/server-stats", { credentials: "include" });
      return res.json();
    },
    refetchInterval: POLL_INTERVAL,
    staleTime: 0,
  });

  useEffect(() => {
    if (!stats) return;
    setLastUpdated(new Date());
    tickRef.current++;
    const now = new Date().toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
    setHistory(prev => {
      const next = [...prev, {
        time: now,
        cpu: stats.cpu,
        ram: stats.ramPercent,
        latency: stats.avgLatency,
        reqPerMin: stats.reqPerMin,
      }];
      return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
    });
  }, [stats]);

  const cleanupMutation = useMutation<CleanupResult>({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/cleanup");
      return res.json();
    },
    onSuccess: (data) => {
      setCleanupResult(data);
      setTimeout(() => setCleanupResult(null), 8000);
    },
  });

  const cpuColor = (stats?.cpu ?? 0) > 80 ? "#ef4444" : (stats?.cpu ?? 0) > 50 ? "#f97316" : "#22c55e";
  const ramColor = (stats?.ramPercent ?? 0) > 80 ? "#ef4444" : (stats?.ramPercent ?? 0) > 60 ? "#f97316" : "#3b82f6";

  return (
    <div className="min-h-screen bg-background flex">
      <AdminSidebar />
      <main className="flex-1 md:ml-64 p-6 md:p-8 overflow-y-auto">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Server Monitor</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Live system metrics — refreshes every {POLL_INTERVAL / 1000}s
            </p>
          </div>
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-xs text-muted-foreground">
                Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            <button
              data-testid="button-cleanup"
              onClick={() => cleanupMutation.mutate()}
              disabled={cleanupMutation.isPending}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all
                bg-orange-500/10 border-orange-500/30 text-orange-400 hover:bg-orange-500/20 hover:border-orange-500/50
                disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {cleanupMutation.isPending ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
              {cleanupMutation.isPending ? "Cleaning…" : "Clean RAM"}
            </button>
            <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 px-3 py-1.5 rounded-full">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse inline-block" />
              <span className="text-xs font-bold text-green-400">LIVE</span>
            </div>
          </div>
        </header>

        {/* Cleanup result banner */}
        {cleanupResult && (
          <div className="mb-5 flex items-start gap-3 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3 text-sm">
            <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-muted-foreground">
              <span><span className="text-green-400 font-semibold">{cleanupResult.cacheCleared}</span> cache entries cleared</span>
              {cleanupResult.tempFilesDeleted > 0 && (
                <span><span className="text-green-400 font-semibold">{cleanupResult.tempFilesDeleted}</span> temp files deleted ({cleanupResult.tempBytesFreed} KB)</span>
              )}
              <span>Heap: <span className="text-orange-400 font-semibold">{cleanupResult.heapBefore} MB</span> → <span className="text-green-400 font-semibold">{cleanupResult.heapAfter} MB</span>
                {cleanupResult.freedMB > 0 && <span className="text-green-400"> (freed {cleanupResult.freedMB} MB)</span>}
              </span>
              {cleanupResult.gcRan && <span className="text-purple-400">GC ran ✓</span>}
            </div>
          </div>
        )}

        {isLoading && !stats ? (
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" />
            Loading server stats...
          </div>
        ) : (
          <>
            {/* Server info strip */}
            {stats && (
              <div className="bg-card border border-border rounded-2xl px-5 py-3 mb-6 flex flex-wrap gap-6 text-xs text-muted-foreground items-center">
                <div className="flex items-center gap-2">
                  <Server className="w-4 h-4 text-primary" />
                  <span className="font-bold text-foreground">{stats.hostname}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">Platform:</span>
                  <span className="text-foreground capitalize">{stats.platform}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Cpu className="w-3.5 h-3.5" />
                  <span>{stats.cpuCores} CPU cores</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">Load avg:</span>
                  <span className="text-foreground">{stats.loadAvg.join(" / ")}</span>
                </div>
                <div className="flex items-center gap-2 ml-auto">
                  <span className="font-semibold">System up:</span>
                  <span className="text-foreground font-bold">{formatUptime(stats.uptime)}</span>
                </div>
              </div>
            )}

            {/* Gauges row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <StatGauge
                label="CPU Usage"
                value={`${stats?.cpu ?? 0}%`}
                percent={stats?.cpu ?? 0}
                color={cpuColor}
                icon={<Cpu className="w-4 h-4" />}
                sub={`${stats?.cpuCores ?? 0} cores`}
              />
              <StatGauge
                label="RAM Usage"
                value={`${stats?.ramUsed ?? 0}`}
                unit={`/ ${stats?.ramTotal ?? 0} MB`}
                percent={stats?.ramPercent ?? 0}
                color={ramColor}
                icon={<MemoryStick className="w-4 h-4" />}
                sub={`${stats?.ramPercent ?? 0}% used`}
              />
              <StatGauge
                label="Heap Usage"
                value={`${stats?.heapUsed ?? 0}`}
                unit={`/ ${stats?.heapSizeLimit ?? stats?.heapTotal ?? 0} MB`}
                percent={stats?.heapSizeLimit ? Math.round((stats.heapUsed / stats.heapSizeLimit) * 100) : 0}
                color="#a855f7"
                icon={<Gauge className="w-4 h-4" />}
                sub={`RSS: ${stats?.rss ?? 0} MB`}
              />
              <StatGauge
                label="Avg Latency"
                value={`${stats?.avgLatency ?? 0}`}
                unit="ms"
                percent={Math.min(100, Math.round(((stats?.avgLatency ?? 0) / 500) * 100))}
                color={(stats?.avgLatency ?? 0) > 200 ? "#ef4444" : (stats?.avgLatency ?? 0) > 100 ? "#f97316" : "#22c55e"}
                icon={<Zap className="w-4 h-4" />}
                sub={`p95: ${stats?.p95Latency ?? 0}ms`}
              />
            </div>

            {/* Small stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <StatCard
                label="Requests / min"
                value={stats?.reqPerMin ?? 0}
                unit="rpm"
                icon={<Activity className="w-4 h-4" />}
                color="#3b82f6"
                sub="Last 60 seconds"
              />
              <StatCard
                label="Total Requests"
                value={(stats?.totalRequests ?? 0).toLocaleString()}
                icon={<TrendingUp className="w-4 h-4" />}
                color="#8b5cf6"
                sub="Since server start"
              />
              <StatCard
                label="Process Uptime"
                value={formatUptime(stats?.processUptime ?? 0)}
                icon={<Clock className="w-4 h-4" />}
                color="#22c55e"
                sub="Node.js process"
              />
              <StatCard
                label="p95 Latency"
                value={`${stats?.p95Latency ?? 0}`}
                unit="ms"
                icon={<Wifi className="w-4 h-4" />}
                color="#f97316"
                sub="95th percentile"
              />
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
              {/* CPU Chart */}
              <div className="bg-card border border-border rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-1.5 bg-green-500/10 rounded-lg">
                    <Cpu className="w-4 h-4 text-green-500" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold">CPU Usage</h3>
                    <p className="text-[11px] text-muted-foreground">Live history</p>
                  </div>
                  <span className="ml-auto text-2xl font-black" style={{ color: cpuColor }}>{stats?.cpu ?? 0}%</span>
                </div>
                <div className="h-[180px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={history} margin={{ left: -20, right: 4 }}>
                      <defs>
                        <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#22c55e" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="rgba(255,255,255,0.04)" />
                      <XAxis dataKey="time" stroke="#52525280" fontSize={9} tickLine={false} axisLine={false}
                        interval={Math.floor(history.length / 4)} />
                      <YAxis stroke="#52525280" fontSize={9} tickLine={false} axisLine={false} domain={[0, 100]} unit="%" />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#09090b", borderColor: "#27272a", fontSize: 11, borderRadius: 8 }}
                        formatter={(v: number) => [`${v}%`, "CPU"]}
                      />
                      <Area type="monotone" dataKey="cpu" stroke="#22c55e" strokeWidth={2} fill="url(#cpuGrad)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* RAM Chart */}
              <div className="bg-card border border-border rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-1.5 bg-blue-500/10 rounded-lg">
                    <MemoryStick className="w-4 h-4 text-blue-500" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold">RAM Usage</h3>
                    <p className="text-[11px] text-muted-foreground">Live history</p>
                  </div>
                  <span className="ml-auto text-2xl font-black" style={{ color: ramColor }}>{stats?.ramPercent ?? 0}%</span>
                </div>
                <div className="h-[180px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={history} margin={{ left: -20, right: 4 }}>
                      <defs>
                        <linearGradient id="ramGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="rgba(255,255,255,0.04)" />
                      <XAxis dataKey="time" stroke="#52525280" fontSize={9} tickLine={false} axisLine={false}
                        interval={Math.floor(history.length / 4)} />
                      <YAxis stroke="#52525280" fontSize={9} tickLine={false} axisLine={false} domain={[0, 100]} unit="%" />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#09090b", borderColor: "#27272a", fontSize: 11, borderRadius: 8 }}
                        formatter={(v: number) => [`${v}%`, "RAM"]}
                      />
                      <Area type="monotone" dataKey="ram" stroke="#3b82f6" strokeWidth={2} fill="url(#ramGrad)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Latency Chart */}
              <div className="bg-card border border-border rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-1.5 bg-orange-500/10 rounded-lg">
                    <Zap className="w-4 h-4 text-orange-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold">Avg Response Latency</h3>
                    <p className="text-[11px] text-muted-foreground">Rolling average (ms)</p>
                  </div>
                  <span className="ml-auto text-2xl font-black text-orange-400">{stats?.avgLatency ?? 0}ms</span>
                </div>
                <div className="h-[180px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={history} margin={{ left: -20, right: 4 }}>
                      <CartesianGrid stroke="rgba(255,255,255,0.04)" />
                      <XAxis dataKey="time" stroke="#52525280" fontSize={9} tickLine={false} axisLine={false}
                        interval={Math.floor(history.length / 4)} />
                      <YAxis stroke="#52525280" fontSize={9} tickLine={false} axisLine={false} unit="ms" />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#09090b", borderColor: "#27272a", fontSize: 11, borderRadius: 8 }}
                        formatter={(v: number) => [`${v}ms`, "Latency"]}
                      />
                      <Line type="monotone" dataKey="latency" stroke="#f97316" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Requests/min Chart */}
              <div className="bg-card border border-border rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-1.5 bg-purple-500/10 rounded-lg">
                    <Activity className="w-4 h-4 text-purple-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold">Traffic (Req/min)</h3>
                    <p className="text-[11px] text-muted-foreground">Requests in last 60s</p>
                  </div>
                  <span className="ml-auto text-2xl font-black text-purple-400">{stats?.reqPerMin ?? 0}</span>
                </div>
                <div className="h-[180px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={history} margin={{ left: -20, right: 4 }}>
                      <defs>
                        <linearGradient id="reqGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#a855f7" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="#a855f7" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="rgba(255,255,255,0.04)" />
                      <XAxis dataKey="time" stroke="#52525280" fontSize={9} tickLine={false} axisLine={false}
                        interval={Math.floor(history.length / 4)} />
                      <YAxis stroke="#52525280" fontSize={9} tickLine={false} axisLine={false} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#09090b", borderColor: "#27272a", fontSize: 11, borderRadius: 8 }}
                        formatter={(v: number) => [`${v}`, "Req/min"]}
                      />
                      <Area type="monotone" dataKey="reqPerMin" stroke="#a855f7" strokeWidth={2} fill="url(#reqGrad)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Load Average */}
            {stats && (
              <div className="bg-card border border-border rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-1.5 bg-primary/10 rounded-lg">
                    <TrendingUp className="w-4 h-4 text-primary" />
                  </div>
                  <h3 className="text-sm font-bold">System Load Average</h3>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {["1 min", "5 min", "15 min"].map((label, i) => {
                    const val = stats.loadAvg[i] ?? 0;
                    const pct = Math.min(100, Math.round((val / stats.cpuCores) * 100));
                    const color = pct > 90 ? "#ef4444" : pct > 70 ? "#f97316" : "#22c55e";
                    return (
                      <div key={label} className="text-center" data-testid={`load-avg-${i}`}>
                        <p className="text-xs text-muted-foreground mb-2 font-semibold uppercase tracking-wider">{label}</p>
                        <p className="text-3xl font-black" style={{ color }}>{val}</p>
                        <div className="w-full bg-white/5 rounded-full h-1.5 mt-3">
                          <div className="h-1.5 rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1">{pct}% of capacity</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
