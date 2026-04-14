import { useRef, useState } from "react";
import { AdminSidebar } from "@/components/AdminSidebar";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { type User } from "@shared/schema";
import { Users, Calendar, Clock, ShieldCheck, Upload, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";

interface ImportResult {
  success: boolean;
  added: number;
  updated: number;
  skipped: number;
  total: number;
}

export default function UsersPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
    staleTime: 1000 * 60 * 2,
  });

  const importMutation = useMutation<ImportResult, Error, unknown[]>({
    mutationFn: async (usersArray) => {
      const res = await apiRequest("POST", "/api/admin/users/import", { users: usersArray });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Import failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setImportResult(data);
      setImportError(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setTimeout(() => setImportResult(null), 10000);
    },
    onError: (err) => {
      setImportError(err.message);
      setTimeout(() => setImportError(null), 8000);
    },
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportResult(null);
    setImportError(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        const parsed = JSON.parse(text);
        const arr = Array.isArray(parsed) ? parsed : parsed.users;
        if (!Array.isArray(arr) || arr.length === 0) {
          setImportError("File must contain a JSON array of users.");
          return;
        }
        importMutation.mutate(arr);
      } catch {
        setImportError("Could not parse file — make sure it's valid JSON.");
      }
    };
    reader.readAsText(file);
    // Reset so same file can be re-uploaded
    e.target.value = "";
  }

  const adminCount = users.filter(u => u.isAdmin).length;

  return (
    <div className="min-h-screen bg-background flex">
      <AdminSidebar />
      <main className="flex-1 md:ml-64 p-6 md:p-8 overflow-y-auto">
        <header className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold font-display text-foreground">Users</h1>
            <p className="text-muted-foreground">All users who have started the Telegram bot.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.txt"
              className="hidden"
              onChange={handleFileChange}
              data-testid="input-import-users"
            />
            <button
              data-testid="button-import-users"
              onClick={() => fileInputRef.current?.click()}
              disabled={importMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-all
                bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20 hover:border-blue-500/50
                disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {importMutation.isPending ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              {importMutation.isPending ? "Importing…" : "Import Users"}
            </button>
          </div>
        </header>

        {/* Import result / error banners */}
        {importResult && (
          <div className="mb-5 flex items-start gap-3 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3 text-sm">
            <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-muted-foreground">
              <span>Imported <span className="font-semibold text-foreground">{importResult.total}</span> records</span>
              <span><span className="text-green-400 font-semibold">+{importResult.added}</span> new users added</span>
              <span><span className="text-blue-400 font-semibold">{importResult.updated}</span> existing users updated</span>
              {importResult.skipped > 0 && (
                <span><span className="text-muted-foreground font-semibold">{importResult.skipped}</span> skipped (invalid)</span>
              )}
            </div>
          </div>
        )}
        {importError && (
          <div className="mb-5 flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {importError}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">Total Users</p>
            <p className="text-3xl font-bold text-foreground">{users.length}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">Admins</p>
            <p className="text-3xl font-bold text-primary">{adminCount}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 col-span-2 md:col-span-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">Regular Users</p>
            <p className="text-3xl font-bold text-foreground">{users.length - adminCount}</p>
          </div>
        </div>

        {/* Users Table */}
        <div className="bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold">All Users</h2>
              <p className="text-xs text-muted-foreground">{users.length} registered via Telegram bot</p>
            </div>
          </div>

          {isLoading ? (
            <div className="text-center py-10 text-muted-foreground text-sm">Loading users...</div>
          ) : users.length === 0 ? (
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
                    <th className="text-left pb-3 pr-4 font-semibold">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Last Active</span>
                    </th>
                    <th className="text-left pb-3 font-semibold">Role</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {users.map((user) => (
                    <tr key={user.id} data-testid={`row-user-${user.id}`} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3 pr-4">
                        <div>
                          <p className="font-semibold text-foreground">{user.firstName || "—"}</p>
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
                      <td className="py-3 pr-4">
                        <span className="text-xs text-muted-foreground">
                          {user.lastActive ? new Date(user.lastActive).toLocaleDateString("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                        </span>
                      </td>
                      <td className="py-3">
                        {user.isAdmin ? (
                          <span className="inline-flex items-center gap-1 text-[10px] bg-primary/15 text-primary rounded-full px-2 py-0.5 font-black uppercase">
                            <ShieldCheck className="w-3 h-3" /> Admin
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">User</span>
                        )}
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
