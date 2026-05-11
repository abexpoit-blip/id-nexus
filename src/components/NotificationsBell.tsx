import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Bell, CheckCheck, MessagesSquare } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Link } from "react-router-dom";

interface Notif {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
}

type Prefs = {
  order_updates: boolean;
  replacement_updates: boolean;
  payouts: boolean;
  announcements: boolean;
  messages: boolean;
};
const DEFAULT_PREFS: Prefs = {
  order_updates: true, replacement_updates: true, payouts: true, announcements: true, messages: true,
};

const KIND_TO_PREF: Record<string, keyof Prefs | null> = {
  order_placed: "order_updates",
  stock_low: "order_updates",
  replacement_filed: "replacement_updates",
  id_replaced: "replacement_updates",
  id_refunded: "replacement_updates",
  id_rejected: "replacement_updates",
  id_marked_bad: "replacement_updates",
  payout: "payouts",
  message: "messages",
  announcement: "announcements",
  system: null, // always show
};

export const NotificationsBell = () => {
  const { user, profile } = useAuth();
  const [items, setItems] = useState<Notif[]>([]);
  const [open, setOpen] = useState(false);
  const [unreadMsgs, setUnreadMsgs] = useState(0);
  const seenIdsRef = useRef<Set<string>>(new Set());

  const prefs: Prefs = {
    ...DEFAULT_PREFS,
    ...(((profile?.buyer_settings as any)?.notification_prefs) ?? {}),
  };

  const visible = items.filter((n) => {
    const key = KIND_TO_PREF[n.kind];
    if (key === undefined) return true; // unknown kinds: show
    if (key === null) return true;
    return prefs[key];
  });

  const load = async () => {
    if (!user) return;
    try {
      const res = await api.get<{ notifications: Notif[] }>("/api/notifications", { limit: 20 });
      const list = res.notifications ?? [];
      // Toast new ones we haven't shown before (skip first hydration)
      if (seenIdsRef.current.size > 0) {
        for (const n of list) {
          if (seenIdsRef.current.has(n.id) || n.read_at) continue;
          const key = KIND_TO_PREF[n.kind];
          if (key && !prefs[key]) continue;
          toast(n.title, { description: n.body ?? undefined });
        }
      }
      seenIdsRef.current = new Set(list.map((n) => n.id));
      setItems(list);
      try {
        const m = await api.get<{ unread: number }>("/api/messages/me");
        setUnreadMsgs(m.unread ?? 0);
      } catch { /* ignore */ }
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (!user) return;
    load();
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const unreadNotifs = visible.filter((i) => !i.read_at).length;
  const respectMsg = prefs.messages ? unreadMsgs : 0;
  const unread = unreadNotifs + respectMsg;

  const markAllRead = async () => {
    if (!user) return;
    try {
      await api.post("/api/notifications/read-all");
    } catch { /* ignore */ }
    load();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <Badge className="absolute -right-1 -top-1 h-5 min-w-5 justify-center rounded-full bg-primary p-0 text-[10px] text-primary-foreground hover:bg-primary">
              {unread}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
          <div className="text-sm font-semibold">Notifications</div>
          {unreadNotifs > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllRead} className="h-7 px-2 text-xs">
              <CheckCheck className="mr-1 h-3 w-3" /> Mark all read
            </Button>
          )}
        </div>
        {respectMsg > 0 && (
          <Link
            to="/dashboard#messages"
            onClick={() => setOpen(false)}
            className="flex items-center justify-between border-b border-border/60 bg-primary/10 px-3 py-2 text-sm hover:bg-primary/15"
          >
            <span className="flex items-center gap-2 font-medium">
              <MessagesSquare className="h-4 w-4 text-primary" />
              {respectMsg} unread message{respectMsg === 1 ? "" : "s"} from admin
            </span>
            <span className="text-xs text-primary">Open →</span>
          </Link>
        )}
        <ScrollArea className="max-h-80">
          {visible.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">No notifications yet</div>
          ) : (
            <ul className="divide-y divide-border/60">
              {visible.map((n) => (
                <li
                  key={n.id}
                  className={`px-3 py-2 text-sm ${n.read_at ? "opacity-70" : "bg-primary/5"}`}
                >
                  <div className="font-medium">{n.title}</div>
                  {n.body && <div className="mt-0.5 text-xs text-muted-foreground">{n.body}</div>}
                  <div className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                    {new Date(n.created_at).toLocaleString()}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};