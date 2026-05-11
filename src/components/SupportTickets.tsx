import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { LifeBuoy, Loader2, Plus, Send, Lock } from "lucide-react";
import { toast } from "sonner";

const CATEGORIES = [
  { value: "order", label: "Order issue" },
  { value: "payment", label: "Payment / wallet" },
  { value: "account", label: "Account / login" },
  { value: "technical", label: "Technical bug" },
  { value: "other", label: "Other" },
];

const STATUS_BADGE: Record<string, string> = {
  open: "bg-warning/20 text-warning",
  pending: "bg-primary/20 text-primary",
  resolved: "bg-success/20 text-success",
  closed: "bg-muted text-muted-foreground",
};

interface Ticket {
  id: string; category: string; subject: string; status: string;
  last_message_at: string; created_at: string; closed_at: string | null;
}
interface Msg {
  id: string; sender_is_admin: boolean; body: string; created_at: string;
}

export const SupportTickets = () => {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [thread, setThread] = useState<{ ticket: Ticket; messages: Msg[] } | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  // New ticket form
  const [newOpen, setNewOpen] = useState(false);
  const [cat, setCat] = useState("order");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [creating, setCreating] = useState(false);

  const loadAll = async () => {
    try {
      const [{ enabled }, { tickets }] = await Promise.all([
        api.get<{ enabled: boolean }>("/api/support/enabled"),
        api.get<{ tickets: Ticket[] }>("/api/support/tickets"),
      ]);
      setEnabled(enabled);
      setTickets(tickets ?? []);
    } catch (e: any) { toast.error(e?.message || "Failed"); }
    finally { setLoading(false); }
  };
  useEffect(() => { loadAll(); }, []);

  const openTicket = async (id: string) => {
    setOpenId(id);
    setThread(null);
    try {
      const r = await api.get<{ ticket: Ticket; messages: Msg[] }>(`/api/support/tickets/${id}`);
      setThread(r);
    } catch (e: any) { toast.error(e?.message || "Failed"); }
  };

  const send = async () => {
    if (!openId || !reply.trim()) return;
    setSending(true);
    try {
      await api.post(`/api/support/tickets/${openId}/messages`, { body: reply.trim() });
      setReply("");
      openTicket(openId);
      loadAll();
    } catch (e: any) { toast.error(e?.message || "Failed"); }
    finally { setSending(false); }
  };

  const create = async () => {
    if (subject.trim().length < 3 || body.trim().length < 3) {
      toast.error("Subject and message must be at least 3 characters");
      return;
    }
    setCreating(true);
    try {
      await api.post("/api/support/tickets", { category: cat, subject: subject.trim(), body: body.trim() });
      toast.success("Ticket submitted");
      setNewOpen(false); setSubject(""); setBody(""); setCat("order");
      loadAll();
    } catch (e: any) { toast.error(e?.message || "Failed"); }
    finally { setCreating(false); }
  };

  if (enabled === false) {
    return (
      <Card className="border-border/60 bg-gradient-card p-5">
        <div className="mb-2 flex items-center gap-2">
          <LifeBuoy className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-display text-lg font-semibold">Support</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Support is currently unavailable. Please check back later.
        </p>
      </Card>
    );
  }

  return (
    <Card className="border-border/60 bg-gradient-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LifeBuoy className="h-5 w-5 text-primary" />
          <h3 className="font-display text-lg font-semibold">Support tickets</h3>
        </div>
        <Dialog open={newOpen} onOpenChange={setNewOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-gradient-brand text-primary-foreground">
              <Plus className="mr-1 h-4 w-4" /> New ticket
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create a support ticket</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">Category</label>
                <Select value={cat} onValueChange={setCat}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">Subject</label>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} placeholder="Short summary" />
              </div>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">Describe the issue</label>
                <Textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Include order IDs, screenshots, and steps to reproduce." />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setNewOpen(false)}>Cancel</Button>
              <Button onClick={create} disabled={creating}>
                {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Submit
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : tickets.length === 0 ? (
        <p className="rounded-md border border-dashed border-border/60 p-4 text-center text-sm text-muted-foreground">
          No tickets yet. Open one if you need help.
        </p>
      ) : (
        <ul className="divide-y divide-border/60">
          {tickets.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => openTicket(t.id)}
                className="flex w-full items-center justify-between gap-3 py-3 text-left hover:bg-muted/30"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{t.subject}</div>
                  <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
                    {t.category} · {new Date(t.last_message_at).toLocaleString()}
                  </div>
                </div>
                <Badge className={STATUS_BADGE[t.status] ?? ""}>{t.status}</Badge>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!openId} onOpenChange={(v) => { if (!v) { setOpenId(null); setThread(null); setReply(""); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {thread?.ticket.subject || "Loading…"}
              {thread && <Badge className={STATUS_BADGE[thread.ticket.status] ?? ""}>{thread.ticket.status}</Badge>}
            </DialogTitle>
          </DialogHeader>
          {!thread ? (
            <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : (
            <>
              <div className="max-h-80 space-y-2 overflow-y-auto rounded-md border border-border/60 bg-background/40 p-3">
                {thread.messages.map((m) => (
                  <div key={m.id} className={`flex ${m.sender_is_admin ? "justify-start" : "justify-end"}`}>
                    <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                      m.sender_is_admin ? "bg-muted text-foreground" : "bg-primary text-primary-foreground"
                    }`}>
                      <div className="whitespace-pre-wrap">{m.body}</div>
                      <div className="mt-1 text-[10px] opacity-70">{new Date(m.created_at).toLocaleString()}</div>
                    </div>
                  </div>
                ))}
              </div>
              {thread.ticket.status === "closed" ? (
                <div className="mt-3 flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  <Lock className="h-4 w-4" /> This ticket is closed. Open a new one if you still need help.
                </div>
              ) : (
                <div className="mt-3 flex gap-2">
                  <Textarea rows={2} value={reply} onChange={(e) => setReply(e.target.value)}
                    placeholder="Write a reply…"
                    onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(); }} />
                  <Button onClick={send} disabled={sending || !reply.trim()} className="shrink-0">
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default SupportTickets;
