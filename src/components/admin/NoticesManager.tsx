import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Tabs, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Megaphone, Loader2, Plus, Pin, Trash2, Users, ShoppingBag } from "lucide-react";
import { toast } from "sonner";

type Audience = "all" | "buyer" | "seller";
type Severity = "info" | "warning" | "success";
interface Notice {
  id: string; audience: Audience; severity: Severity;
  title: string; body: string; pinned: boolean; is_active: boolean;
  expires_at: string | null; created_at: string;
}

const SEV_CLASS: Record<Severity, string> = {
  info: "bg-primary/20 text-primary",
  warning: "bg-warning/20 text-warning",
  success: "bg-success/20 text-success",
};
const AUD_ICON: Record<Audience, any> = { all: Megaphone, buyer: ShoppingBag, seller: Users };

export const NoticesManager = () => {
  const [tab, setTab] = useState<Audience | "all_view">("all_view");
  const [list, setList] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);

  const [openNew, setOpenNew] = useState(false);
  const [audience, setAudience] = useState<Audience>("buyer");
  const [severity, setSeverity] = useState<Severity>("info");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const audParam = tab === "all_view" ? undefined : { audience: tab };
      const r = await api.get<{ notices: Notice[] }>("/api/notices/admin", audParam);
      setList(r.notices ?? []);
    } catch (e: any) { toast.error(e?.message || "Failed"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tab]);

  const create = async () => {
    if (title.trim().length < 2 || body.trim().length < 2) {
      toast.error("Title and body are required");
      return;
    }
    setCreating(true);
    try {
      await api.post("/api/notices/admin", {
        audience, severity, title: title.trim(), body: body.trim(),
        pinned, expires_at: expiresAt || null,
      });
      toast.success("Notice published");
      setOpenNew(false);
      setTitle(""); setBody(""); setPinned(false); setExpiresAt("");
      load();
    } catch (e: any) { toast.error(e?.message || "Failed"); }
    finally { setCreating(false); }
  };

  const toggle = async (n: Notice, field: "is_active" | "pinned", value: boolean) => {
    try {
      await api.patch(`/api/notices/admin/${n.id}`, { [field]: value });
      load();
    } catch (e: any) { toast.error(e?.message || "Failed"); }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this notice?")) return;
    try {
      await api.del(`/api/notices/admin/${id}`);
      toast.success("Deleted");
      load();
    } catch (e: any) { toast.error(e?.message || "Failed"); }
  };

  return (
    <Card className="border-border/60 bg-gradient-card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-primary" />
          <h3 className="font-display text-lg font-semibold">Notices</h3>
          <p className="ml-3 hidden text-xs text-muted-foreground sm:block">
            Standing announcements shown on the buyer or seller dashboard.
          </p>
        </div>
        <Dialog open={openNew} onOpenChange={setOpenNew}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-gradient-brand text-primary-foreground">
              <Plus className="mr-1 h-4 w-4" /> New notice
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create a notice</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">Audience</label>
                  <Select value={audience} onValueChange={(v) => setAudience(v as Audience)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="buyer">Buyers only</SelectItem>
                      <SelectItem value="seller">Sellers only</SelectItem>
                      <SelectItem value="all">Everyone</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">Severity</label>
                  <Select value={severity} onValueChange={(v) => setSeverity(v as Severity)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="info">Info</SelectItem>
                      <SelectItem value="warning">Warning</SelectItem>
                      <SelectItem value="success">Success</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">Title</label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} />
              </div>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">Body</label>
                <Textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 items-end gap-3">
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">Expires (optional)</label>
                  <Input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
                </div>
                <div className="flex items-center gap-2 pb-2">
                  <Switch checked={pinned} onCheckedChange={setPinned} />
                  <span className="text-sm">Pin (cannot be dismissed)</span>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpenNew(false)}>Cancel</Button>
              <Button onClick={create} disabled={creating}>
                {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Publish
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="all_view">All</TabsTrigger>
          <TabsTrigger value="buyer">Buyers</TabsTrigger>
          <TabsTrigger value="seller">Sellers</TabsTrigger>
          <TabsTrigger value="all">Everyone</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="mt-4">
        {loading ? (
          <div className="flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : list.length === 0 ? (
          <p className="rounded-md border border-dashed border-border/60 p-4 text-center text-sm text-muted-foreground">
            No notices.
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {list.map((n) => {
              const AudIcon = AUD_ICON[n.audience];
              return (
                <li key={n.id} className="flex items-start gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={SEV_CLASS[n.severity]}>{n.severity}</Badge>
                      <span className="inline-flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
                        <AudIcon className="h-3 w-3" /> {n.audience}
                      </span>
                      {n.pinned && <Pin className="h-3 w-3 text-primary" />}
                      <span className="text-sm font-medium">{n.title}</span>
                    </div>
                    <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{n.body}</div>
                    <div className="mt-1 text-[10px] text-muted-foreground">
                      {new Date(n.created_at).toLocaleString()}
                      {n.expires_at && ` · expires ${new Date(n.expires_at).toLocaleString()}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      Active
                      <Switch checked={n.is_active} onCheckedChange={(v) => toggle(n, "is_active", v)} />
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      Pin
                      <Switch checked={n.pinned} onCheckedChange={(v) => toggle(n, "pinned", v)} />
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => remove(n.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
};

export default NoticesManager;
