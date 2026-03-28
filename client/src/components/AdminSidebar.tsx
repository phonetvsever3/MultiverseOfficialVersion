import { Link, useLocation } from "wouter";
import { LayoutDashboard, Film, MonitorPlay, Tv, Settings, BarChart3, Cloud, Sparkles, Trophy, LogOut, Link2, Users, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const navigation = [
  { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  { name: 'URL Manager', href: '/admin/app-urls', icon: Link2 },
  { name: 'Users', href: '/admin/users', icon: Users },
  { name: 'Movies Library', href: '/admin/movies', icon: Film },
  { name: 'Channels', href: '/admin/channels', icon: Tv },
  { name: 'Ad Manager', href: '/admin/ads', icon: MonitorPlay },
  { name: 'Synced Files', href: '/admin/synced-files', icon: BarChart3 },
  { name: 'FileStreamBot', href: '/admin/file-stream-bot', icon: Zap },
  { name: 'Football', href: '/admin/football', icon: Trophy },
  { name: 'Mascot', href: '/admin/mascot', icon: Sparkles },
  { name: 'GitHub Backup', href: '/admin/backup', icon: Cloud },
  { name: 'Settings', href: '/admin/settings', icon: Settings },
];

export function AdminSidebar() {
  const [location, navigate] = useLocation();
  const { toast } = useToast();

  const handleLogout = async () => {
    try {
      await fetch("/api/admin/logout", { method: "POST", credentials: "include" });
      queryClient.clear();
      navigate("/admin/login");
    } catch {
      toast({ title: "Error", description: "Logout failed", variant: "destructive" });
    }
  };

  return (
    <div className="hidden md:flex flex-col w-64 bg-card border-r border-border min-h-screen fixed left-0 top-0 z-50">
      <div className="p-6 border-b border-border/50">
        <h1 style={{ fontFamily: "'Orbitron', sans-serif" }} className="text-xl font-bold tracking-widest text-primary bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60 uppercase">
          MULTIVERSE<span style={{ fontFamily: 'inherit' }} className="text-foreground text-xs ml-2 font-normal opacity-50 tracking-widest">ADMIN</span>
        </h1>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navigation.map((item) => {
          const isActive = location === item.href;
          return (
            <Link key={item.name} href={item.href}>
              <div
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer group",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                    : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                )}
              >
                <item.icon className={cn("w-5 h-5", isActive ? "text-white" : "text-muted-foreground group-hover:text-primary")} />
                {item.name}
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border/50 space-y-3">
        <button
          data-testid="button-logout"
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-muted-foreground hover:bg-red-500/10 hover:text-red-400 transition-all duration-200 group"
        >
          <LogOut className="w-5 h-5 group-hover:text-red-400" />
          Logout
        </button>

        <div className="bg-gradient-to-br from-primary/10 to-transparent p-4 rounded-xl border border-primary/10">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs font-medium text-primary-foreground/80">System Online</span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">v2.4.0-stable</p>
        </div>
      </div>
    </div>
  );
}
