import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Pin, PinOff, Trash2, StickyNote } from "lucide-react";
import { toast } from "sonner";

interface Note {
  id: string;
  body: string;
  pinned: boolean;
  author_email: string | null;
  created_at: string;
}

export const AdminUserNotes = ({
  userId, userLabel, open, onOpenChange,
}: {
  userId: string;
  userLabel: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(false);
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { notes } = await api.get<{ notes: Note[] }>(`/api/admin/users/${userId}/notes`);
      setNotes(notes ?? []);
    } catch (e: any) { toast.error(e?.message || "Failed"); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (open) load(); /* eslint-disable-next-line */ }, [open, userId]);

  const save = async () => {
    if (body.trim().length < 2) { toast.error("Note is too short"); return; }
    setSubmitting(true);
    try {
      await api.post(`/api/admin/users/${userId}/notes`, { body: body.trim(), pinned });
      setBody(""); setPinned(false);
      load();
      toast.success("Note saved");
    } catch (e: any) { toast.error(e?.message || "Failed"); }
    finally { setSubmitting(false); }
  };

  const togglePin = async (n: Note) => {
    try {
      await api.put(`/api/admin/users/${userId}/notes/${n.id}`, { pinned: !n.pinned });
      load();
    } catch (e: any) { toast.error(e?.message || "Failed"); }
  };

  const remove = async (n: Note) => {
    if (!confirm("Delete this note?")) return;
    try {
      await api.del(`/api/admin/users/${userId}/notes/${n.id}`);
      load();
    } catch (e: any) { toast.error(e?.message || "Failed"); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <StickyNote className="h-5 w-5 text-primary" /> Notes — {userLabel}
          </DialogTitle>
          <DialogDescription>
            Internal CRM notes visible only to admins. Pin important ones to the top.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)}
            placeholder="e.g. Verified bKash sender on 2026-05-10, fast responder on Telegram." />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
              Pin this note
            </label>
            <Button onClick={save} disabled={submitting} size="sm" className="bg-gradient-brand text-primary-foreground">
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Add note
            </Button>
          </div>
        </div>

        <div className="mt-4 max-h-[50vh] overflow-y-auto space-y-2">
          {loading ? (
            <div className="flex h-20 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : notes.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">No notes yet.</div>
          ) : notes.map((n) => (
            <div key={n.id}
              className={`rounded-md border p-3 ${n.pinned ? "border-primary/40 bg-primary/5" : "border-border/60 bg-background/40"}`}>
              <div className="flex items-start justify-between gap-2">
                <p className="whitespace-pre-wrap text-sm">{n.body}</p>
                <div className="flex shrink-0 gap-1">
                  <Button size="icon" variant="ghost" onClick={() => togglePin(n)} title={n.pinned ? "Unpin" : "Pin"}>
                    {n.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(n)} className="text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div className="mt-2 text-[11px] text-muted-foreground">
                {n.author_email ?? "admin"} · {new Date(n.created_at).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AdminUserNotes;