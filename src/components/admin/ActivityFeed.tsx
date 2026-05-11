import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Activity } from "lucide-react";

interface Log {
  id: string;
  event_type: string;
  summary: string;
  actor_email: string | null;
  created_at: string;
}

const eventColor = (e: string) => {
  if (e.includes("approved") || e.includes("paid") || e.includes("bonus")) return "bg-success/15 text-success";
  if (e.includes("reject") || e.includes("cancel") || e.includes("refund") || e.includes("ban")) return "bg-destructive/15 text-destructive";
  if (e.includes("updated") || e.includes("seller_application")) return "bg-primary/15 text-primary";
  return "bg-muted text-muted-foreground";
};

export const ActivityFeed = () => {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const r = await api.get<{ logs: Log[] }>("/api/admin/audit-logs");
      setLogs(r.logs ?? []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, []);

  return (
    <Card className="border-border/60 bg-gradient-card p-5">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Activity className="h-4 w-4 text-primary" /> Live activity
        <span className="ml-auto text-xs font-normal text-muted-foreground">auto-refresh 15s</span>
      </div>
      {loading ? (
        <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : logs.length === 0 ? (
        <div className="py-8 text-center text-xs text-muted-foreground">No activity yet.</div>
      ) : (
        <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
          {logs.slice(0, 30).map((l) => (
            <div key={l.id} className="rounded-md border border-border/40 bg-background/40 p-2.5">
              <div className="flex items-center gap-2">
                <Badge className={eventColor(l.event_type) + " text-[10px] capitalize"}>
                  {l.event_type.replace(/_/g, " ")}
                </Badge>
                <span className="ml-auto text-[10px] text-muted-foreground">
                  {new Date(l.created_at).toLocaleTimeString()}
                </span>
              </div>
              <div className="mt-1 text-xs">{l.summary}</div>
              {l.actor_email && (
                <div className="mt-0.5 text-[10px] text-muted-foreground">by {l.actor_email}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};
