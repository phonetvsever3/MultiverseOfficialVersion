import { useState } from "react";
import { AdminSidebar } from "@/components/AdminSidebar";
import { useQuery } from "@tanstack/react-query";
import { Database, ChevronDown, ChevronUp } from "lucide-react";

interface TableData {
  [key: string]: any[];
}

function TableSection({ name, rows }: { name: string; rows: any[] }) {
  const [expanded, setExpanded] = useState(false);
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden mb-4">
      <button
        data-testid={`button-expand-table-${name}`}
        onClick={() => setExpanded(p => !p)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg text-primary">
            <Database className="w-4 h-4" />
          </div>
          <div className="text-left">
            <p className="font-bold text-foreground font-mono text-sm">{name}</p>
            <p className="text-xs text-muted-foreground">{rows.length} row{rows.length !== 1 ? "s" : ""} · {columns.length} column{columns.length !== 1 ? "s" : ""}</p>
          </div>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="border-t border-border">
          {rows.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground text-sm">No rows in this table.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-background/50">
                    {columns.map(col => (
                      <th key={col} className="text-left px-4 py-2.5 font-semibold text-muted-foreground uppercase tracking-wider border-b border-border whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((row, i) => (
                    <tr key={i} data-testid={`row-${name}-${i}`} className="hover:bg-white/[0.02] transition-colors">
                      {columns.map(col => {
                        const val = row[col];
                        let display: string;
                        if (val === null || val === undefined) {
                          display = "—";
                        } else if (typeof val === "object") {
                          display = JSON.stringify(val);
                        } else if (typeof val === "boolean") {
                          display = val ? "true" : "false";
                        } else {
                          display = String(val);
                        }
                        const isLong = display.length > 60;
                        return (
                          <td key={col} className="px-4 py-2.5 text-foreground/80 whitespace-nowrap max-w-[200px]" title={display}>
                            <span className="block truncate">{isLong ? display.slice(0, 60) + "…" : display}</span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function DatabaseTablesPage() {
  const { data: tables, isLoading } = useQuery<TableData>({
    queryKey: ["/api/admin/db-tables"],
    staleTime: 1000 * 30,
  });

  const tableNames = tables ? Object.keys(tables) : [];
  const totalRows = tables ? tableNames.reduce((s, k) => s + (tables[k]?.length ?? 0), 0) : 0;

  return (
    <div className="min-h-screen bg-background flex">
      <AdminSidebar />
      <main className="flex-1 md:ml-64 p-6 md:p-8 overflow-y-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold font-display text-foreground">Database Tables</h1>
          <p className="text-muted-foreground">Browse all tables in the database. Click a table to expand and view its rows.</p>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">Total Tables</p>
            <p className="text-3xl font-bold text-foreground">{tableNames.length}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 col-span-2 md:col-span-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">Total Rows</p>
            <p className="text-3xl font-bold text-primary">{totalRows.toLocaleString()}</p>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-20 text-muted-foreground">Loading database tables...</div>
        ) : (
          <div>
            {tableNames.map(name => (
              <TableSection key={name} name={name} rows={tables![name] ?? []} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
