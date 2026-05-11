import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send, MessagesSquare, Lock } from "lucide-react";
import { toast } from "sonner";

interface Msg {
  id: string;
  sender_is_admin: boolean;
  body: string;
  created_at: string;
}

export const MessagesPanel = () => {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [closedAt, setClosedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      const r = await api.get<{ messages: Msg[]; closed_at: string | null }>("/api/messages/me");
      setMsgs(r.messages ?? []);
      setClosedAt(r.closed_at);
      api.post("/api/messages/me/read").catch(() => {});
    } catch (e: any) { toast.error(e?.message || "Failed"); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => { scroller.current?.scrollTo(0, 1e9); }, [msgs.length]);

  const send = async () => {
    if (!body.trim()) return;
    setSending(true);
    try {
      await api.post("/api/messages/me", { body: body.trim() });
      setBody("");
      load();
    } catch (e: any) { toast.error(e?.message || "Failed"); }
    finally { setSending(false); }
  };

  return (
    <Card className="border-border/60 bg-gradient-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <MessagesSquare className="h-5 w-5 text-primary" />
        <h3 className="font-display text-lg font-semibold">Messages with admin</h3>
      </div>
      <div ref={scroller} className="h-72 overflow-y-auto rounded-md border border-border/60 bg-background/40 p-3 space-y-2">
        {loading ? (
          <div className="flex h-full items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : msgs.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No messages yet — say hello.</div>
        ) : msgs.map((m) => (
          <div key={m.id} className={`flex ${m.sender_is_admin ? "justify-start" : "justify-end"}`}>
            <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
              m.sender_is_admin ? "bg-muted text-foreground" : "bg-primary text-primary-foreground"
            }`}>
              <div className="whitespace-pre-wrap">{m.body}</div>
              <div className="mt-1 text-[10px] opacity-70">{new Date(m.created_at).toLocaleString()}</div>
            </div>
          </div>
        ))}
      </div>
      {closedAt ? (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <Lock className="h-4 w-4" /> Admin closed this conversation.
        </div>
      ) : (
      <div className="mt-3 flex gap-2">
        <Textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(); }}
          placeholder="Write a message… (Ctrl/⌘ + Enter to send)" />
        <Button onClick={send} disabled={sending || !body.trim()} className="shrink-0">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
      )}
    </Card>
  );
};

export default MessagesPanel;