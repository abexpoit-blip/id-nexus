import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Megaphone, AlertTriangle, CheckCircle2, Pin, X } from "lucide-react";

interface Notice {
  id: string;
  audience: "all" | "buyer" | "seller";
  severity: "info" | "warning" | "success";
  title: string;
  body: string;
  pinned: boolean;
  created_at: string;
  expires_at: string | null;
}

const ICON: Record<string, any> = {
  info: Megaphone, warning: AlertTriangle, success: CheckCircle2,
};
const TONE: Record<string, string> = {
  info: "border-primary/40 bg-primary/5",
  warning: "border-warning/40 bg-warning/5",
  success: "border-success/40 bg-success/5",
};
const TONE_FG: Record<string, string> = {
  info: "text-primary", warning: "text-warning", success: "text-success",
};

const DISMISSED_KEY = "nx-dismissed-notices";
const getDismissed = (): string[] => {
  try { return JSON.parse(localStorage.getItem(DISMISSED_KEY) || "[]"); } catch { return []; }
};
const setDismissed = (ids: string[]) => {
  try { localStorage.setItem(DISMISSED_KEY, JSON.stringify(ids.slice(-200))); } catch { /* ignore */ }
};

export const NoticesBoard = ({ title = "Notices" }: { title?: string }) => {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [dismissed, setDismissedState] = useState<string[]>(getDismissed());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api.get<{ notices: Notice[] }>("/api/notices/me")
      .then((r) => setNotices(r.notices ?? []))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const dismiss = (id: string) => {
    const next = [...dismissed, id];
    setDismissedState(next);
    setDismissed(next);
  };

  const visible = notices.filter((n) => n.pinned || !dismissed.includes(n.id));
  if (!loaded || visible.length === 0) return null;

  return (
    <Card className="border-border/60 bg-gradient-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <Megaphone className="h-5 w-5 text-primary" />
        <h3 className="font-display text-lg font-semibold">{title}</h3>
      </div>
      <div className="space-y-2">
        {visible.map((n) => {
          const Icon = ICON[n.severity] ?? Megaphone;
          return (
            <div key={n.id} className={`relative flex gap-3 rounded-md border p-3 ${TONE[n.severity] ?? TONE.info}`}>
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${TONE_FG[n.severity] ?? TONE_FG.info}`} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="font-semibold">{n.title}</div>
                  {n.pinned && (
                    <Badge variant="outline" className="gap-1 text-[10px]">
                      <Pin className="h-3 w-3" /> pinned
                    </Badge>
                  )}
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    {new Date(n.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{n.body}</div>
              </div>
              {!n.pinned && (
                <button
                  type="button"
                  onClick={() => dismiss(n.id)}
                  className="absolute right-2 top-2 rounded p-1 text-muted-foreground hover:bg-muted/40"
                  aria-label="Dismiss"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
};

export default NoticesBoard;
