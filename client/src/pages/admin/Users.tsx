import { AdminSidebar } from "@/components/AdminSidebar";
import { useQuery } from "@tanstack/react-query";
import { type User } from "@shared/schema";
import { Users, Calendar, Clock, ShieldCheck } from "lucide-react";

export default function UsersPage() {
  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
    staleTime: 1000 * 60 * 2,
  });

  const adminCount = users.filter(u => u.isAdmin).length;

  return (
    <div className="min-h-screen bg-background flex">
      <AdminSidebar />
      <main className="flex-1 md:ml-64 p-6 md:p-8 overflow-y-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold font-display text-foreground">Users</h1>
          <p className="text-muted-foreground">All users who have started the Telegram bot.</p>
        </header>

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
