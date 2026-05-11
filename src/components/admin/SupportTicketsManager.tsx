import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Tabs, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { LifeBuoy, Loader2, Send, Power, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const STATUS_BADGE: Record<string, string> = {
  open: "bg-warning/20 text-warning",
  pending: "bg-primary/20 text-primary",
  resolved: "bg-success/20 text-success",
  closed: "bg-muted text-muted-foreground",
};

interface AdminTicket {
  id: string; category: string; subject: string; status: string;
  last_message_at: string; created_at: string;
  email: string; display_name: string | null;
  user_msgs: number;
}
interface Msg {
  id: string; sender_is_admin: boolean; body: string; created_at: string;
}

export const SupportTicketsManager = () => {
  const [tickets, setTickets] = useState<AdminTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"open" | "pending" | "resolved" | "closed" | "all">("open");
  const [enabled, setEnabled] = useState<boolean>(true);
  const [toggling, setToggling] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [thread, setThread] = useState<{ ticket: AdminTicket; messages: Msg[] } | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const status = tab === "all" ? "" : tab;
      const [{ tickets }, sett] = await Promise.all([
        api.get<{ tickets: AdminTicket[] }>("/api/support/admin/tickets", status ? { status } : undefined),
        api.get<{ enabled: boolean }>("/api/support/enabled"),
      ]);
      setTickets(tickets ?? []);
      setEnabled(sett.enabled);
    } catch (e: any) { toast.error(e?.message || "Failed"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tab]);

  const openTicket = async (id: string) => {
    setOpenId(id); setThread(null);
    try {
      const r = await api.get<{ ticket: AdminTicket; messages: Msg[] }>(`/api/support/admin/tickets/${id}`);
      setThread(r);
    } catch (e: any) { toast.error(e?.message || "Failed"); }
  };

  const send = async () => {
    if (!openId || !reply.trim()) return;
    setSending(true);
    try {
      await api.post(`/api/support/admin/tickets/${openId}/messages`, { body: reply.trim() });
      setReply("");
      await openTicket(openId);
      load();
    } catch (e: any) { toast.error(e?.message || "Failed"); }
    finally { setSending(false); }
  };

  const setStatus = async (id: string, status: string) => {
    try {
      await api.post(`/api/support/admin/tickets/${id}/status`, { status });
      toast.success(`Marked as ${status}`);
      if (openId === id) await openTicket(id);
      load();
    } catch (e: any) { toast.error(e?.message || "Failed"); }
  };

  const toggleSupport = async (v: boolean) => {
    setToggling(true);
    try {
      await api.post("/api/support/admin/toggle", { enabled: v });
      setEnabled(v);
      toast.success(`Support ${v ? "enabled" : "disabled"}`);
    } catch (e: any) { toast.error(e?.message || "Failed"); }
    finally { setToggling(false); }
  };

  return (
    <Card className="border-border/60 bg-gradient-card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <LifeBuoy className="h-5 w-5 text-primary" />
          <h3 className="font-display text-lg font-semibold">Support tickets</h3>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-1.5">
            <Power className={`h-4 w-4 ${enabled ? "text-success" : "text-destructive"}`} />
            <span className="text-xs font-medium">{enabled ? "System ON" : "System OFF"}</span>
            <Switch checked={enabled} disabled={toggling} onCheckedChange={toggleSupport} />
          </div>
          <Button variant="ghost" size="icon" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="open">Open</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="resolved">Resolved</TabsTrigger>
          <TabsTrigger value="closed">Closed</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="mt-4">
        {loading ? (
          <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : tickets.length === 0 ? (
          <p className="rounded-md border border-dashed border-border/60 p-4 text-center text-sm text-muted-foreground">
            Nothing here.
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {tickets.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-3">
                <button
                  type="button"
                  onClick={() => openTicket(t.id)}
                  className="min-w-0 flex-1 text-left hover:opacity-80"
                >
                  <div className="flex items-center gap-2">
                    <Badge className={STATUS_BADGE[t.status] ?? ""}>{t.status}</Badge>
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{t.category}</span>
                    <span className="truncate text-sm font-medium">{t.subject}</span>
                  </div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">
                    {t.display_name || t.email} · {new Date(t.last_message_at).toLocaleString()} · {t.user_msgs} user msgs
                  </div>
                </button>
                <Select value={t.status} onValueChange={(v) => setStatus(t.id, v)}>
                  <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={!!openId} onOpenChange={(v) => { if (!v) { setOpenId(null); setThread(null); setReply(""); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {thread?.ticket.subject || "Loading…"}
              {thread && <span className="ml-2 text-xs text-muted-foreground">— {thread.ticket.email}</span>}
            </DialogTitle>
          </DialogHeader>
          {!thread ? (
            <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : (
            <>
              <div className="max-h-80 space-y-2 overflow-y-auto rounded-md border border-border/60 bg-background/40 p-3">
                {thread.messages.map((m) => (
                  <div key={m.id} className={`flex ${m.sender_is_admin ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                      m.sender_is_admin ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                    }`}>
                      <div className="whitespace-pre-wrap">{m.body}</div>
                      <div className="mt-1 text-[10px] opacity-70">{new Date(m.created_at).toLocaleString()}</div>
                    </div>
                  </div>
                ))}
              </div>
              {thread.ticket.status === "closed" ? (
                <div className="mt-3 rounded-md border border-border/60 bg-muted/30 p-2 text-xs text-muted-foreground">
                  This ticket is closed. Reopen by changing status above.
                </div>
              ) : (
                <div className="mt-3 flex gap-2">
                  <Textarea rows={2} value={reply} onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(); }}
                    placeholder="Reply to user…" />
                  <Button onClick={send} disabled={sending || !reply.trim()} className="shrink-0">
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              )}
              <div className="mt-3 flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setStatus(thread.ticket.id, "resolved")}>Mark resolved</Button>
                <Button variant="outline" size="sm" onClick={() => setStatus(thread.ticket.id, "closed")}>Close</Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default SupportTicketsManager;
