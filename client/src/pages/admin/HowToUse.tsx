import { useState, useEffect } from "react";
import { AdminSidebar } from "@/components/AdminSidebar";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Save, Loader2, HelpCircle, GripVertical, Link2 } from "lucide-react";
import type { Settings } from "@shared/schema";

interface HowToUseItem {
  title: string;
  url: string;
}

export default function HowToUsePage() {
  const { toast } = useToast();
  const { data: settings, isLoading } = useQuery<Settings>({
    queryKey: ["/api/settings"],
    staleTime: 30000,
  });

  const [items, setItems] = useState<HowToUseItem[]>([]);

  useEffect(() => {
    if (settings) {
      const raw = (settings as any).howToUseItems;
      if (Array.isArray(raw) && raw.length > 0) {
        setItems(raw);
      } else {
        setItems([{ title: "", url: "" }]);
      }
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const filtered = items.filter((i) => i.title.trim() || i.url.trim());
      const res = await apiRequest("POST", "/api/settings", { howToUseItems: filtered });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/public/how-to-use"] });
      toast({ title: "Saved!", description: "How To Use links updated." });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const addItem = () => setItems((prev) => [...prev, { title: "", url: "" }]);

  const removeItem = (index: number) =>
    setItems((prev) => prev.filter((_, i) => i !== index));

  const updateItem = (index: number, field: keyof HowToUseItem, value: string) =>
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );

  return (
    <div className="flex min-h-screen bg-background">
      <AdminSidebar />
      <main className="flex-1 ml-64 p-8">
        <div className="max-w-2xl mx-auto space-y-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <HelpCircle className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">How To Use</h1>
                <p className="text-sm text-muted-foreground">
                  Bot menu links shown when users tap ❓ How to Use
                </p>
              </div>
            </div>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              data-testid="button-save-how-to-use"
            >
              {saveMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save
            </Button>
          </div>

          {/* Items list */}
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card"
                  data-testid={`row-how-to-use-${index}`}
                >
                  <GripVertical className="w-4 h-4 text-muted-foreground flex-shrink-0" />

                  <div className="flex-1 grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">
                        Title
                      </label>
                      <Input
                        value={item.title}
                        onChange={(e) => updateItem(index, "title", e.target.value)}
                        placeholder="နည်းလမ်း ၁"
                        className="text-sm"
                        data-testid={`input-how-to-use-title-${index}`}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                        <Link2 className="w-3 h-3" /> URL
                      </label>
                      <Input
                        value={item.url}
                        onChange={(e) => updateItem(index, "url", e.target.value)}
                        placeholder="https://t.me/..."
                        className="font-mono text-xs"
                        data-testid={`input-how-to-use-url-${index}`}
                      />
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex-shrink-0"
                    onClick={() => removeItem(index)}
                    disabled={items.length === 1}
                    data-testid={`button-remove-how-to-use-${index}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}

              <Button
                variant="outline"
                className="w-full border-dashed"
                onClick={addItem}
                data-testid="button-add-how-to-use"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Link
              </Button>
            </div>
          )}

          {/* Preview */}
          {items.some((i) => i.title.trim()) && (
            <div className="p-4 rounded-xl border border-border bg-secondary/10 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Bot preview
              </p>
              <div className="space-y-1">
                {items
                  .filter((i) => i.title.trim())
                  .map((item, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 text-sm text-foreground/80"
                    >
                      <span className="text-base">📖</span>
                      <span>{item.title}</span>
                      {item.url && (
                        <span className="text-xs text-muted-foreground font-mono truncate max-w-[200px]">
                          {item.url}
                        </span>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
