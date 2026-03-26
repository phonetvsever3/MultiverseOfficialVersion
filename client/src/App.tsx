import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

// Admin Pages
import AdminDashboard from "@/pages/admin/Dashboard";
import AdminMovies from "@/pages/admin/Movies";
import AdminChannels from "@/pages/admin/Channels";
import AdminAds from "@/pages/admin/Ads";
import AdminSettings from "@/pages/admin/Settings";
import AdminSyncedFiles from "@/pages/admin/SyncedFiles";
import BackupPage from "@/pages/admin/Backup";
import AdminMascot from "@/pages/admin/Mascot";
import AdminFootball from "@/pages/admin/Football";
import LoginPage from "@/pages/admin/Login";

// Mini App Pages
import MovieView from "@/pages/app/MovieView";
import Home from "@/pages/app/Home";
import SearchPage from "@/pages/app/Search";
import Browse from "@/pages/app/Browse";
import Adult from "@/pages/app/Adult";
import Football from "@/pages/app/Football";

function useAuth() {
  return useQuery({
    queryKey: ["/api/admin/auth/me"],
    queryFn: async () => {
      const res = await fetch("/api/admin/auth/me", { credentials: "include" });
      if (!res.ok) return { authenticated: false };
      return res.json() as Promise<{ authenticated: boolean }>;
    },
    retry: false,
    staleTime: 30000,
  });
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const [, navigate] = useLocation();
  const { data, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !data?.authenticated) {
      navigate("/admin/login");
    }
  }, [isLoading, data, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!data?.authenticated) return null;

  return <Component />;
}

function Router() {
  return (
    <Switch>
      {/* Login */}
      <Route path="/admin/login" component={LoginPage} />

      {/* Protected Admin Routes */}
      <Route path="/admin">{() => <ProtectedRoute component={AdminDashboard} />}</Route>
      <Route path="/admin/movies">{() => <ProtectedRoute component={AdminMovies} />}</Route>
      <Route path="/admin/channels">{() => <ProtectedRoute component={AdminChannels} />}</Route>
      <Route path="/admin/ads">{() => <ProtectedRoute component={AdminAds} />}</Route>
      <Route path="/admin/synced-files">{() => <ProtectedRoute component={AdminSyncedFiles} />}</Route>
      <Route path="/admin/settings">{() => <ProtectedRoute component={AdminSettings} />}</Route>
      <Route path="/admin/backup">{() => <ProtectedRoute component={BackupPage} />}</Route>
      <Route path="/admin/mascot">{() => <ProtectedRoute component={AdminMascot} />}</Route>
      <Route path="/admin/football">{() => <ProtectedRoute component={AdminFootball} />}</Route>

      {/* Mini App Routes */}
      <Route path="/app" component={Home} />
      <Route path="/app/search" component={SearchPage} />
      <Route path="/app/movie/:id" component={MovieView} />
      <Route path="/app/browse" component={Browse} />
      <Route path="/app/adult" component={Adult} />
      <Route path="/app/football" component={Football} />

      {/* Redirect root to admin */}
      <Route path="/">{() => <ProtectedRoute component={AdminDashboard} />}</Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
