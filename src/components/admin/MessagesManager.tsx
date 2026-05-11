import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Send, Megaphone, MessageCircle, Lock, Unlock } from "lucide-react";
import { toast } from "sonner";

interface Thread {
  user_id: string;
  email: string | null;
  display_name: string | null;
  last_body: string;
  last_at: string;
  last_from_admin: boolean;
  unread: number;
}
interface Msg { id: string; sender_is_admin: boolean; body: string; created_at: string; }

export const MessagesManager = () => {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Thread | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [closedAt, setClosedAt] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [bcastOpen, setBcastOpen] = useState(false);
  const [bcTitle, setBcTitle] = useState("");
  const [bcBody, setBcBody] = useState("");
  const [bcAudience, setBcAudience] = useState("all");
  const [bcSending, setBcSending] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  const loadThreads = async () => {
    try {
      const { threads } = await api.get<{ threads: Thread[] }>("/api/messages/admin/threads");
      setThreads(threads ?? []);
    } catch (e: any) { toast.error(e?.message || "Failed"); }
    finally { setLoading(false); }
  };
  const loadThread = async (t: Thread) => {
    setActive(t);
    try {
      const r = await api.get<{ messages: Msg[]; closed_at: string | null }>(`/api/messages/admin/thread/${t.user_id}`);
      setMsgs(r.messages ?? []);
      setClosedAt(r.closed_at);
      loadThreads();
    } catch (e: any) { toast.error(e?.message || "Failed"); }
  };
  useEffect(() => { loadThreads(); const i = setInterval(loadThreads, 20_000); return () => clearInterval(i); }, []);
  useEffect(() => { scroller.current?.scrollTo(0, 1e9); }, [msgs.length]);

  const send = async () => {
    if (!active || !body.trim()) return;
    setSending(true);
    try {
      await api.post(`/api/messages/admin/thread/${active.user_id}`, { body: body.trim() });
      setBody(""); loadThread(active);
    } catch (e: any) { toast.error(e?.message || "Failed"); }
    finally { setSending(false); }
  };

  const closeThread = async () => {
    if (!active) return;
    try {
      await api.post(`/api/messages/admin/thread/${active.user_id}/close`);
      toast.success("Conversation closed");
      loadThread(active);
    } catch (e: any) { toast.error(e?.message || "Failed"); }
  };
  const reopenThread = async () => {
    if (!active) return;
    try {
      await api.post(`/api/messages/admin/thread/${active.user_id}/reopen`);
      toast.success("Conversation reopened");
      loadThread(active);
    } catch (e: any) { toast.error(e?.message || "Failed"); }
  };

  const broadcast = async () => {
    if (bcTitle.trim().length < 2 || bcBody.trim().length < 2) { toast.error("Title and body required"); return; }
    setBcSending(true);
    try {
      const r = await api.post<{ count: number }>("/api/messages/admin/broadcast",
        { title: bcTitle.trim(), body: bcBody.trim(), audience: bcAudience });
      toast.success(`Sent to ${r.count} users`);
      setBcastOpen(false); setBcTitle(""); setBcBody("");
    } catch (e: any) { toast.error(e?.message || "Failed"); }
    finally { setBcSending(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl font-semibold flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-primary" /> Messaging
          </h2>
          <p className="text-sm text-muted-foreground">Direct threads with users + broadcast announcements.</p>
        </div>
        <Button onClick={() => setBcastOpen(true)} className="bg-gradient-brand text-primary-foreground">
          <Megaphone className="mr-2 h-4 w-4" /> Broadcast
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1 border-border/60 bg-gradient-card p-3">
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Threads</div>
          <div className="max-h-[60vh] overflow-y-auto space-y-1">
            {loading ? (
              <div className="flex h-20 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
            ) : threads.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">No conversations yet.</div>
            ) : threads.map((t) => (
              <button key={t.user_id} onClick={() => loadThread(t)}
                className={`w-full rounded-md border px-3 py-2 text-left text-sm transition ${
                  active?.user_id === t.user_id ? "border-primary/50 bg-primary/5" : "border-border/60 hover:bg-muted/40"
                }`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate font-medium">{t.display_name ?? t.email}</div>
                  {t.unread > 0 && (
                    <span className="rounded-full bg-warning/30 px-2 py-0.5 text-[10px] font-semibold text-warning">{t.unread}</span>
                  )}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {t.last_from_admin ? "You: " : ""}{t.last_body}
                </div>
                <div className="text-[10px] text-muted-foreground">{new Date(t.last_at).toLocaleString()}</div>
              </button>
            ))}
          </div>
        </Card>

        <Card className="lg:col-span-2 border-border/60 bg-gradient-card p-3 flex flex-col">
          {!active ? (
            <div className="flex h-[60vh] items-center justify-center text-sm text-muted-foreground">
              Select a thread to read or reply.
            </div>
          ) : (
            <>
              <div className="border-b border-border/60 pb-2 mb-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-medium">{active.display_name ?? active.email}</div>
                    <div className="text-xs text-muted-foreground">{active.email}</div>
                  </div>
                  {closedAt ? (
                    <Button variant="outline" size="sm" onClick={reopenThread}>
                      <Unlock className="mr-1 h-4 w-4" /> Reopen
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" onClick={closeThread}>
                      <Lock className="mr-1 h-4 w-4" /> Close
                    </Button>
                  )}
                </div>
              </div>
              <div ref={scroller} className="flex-1 max-h-[50vh] overflow-y-auto space-y-2 p-1">
                {msgs.map((m) => (
                  <div key={m.id} className={`flex ${m.sender_is_admin ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                      m.sender_is_admin ? "bg-primary text-primary-foreground" : "bg-muted"
                    }`}>
                      <div className="whitespace-pre-wrap">{m.body}</div>
                      <div className="mt-1 text-[10px] opacity-70">{new Date(m.created_at).toLocaleString()}</div>
                    </div>
                  </div>
                ))}
              </div>
              {closedAt ? (
                <div className="mt-3 flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  <Lock className="h-4 w-4" /> This conversation is closed. Reopen to send a reply.
                </div>
              ) : (
              <div className="mt-3 flex gap-2">
                <Textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(); }}
                  placeholder="Reply… (Ctrl/⌘+Enter)" />
                <Button onClick={send} disabled={sending || !body.trim()} className="shrink-0">
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
              )}
            </>
          )}
        </Card>
      </div>

      <Dialog open={bcastOpen} onOpenChange={setBcastOpen}>
        <DialogContent className="bg-card">
          <DialogHeader>
            <DialogTitle>Broadcast announcement</DialogTitle>
            <DialogDescription>Send a one-time notification to a chosen audience.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Title" value={bcTitle} onChange={(e) => setBcTitle(e.target.value)} />
            <Textarea rows={4} placeholder="Body" value={bcBody} onChange={(e) => setBcBody(e.target.value)} />
            <Select value={bcAudience} onValueChange={setBcAudience}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All users</SelectItem>
                <SelectItem value="sellers">Sellers only</SelectItem>
                <SelectItem value="buyers">Buyers only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBcastOpen(false)} disabled={bcSending}>Cancel</Button>
            <Button onClick={broadcast} disabled={bcSending} className="bg-gradient-brand text-primary-foreground">
              {bcSending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Megaphone className="mr-2 h-4 w-4" /> Send broadcast
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MessagesManager;